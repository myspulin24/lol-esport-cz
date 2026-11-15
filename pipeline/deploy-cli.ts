// npm run deploy — nahraje dist/ na Forpsi. Přístupy jen z proměnných prostředí (v GitHub Actions ze Secrets):
//   FTP_HOST      např. ftpx.forpsi.com
//   FTP_USER      FTP uživatel z administrace Forpsi
//   FTP_PASSWORD  heslo (nikdy do repozitáře)
//   FTP_PORT      volitelně, výchozí 21
//   FTP_DIR       cílová složka, výchozí /subdoms/lol (musí být v ALLOWED_TARGETS)
//   FTP_INSECURE=1  jen pro ladění: bez TLS (Forpsi FTPS umí, nechte vypnuté)
//   DEPLOY_ALLOW_SHRINK=1  ručně povolí nasadit výrazně menší build
//   HC_DEPLOY     volitelná adresa healthchecks.io (ping po úspěchu, /fail po chybě)

//
// npm run deploy -- --check   jen se podívá: vypíše obsah cílové složky a co by se nahrálo. Na serveru nic nezmění.

import { Client } from 'basic-ftp';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploy, DeployGuardError, MANIFEST_NAME, previewDeploy } from './deploy';

/** Kontrola před nasazením: co je v cílové složce a co by deploy udělal. Nic nezapisuje. */
async function check(client: Client, remoteDir: string, localDir: string): Promise<void> {
  const target = remoteDir.replace(/\/+$/, '');
  const parent = target.replace(/\/[^/]+$/, '') || '/';
  const show = async (dir: string) => {
    try {
      const list = await client.list(dir);
      console.log(`\nObsah ${dir} (${list.length} položek):`);
      for (const f of list.slice(0, 60)) console.log(`  ${f.isDirectory ? 'složka ' : 'soubor '} ${f.name}${f.isDirectory ? '/' : `  (${f.size} B)`}`);
      if (list.length > 60) console.log(`  … a dalších ${list.length - 60}`);
      return list;
    } catch (err) {
      console.log(`\nSložku ${dir} nejde vypsat: ${(err as Error).message}`);
      return undefined;
    }
  };
  await show(parent);
  const existing = await show(target);
  if (!existing) {
    console.log('\nCílová složka neexistuje nebo k ní není přístup. Deploy by ji vytvořil; nejdřív ověřte, že je to správné místo.');
    return;
  }
  const plan = await previewDeploy({ client, localDir, remoteDir });
  const ours = new Set(await readdir(localDir));
  const names = existing.map((f) => f.name).filter((n) => n !== MANIFEST_NAME);
  console.log(`\nPlán: nahrát ${plan.upload} souborů, smazat ${plan.remove} starých (jen ty, které dřív nahrál tento deploy).`);
  if (plan.firstDeploy) {
    const clash = names.filter((n) => ours.has(n));
    const foreign = names.filter((n) => !ours.has(n));
    console.log('První nasazení do této složky (žádný manifest z minula).');
    if (clash.length) console.log(`POZOR, tyto položky už ve složce jsou a deploy by je přepsal nebo doplnil: ${clash.join(', ')}`);
    if (foreign.length) console.log(`Cizí položky, kterých se deploy nedotkne: ${foreign.join(', ')}`);
    if (!names.length) console.log('Složka je prázdná.');
  }
  if (plan.shrink) console.log(`Pojistka: ${plan.shrink}`);
}

async function ping(url: string | undefined, suffix = ''): Promise<void> {
  if (!url) return;
  try {
    await fetch(url + suffix, { signal: AbortSignal.timeout(10_000) });
  } catch {
    /* monitoring nesmí shodit deploy */
  }
}

async function run(): Promise<number> {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const remoteDir = process.env.FTP_DIR || '/subdoms/lol';
  if (!host || !user || !password) {
    console.error('Chybí FTP_HOST, FTP_USER nebo FTP_PASSWORD. Nastavte je v GitHub → Settings → Secrets and variables → Actions.');
    return 1;
  }
  const client = new Client(60_000);
  try {
    await client.access({ host, port: Number(process.env.FTP_PORT) || 21, user, password, secure: process.env.FTP_INSECURE !== '1' });
    if (process.argv.includes('--check')) {
      console.log('Připojení k FTP funguje (šifrovaně).');
      await check(client, remoteDir, resolve('dist'));
      return 0;
    }
    const res = await deploy({
      client,
      localDir: resolve('dist'),
      remoteDir,
      allowShrink: process.env.DEPLOY_ALLOW_SHRINK === '1',
      log: (m) => console.log(m),
    });
    console.log(`Deploy: ${res.status} (nahráno ${res.uploaded}/${res.total}, smazáno ${res.removed}, zbývá ${res.remaining})`);
    await ping(process.env.HC_DEPLOY);
    return 0;
  } catch (err) {
    const msg = err instanceof DeployGuardError ? err.message : `Deploy selhal: ${(err as Error).message}`;
    console.error(msg);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Deploy::${msg.replace(/\r?\n/g, ' ')}`);
    await ping(process.env.HC_DEPLOY, '/fail');
    return 1;
  } finally {
    client.close();
  }
}

run().then((code) => {
  process.exitCode = code;
});
