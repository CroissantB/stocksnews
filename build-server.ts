import * as esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/server.mjs',
  external: ['express', 'cors', 'yahoo-finance2', 'googleapis', 'dotenv', 'esbuild', 'vite'],
  format: 'esm',
}).catch(() => process.exit(1));
