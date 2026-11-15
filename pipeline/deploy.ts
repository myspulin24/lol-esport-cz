// Nasazení hotového webu (dist/) na Forpsi přes FTPS (D7: basic-ftp).
//
// Pravidla z eng review:
// - posílají se jen změněné soubory: manifest SHA-256 lokálně vs. manifest uložený na serveru,
// - pořadí: statické soubory (_astro, fonty) → data/ → HTML a ostatní → data/meta.json → manifest,
//   takže stránka nikdy neukazuje na soubor, který na serveru ještě není, a meta.json (buildId) jde poslední,
// - dávky po 100 souborech; před dávkou se její soubory v serverovém manifestu označí jako rozpracované,
//   po dávce se zapíšou jejich hashe → přerušený běh příště dorovná přesně to, co chybí,
// - časový rozpočet 7 min (běh pipeline má limit 12 min); po vypršení se skončí po dávce a zbytek dojede příště,
// - každý soubor se nahraje pod dočasným jménem a přejmenuje (na serverech, které neumí přepsat cíl, smazat + přejmenovat),
// - cílová složka je natvrdo povolená (ALLOWED_TARGETS), aby překlep v nastavení nesmazal jiný web,
// - mazání starých souborů jen podle serverového manifestu (cizí soubory se nikdy nemažou) a jen když nový build
//   nemá méně než 80 % souborů toho minulého (rozbitý build nesmí vymazat web).

import { createHash, randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Readable, Writable } from 'node:stream';

/** Podmnožina basic-ftp Client, kterou deploy používá (v testech se podstrčí falešný klient). */
export interface FtpLike {
  ensureDir(remoteDirPath: string): Promise<void>;
  uploadFrom(source: Readable | string, toRemotePath: string): Promise<unknown>;
  downloadTo(destination: Writable | string, fromRemotePath: string): Promise<unknown>;
  rename(srcPath: string, destPath: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}

/** relativní cesta (s lomítky) → sha256; prázdný řetězec = soubor se právě nahrává */
export type Manifest = Record<string, string>;

/** Složky na FTP, do kterých smí deploy zapisovat. Jiná hodnota FTP_DIR = chyba (ochrana před překlepem). */
// Subdoména lol.godmike.cz leží na Forpsi ve složce /subdoms/lol (ověřeno přes FTP). Ve /www běží hlavní web godmike.cz.
export const ALLOWED_TARGETS = ['/subdoms/lol', '/subdoms/lol/'];
export const MANIFEST_NAME = '.deploy-manifest.json';
export const BATCH_SIZE = 100;
export const DEPLOY_BUDGET_MS = 7 * 60_000;
export const SHRINK_GUARD = 0.8;

export class DeployGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeployGuardError';
  }
}

export interface DeployOptions {
  client: FtpLike;
  localDir: string;
  remoteDir: string;
  budgetMs?: number;
  batchSize?: number;
  /** Dovolí nasadit build, který je o víc než 20 % menší než ten minulý (ruční zásah). */
  allowShrink?: boolean;
  clock?: () => number;
  log?: (msg: string) => void;
  tmpSuffix?: () => string;
}

export interface DeployResult {
  status: 'complete' | 'partial' | 'unchanged';
  uploaded: number;
  removed: number;
  remaining: number;
  total: number;
}

export function assertTarget(remoteDir: string): string {
  const dir = remoteDir.trim();
  if (!ALLOWED_TARGETS.includes(dir)) {
    throw new DeployGuardError(
      `Cílová složka „${dir}“ není povolená. Povolené: ${ALLOWED_TARGETS.join(', ')}. Změňte ALLOWED_TARGETS v pipeline/deploy.ts, pokud web opravdu leží jinde.`,
    );
  }
  return dir.replace(/\/+$/, '');
}

async function walk(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out);
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export async function buildManifest(localDir: string): Promise<Manifest> {
  const files = (await walk(localDir)).filter((f) => f !== MANIFEST_NAME && !/\.tmp-[^/]*$/.test(f)).sort();
  const out: Manifest = {};
  for (const f of files) out[f] = createHash('sha256').update(await readFile(join(localDir, f))).digest('hex');
  return out;
}

/**
 * 0 = statické soubory a konfigurace serveru, 1 = data, 2 = stránky a ostatní,
 * 3 = service worker (ukládá si styly, skripty a stránky, které už na serveru musí být), 4 = data/meta.json
 */
export function phaseOf(path: string): number {
  if (path === 'data/meta.json') return 4;
  if (path === 'sw.js') return 3;
  if (path.startsWith('data/')) return 1;
  if (path.endsWith('.html') || path.endsWith('.ics')) return 2;
  return 0;
}

export interface DeployPlan {
  upload: string[];
  remove: string[];
}

export function planDeploy(local: Manifest, remote: Manifest): DeployPlan {
  const upload = Object.keys(local)
    .filter((p) => remote[p] !== local[p])
    .sort((a, b) => phaseOf(a) - phaseOf(b) || a.localeCompare(b));
  const remove = Object.keys(remote)
    .filter((p) => !(p in local))
    .sort();
  return { upload, remove };
}

