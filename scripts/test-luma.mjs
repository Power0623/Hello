import { buildSync } from '../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/lib/main.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const temporary = mkdtempSync(join(tmpdir(), 'luma-tests-'));
try {
  const file = join(temporary, 'luma.test.cjs');
  buildSync({entryPoints:['tests/luma.test.ts'],bundle:true,platform:'node',format:'cjs',outfile:file});
  const result = spawnSync(process.execPath, ['--test',file], {stdio:'inherit'});
  process.exitCode = result.status ?? 1;
} finally { rmSync(temporary, {recursive:true,force:true}); }
