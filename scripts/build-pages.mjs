import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from '../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/lib/main.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'github-pages-dist');
const bundle = resolve(output, 'luma.js');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

buildSync({
  entryPoints: [resolve(root, 'github-pages/main.tsx')],
  bundle: true,
  minify: true,
  jsx: 'automatic',
  outfile: bundle,
});

const script = readFileSync(bundle, 'utf8').replaceAll('</script', '<\\/script');
const styles = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
  .replace("@import 'tailwindcss';", '')
  .replaceAll('</style', '<\\/style');

writeFileSync(resolve(output, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Luma · 人生操作系统</title>
  <meta name="description" content="一个帮你整理任务、习惯与目标的清爽个人仪表盘。" />
  <meta property="og:title" content="Luma · 人生操作系统" />
  <meta property="og:description" content="把重要的事，放进自己的节奏里。" />
  <meta property="og:image" content="https://power0623.github.io/Hello/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="./favicon.svg" />
  <style>${styles}</style>
</head>
<body><div id="root"></div><script>${script}</script></body>
</html>`);

rmSync(bundle);
cpSync(resolve(root, 'public/og.png'), resolve(output, 'og.png'));
cpSync(resolve(root, 'public/favicon.svg'), resolve(output, 'favicon.svg'));
writeFileSync(resolve(output, '.nojekyll'), '');
cpSync(resolve(root, 'public/luma-config.json'), resolve(output, 'luma-config.json'));

console.log('GitHub Pages build ready.');
