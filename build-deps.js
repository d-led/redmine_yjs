#!/usr/bin/env node
/**
 * Build script to bundle Yjs dependencies using esbuild
 * This creates a bundled file that can be used instead of CDN
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, 'assets/javascripts');
const outputFile = path.join(outputDir, 'yjs-deps.bundle.js');

console.log('[Build] Bundling Yjs dependencies...');

esbuild.build({
  entryPoints: [path.join(__dirname, 'src/deps-entry.js')],
  bundle: true,
  outfile: outputFile,
  format: 'iife',
  globalName: 'YjsDeps',
  platform: 'browser',
  minify: true,
  target: ['es2017'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log('[Build] ✓ Dependencies bundled successfully');
  console.log(`[Build] Output: ${outputFile}`);
  const stats = fs.statSync(outputFile);
  console.log(`[Build] Size: ${(stats.size / 1024).toFixed(2)} KB`);
}).catch((error) => {
  console.error('[Build] ✗ Build failed:', error);
  process.exit(1);
});

