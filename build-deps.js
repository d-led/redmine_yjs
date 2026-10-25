#!/usr/bin/env node
/**
 * Build script for the browser assets that are checked into assets/javascripts.
 *
 *   src/deps-entry.js -> assets/javascripts/yjs-deps.bundle.js  (Yjs + Hocuspocus client)
 *   src/merge.js      -> assets/javascripts/yjs-merge.js        (RedmineYjsMerge.mergeSavedContent)
 */

import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'assets/javascripts');

const builds = [
  {
    label: 'Yjs dependencies',
    options: {
      entryPoints: [path.join(__dirname, 'src/deps-entry.js')],
      outfile: path.join(outputDir, 'yjs-deps.bundle.js'),
      format: 'iife',
      globalName: 'YjsDeps',
      minify: true,
      target: ['es2017'],
      define: { 'process.env.NODE_ENV': '"production"' }
    }
  },
  {
    label: 'merge helpers',
    options: {
      entryPoints: [path.join(__dirname, 'src/merge.js')],
      outfile: path.join(outputDir, 'yjs-merge.js'),
      format: 'iife',
      globalName: 'RedmineYjsMerge',
      target: ['es2017']
    }
  }
];

for (const { label, options } of builds) {
  console.log(`[Build] Bundling ${label}...`);
  await esbuild.build({ ...options, bundle: true, platform: 'browser', logLevel: 'warning' });

  const { size } = fs.statSync(options.outfile);
  console.log(`[Build] ✓ ${path.basename(options.outfile)} (${(size / 1024).toFixed(2)} KB)`);
}

