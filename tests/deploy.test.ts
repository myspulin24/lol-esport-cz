import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { assertTarget, deploy, DeployGuardError, MANIFEST_NAME, phaseOf, planDeploy, type FtpLike } from '../pipeline/deploy';

const ROOT = '/subdoms/lol';

/** Falešný FTP server v paměti. */
class FakeFtp implements FtpLike {
  files = new Map<string, Buffer>();
  ops: string[] = [];
  /** cesta, jejíž nahrání selže (simulace výpadku spojení) */
  failOn?: string;
  /** server neumí přejmenovat na existující soubor */
  noOverwriteRename = false;

  async ensureDir(dir: string) {
    this.ops.push(`mkdir ${dir}`);
  }
  async uploadFrom(source: Readable | string, to: string) {
    if (this.failOn && to.startsWith(this.failOn + '.tmp-')) throw new Error('spojení spadlo');
    let buf: Buffer;
    if (typeof source === 'string') buf = await readFile(source);
    else {
      const chunks: Buffer[] = [];
      for await (const c of source) chunks.push(Buffer.from(c as string));
      buf = Buffer.concat(chunks);
    }
    this.files.set(to, buf);
    this.ops.push(`put ${to}`);
  }
  async downloadTo(dest: Writable, from: string) {
    const b = this.files.get(from);
    if (!b) throw new Error('550 not found');
    await new Promise<void>((r) => dest.end(b, () => r()));
  }
  async rename(a: string, b: string) {
    if (!this.files.has(a)) throw new Error('550');
    if (this.noOverwriteRename && this.files.has(b)) throw new Error('553 exists');
    this.files.set(b, this.files.get(a)!);
    this.files.delete(a);
    this.ops.push(`mv ${b}`);
  }
  async remove(p: string) {
    if (!this.files.has(p)) throw new Error('550');
    this.files.delete(p);
    this.ops.push(`rm ${p}`);
  }
  manifest(): Record<string, string> {
    return JSON.parse(this.files.get(`${ROOT}/${MANIFEST_NAME}`)!.toString('utf8'));
  }
  /** pořadí, ve kterém se soubory webu objevily pod finálním jménem */
  published(): string[] {
    return this.ops.filter((o) => o.startsWith('mv ') && !o.endsWith(MANIFEST_NAME)).map((o) => o.slice(3 + ROOT.length + 1));
  }
}

let dir: string;
const put = async (rel: string, content: string) => {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content);
};
const site = async (extra = 0) => {
  await put('index.html', '<h1>ahoj</h1>');
  await put('vysledky/index.html', 'vysledky');
  await put('_astro/app.abc123.js', 'js');
  await put('_astro/app.abc123.css', 'css');
  await put('data/schedule/lec.json', '[]');
  await put('data/meta.json', '{"buildId":"1"}');
  await put('ics/liga-lec.ics', 'BEGIN:VCALENDAR');
  await put('.htaccess', 'Options -Indexes');
  for (let i = 0; i < extra; i++) await put(`tym/t${i}/index.html`, `tym ${i}`);
};
const run = (client: FakeFtp, o: Partial<Parameters<typeof deploy>[0]> = {}) => deploy({ client, localDir: dir, remoteDir: ROOT, tmpSuffix: () => 'x', ...o });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lol-deploy-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('pořadí a plán', () => {
  it('statické soubory → data → stránky → meta.json', () => {
    expect(['data/meta.json', 'index.html', 'data/x.json', '_astro/a.js', '.htaccess', 'ics/a.ics'].sort((a, b) => phaseOf(a) - phaseOf(b))).toEqual([
      '_astro/a.js',
      '.htaccess',
      'data/x.json',
      'index.html',
      'ics/a.ics',
      'data/meta.json',
    ]);
  });
  it('nahrává jen změněné a maže jen soubory z minulého manifestu', () => {
    expect(planDeploy({ a: '1', b: '2' }, { a: '1', b: 'old', c: '3' })).toEqual({ upload: ['b'], remove: ['c'] });
  });
  it('cílová složka musí být povolená', () => {
    expect(assertTarget('/subdoms/lol/')).toBe('/subdoms/lol');
    expect(() => assertTarget('/subdoms')).toThrow(DeployGuardError); // sousední subdomény
    expect(() => assertTarget('/www/subdom/lol')).toThrow(DeployGuardError);
    expect(() => assertTarget('/www')).toThrow(DeployGuardError);
    expect(() => assertTarget('/')).toThrow(DeployGuardError);
  });
});