/** Pojistka proti rozbitému buildu: nový build nesmí mít méně než 80 % souborů posledního nasazení. */
export function shrinkGuard(local: Manifest, remote: Manifest): string | undefined {
  const before = Object.keys(remote).length;
  const after = Object.keys(local).length;
  if (before >= 20 && after < before * SHRINK_GUARD) {
    return `Nový build má ${after} souborů, poslední nasazení ${before}. To je pokles o víc než ${Math.round((1 - SHRINK_GUARD) * 100)} %, deploy se zastavil, aby rozbitý build nesmazal web.`;
  }
  return undefined;
}

async function readRemoteManifest(client: FtpLike, path: string): Promise<Manifest> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  try {
    await client.downloadTo(sink, path);
  } catch {
    return {}; // první nasazení (nebo manifest nejde přečíst) → vše se nahraje, nic se nemaže
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Manifest = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

async function putAtomic(client: FtpLike, source: () => Readable | string, remotePath: string, tmpSuffix: () => string): Promise<void> {
  const tmp = `${remotePath}.tmp-${tmpSuffix()}`;
  await client.uploadFrom(source(), tmp);
  try {
    await client.rename(tmp, remotePath);
  } catch {
    // Některé servery neumí přejmenovat na existující soubor: smazat cíl a zkusit znovu.
    try {
      await client.remove(remotePath);
    } catch {
      /* cíl neexistoval */
    }
    await client.rename(tmp, remotePath);
  }
}

export async function deploy(o: DeployOptions): Promise<DeployResult> {
  const root = assertTarget(o.remoteDir);
  const clock = o.clock ?? Date.now;
  const log = o.log ?? (() => {});
  const budget = o.budgetMs ?? DEPLOY_BUDGET_MS;
  const batchSize = o.batchSize ?? BATCH_SIZE;
  const tmpSuffix = o.tmpSuffix ?? (() => randomBytes(4).toString('hex'));
  const started = clock();
  const remotePath = (rel: string) => `${root}/${rel}`;
  const manifestPath = remotePath(MANIFEST_NAME);

  const local = await buildManifest(o.localDir);
  if (!local['index.html'] || !local['data/meta.json']) {
    throw new DeployGuardError('V buildu chybí index.html nebo data/meta.json; deploy se nespustil.');
  }
  const remote = await readRemoteManifest(o.client, manifestPath);
  const shrink = shrinkGuard(local, remote);
  if (shrink && !o.allowShrink) throw new DeployGuardError(shrink);

  const plan = planDeploy(local, remote);
  const total = plan.upload.length;
  if (!total && !plan.remove.length) {
    log('Na serveru je už aktuální verze, není co nahrávat.');
    return { status: 'unchanged', uploaded: 0, removed: 0, remaining: 0, total: 0 };
  }

  const state: Manifest = { ...remote };
  const commit = () => putAtomic(o.client, () => Readable.from([JSON.stringify(state)]), manifestPath, tmpSuffix);
  const dirs = new Set<string>();
  let uploaded = 0;

  await o.client.ensureDir(root);
  dirs.add(root);
  for (let i = 0; i < plan.upload.length; i += batchSize) {
    if (clock() - started > budget) {
      await commit();
      const remaining = total - uploaded;
      log(`Časový rozpočet vypršel: nahráno ${uploaded} z ${total}, zbytek (${remaining}) dojede při dalším běhu.`);
      return { status: 'partial', uploaded, removed: 0, remaining, total };
    }
    const batch = plan.upload.slice(i, i + batchSize);
    for (const rel of batch) state[rel] = '';
    await commit(); // „rozpracováno“: po pádu uprostřed dávky se tyto soubory nahrají znovu
    for (const rel of batch) {
      const dir = remotePath(rel).replace(/\/[^/]*$/, '');
      if (!dirs.has(dir)) {
        await o.client.ensureDir(dir);
        dirs.add(dir);
      }
      await putAtomic(o.client, () => join(o.localDir, ...rel.split('/')), remotePath(rel), tmpSuffix);
      state[rel] = local[rel];
      uploaded++;
    }
    await commit();
    log(`Nahráno ${uploaded}/${total}`);
  }

  let removed = 0;
  for (const rel of plan.remove) {
    try {
      await o.client.remove(remotePath(rel));
    } catch {
      /* už neexistuje */
    }
    delete state[rel];
    removed++;
  }
  if (removed) await commit();
  log(`Hotovo: nahráno ${uploaded}, smazáno ${removed} starých souborů.`);
  return { status: 'complete', uploaded, removed, remaining: 0, total };
}

export interface DeployPreview {
  upload: number;
  remove: number;
  /** na serveru není manifest z dřívějšího nasazení */
  firstDeploy: boolean;
  /** důvod, proč by pojistka proti rozbitému buildu deploy zastavila */
  shrink?: string;
}

/** Co by deploy udělal, bez jakéhokoli zápisu na server (npm run deploy -- --check). */
export async function previewDeploy(o: { client: FtpLike; localDir: string; remoteDir: string }): Promise<DeployPreview> {
  const root = assertTarget(o.remoteDir);
  const local = await buildManifest(o.localDir);
  const remote = await readRemoteManifest(o.client, `${root}/${MANIFEST_NAME}`);
  const plan = planDeploy(local, remote);
  return { upload: plan.upload.length, remove: plan.remove.length, firstDeploy: Object.keys(remote).length === 0, shrink: shrinkGuard(local, remote) };
}
