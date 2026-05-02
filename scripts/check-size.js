'use strict';

const fs   = require('fs');
const path = require('path');

const SKIP    = new Set(['node_modules', '.git', '.cache']);
const MAX_KB  = 1024;
const MAX_B   = MAX_KB * 1024;

let totalBytes = 0;

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIP.has(entry.name)) {
      walk(full);
    } else if (entry.isFile()) {
      totalBytes += fs.statSync(full).size;
    }
  }
}(path.resolve(__dirname, '..')));

const kb  = (totalBytes / 1024).toFixed(1);
const ok  = totalBytes <= MAX_B;
const bar = '█'.repeat(Math.min(40, Math.round((totalBytes / MAX_B) * 40)));
const pct = ((totalBytes / MAX_B) * 100).toFixed(1);

console.log('');
console.log(`  Repo size check`);
console.log(`  [${ bar.padEnd(40) }] ${ pct }%`);
console.log(`  ${ ok ? '✓ PASS' : '✗ FAIL' }  ${ kb } KB used / ${ MAX_KB } KB limit`);
console.log('');

process.exit(ok ? 0 : 1);