describe('deploy s falešným FTP', () => {
  it('první nasazení: vše nahraje ve správném pořadí, meta.json poslední, bez dočasných souborů', async () => {
    await site();
    const ftp = new FakeFtp();
    const res = await run(ftp);
    expect(res).toMatchObject({ status: 'complete', uploaded: 8, removed: 0 });
    const order = ftp.published();
    expect(order.at(-1)).toBe('data/meta.json');
    expect(order.indexOf('_astro/app.abc123.js')).toBeLessThan(order.indexOf('data/schedule/lec.json'));
    expect(order.indexOf('data/schedule/lec.json')).toBeLessThan(order.indexOf('index.html'));
    expect([...ftp.files.keys()].some((k) => k.includes('.tmp-'))).toBe(false);
    expect(Object.keys(ftp.manifest())).toHaveLength(8);
    expect(ftp.files.get(`${ROOT}/index.html`)!.toString()).toBe('<h1>ahoj</h1>');
  });

  it('druhé nasazení beze změn nic nenahrává; změněný soubor se nahraje sám', async () => {
    await site();
    const ftp = new FakeFtp();
    await run(ftp);
    expect((await run(ftp)).status).toBe('unchanged');
    await put('data/meta.json', '{"buildId":"2"}');
    ftp.ops = [];
    const res = await run(ftp);
    expect(res.uploaded).toBe(1);
    expect(ftp.published()).toEqual(['data/meta.json']);
  });

  it('smaže soubor, který z buildu zmizel, ale cizí soubor na serveru nechá', async () => {
    await site(30);
    const ftp = new FakeFtp();
    ftp.files.set(`${ROOT}/cizi-soubor.txt`, Buffer.from('nesahat'));
    await run(ftp);
    await rm(join(dir, 'tym', 't0'), { recursive: true });
    const res = await run(ftp);
    expect(res.removed).toBe(1);
    expect(ftp.files.has(`${ROOT}/tym/t0/index.html`)).toBe(false);
    expect(ftp.files.has(`${ROOT}/cizi-soubor.txt`)).toBe(true);
    expect(ftp.manifest()['tym/t0/index.html']).toBeUndefined();
  });

  it('pojistka 80 %: výrazně menší build se nenasadí, dokud to člověk nepovolí', async () => {
    await site(30);
    const ftp = new FakeFtp();
    await run(ftp);
    await rm(join(dir, 'tym'), { recursive: true });
    ftp.ops = [];
    await expect(run(ftp)).rejects.toThrow(/deploy se zastavil/);
    expect(ftp.ops.filter((o) => o.startsWith('rm '))).toEqual([]);
    const res = await run(ftp, { allowShrink: true });
    expect(res.removed).toBe(30);
  });

  it('build bez index.html nebo meta.json se nenasadí', async () => {
    await put('vysledky/index.html', 'x');
    await expect(run(new FakeFtp())).rejects.toThrow(DeployGuardError);
  });

  it('časový rozpočet: skončí po dávce a další běh dorovná jen zbytek', async () => {
    await site(10); // 18 souborů
    const ftp = new FakeFtp();
    let t = 0;
    const clock = () => t;
    const log: string[] = [];
    // každá dávka „trvá“ 4 minuty → po dvou dávkách (8 min) je rozpočet 7 min vyčerpaný
    const first = await run(ftp, { batchSize: 5, clock, log: (m) => (log.push(m), (t += 4 * 60_000)) });
    expect(first.status).toBe('partial');
    expect(first.uploaded).toBe(10);
    expect(ftp.files.has(`${ROOT}/data/meta.json`)).toBe(false); // meta.json jde vždy poslední
    const done = Object.values(ftp.manifest()).filter(Boolean).length;
    expect(done).toBe(10);
    ftp.ops = [];
    const second = await run(ftp, { batchSize: 5 });
    expect(second).toMatchObject({ status: 'complete', uploaded: 8 });
  });

  it('výpadek uprostřed dávky: rozpracované soubory se příště nahrají znovu, hotové dávky ne', async () => {
    await site(10);
    const ftp = new FakeFtp();
    ftp.failOn = `${ROOT}/index.html`;
    await expect(run(ftp, { batchSize: 5 })).rejects.toThrow(/spojení spadlo/);
    const m = ftp.manifest();
    expect(m['index.html']).toBe('');
    const committed = Object.entries(m).filter(([, v]) => v).map(([k]) => k);
    expect(committed.length).toBeGreaterThan(0);
    ftp.failOn = undefined;
    ftp.ops = [];
    const res = await run(ftp, { batchSize: 5 });
    expect(res.status).toBe('complete');
    for (const k of committed) expect(ftp.published()).not.toContain(k);
    expect(ftp.published()).toContain('index.html');
  });

  it('server, který neumí přepsat soubor přejmenováním: smaže cíl a přejmenuje znovu', async () => {
    await site();
    const ftp = new FakeFtp();
    ftp.noOverwriteRename = true;
    await run(ftp);
    await put('index.html', '<h1>nové</h1>');
    const res = await run(ftp);
    expect(res.status).toBe('complete');
    expect(ftp.files.get(`${ROOT}/index.html`)!.toString()).toBe('<h1>nové</h1>');
  });
});
