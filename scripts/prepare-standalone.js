#!/usr/bin/env node
/**
 * Next.js `output: 'standalone'` intentionally omits `.next/static` and
 * `public/` from the standalone bundle (they are normally served by a CDN).
 * For the Electron build the embedded server must serve them itself, so copy
 * them next to the generated server.js.
 *
 * Handles both layouts Next emits:
 *   .next/standalone/server.js                 (single-package repo)
 *   .next/standalone/apps/web/server.js        (monorepo, workspace root traced)
 */
const fs = require('fs');
const path = require('path');

const webRoot = path.join(__dirname, '..');
const standaloneRoot = path.join(webRoot, '.next', 'standalone');

function fail(message) {
  console.error(`\n[prepare-standalone] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(standaloneRoot)) {
  fail('.next/standalone not found. Run `next build` first (output: "standalone").');
}

/** Locate the directory containing the emitted server.js. */
function findServerDir() {
  const candidates = [
    path.join(standaloneRoot, 'apps', 'web'),
    standaloneRoot,
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
  }
  return null;
}

const serverDir = findServerDir();
if (!serverDir) {
  fail('Could not locate server.js inside .next/standalone.');
}

function copyDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[prepare-standalone] skip ${label}: ${src} does not exist`);
    return;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[prepare-standalone] copied ${label} -> ${path.relative(webRoot, dest)}`);
}

copyDir(
  path.join(webRoot, '.next', 'static'),
  path.join(serverDir, '.next', 'static'),
  '.next/static',
);

copyDir(path.join(webRoot, 'public'), path.join(serverDir, 'public'), 'public');

console.log(
  `[prepare-standalone] done. server entry: ${path.relative(webRoot, path.join(serverDir, 'server.js'))}`,
);
