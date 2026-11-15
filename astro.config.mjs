import { defineConfig } from 'astro/config';

// Statický web: build běží na GitHubu (nebo lokálně), Forpsi jen servíruje soubory z dist/.
export default defineConfig({
  site: 'https://lol.godmike.cz',
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // ostatní prohlížeče: stažení stránky dopředu po najetí na odkaz
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
