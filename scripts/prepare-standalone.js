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
const fs = require('node:fs');
const path = require('node:path');

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

/**
 * Turn the standalone tree into a genuinely self-contained one.
 *
 * Under pnpm, `next build` does not copy dependencies into the standalone
 * output. It writes pnpm's own layout: a virtual store at
 * `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, and symlinks
 * pointing into it — with ABSOLUTE paths, back into THIS machine's
 * node_modules (`C:\...\Lumanv1\node_modules\.pnpm\react@18.2.0\...`).
 *
 * That is invisible in development, because the targets exist here. It breaks
 * distribution twice over:
 *
 *   1. Packaging fails. The NSIS step compresses the app directory with 7-Zip,
 *      which cannot follow links whose targets are outside it — 35 of them,
 *      reported as "The system cannot find the path specified", exit code 1.
 *   2. Even packaged, it would not run anywhere else. Those paths do not exist
 *      on a user's laptop, so the embedded server cannot resolve `next`,
 *      `react`, or `sharp`.
 *
 * The fix is to rebuild the dependency tree in the classic nested npm layout,
 * which needs no symlinks at all.
 *
 * Why not simply replace each symlink with a copy of its target: pnpm's layout
 * *depends* on those links. Node resolves a module's dependencies from its
 * realpath, so requires inside `next` resolve against
 * `.pnpm/next@<v>/node_modules/`, where its dependencies sit as siblings.
 * Copy `next` to `node_modules/next` and that sibling directory is no longer on
 * the resolution path — the server dies on `Cannot find module
 * 'styled-jsx/package.json'` before it can listen. (Tried it. That is exactly
 * what happens.)
 *
 * So `installPackage` copies a package AND re-installs its pnpm siblings —
 * which are precisely its declared dependencies — into that copy's own
 * `node_modules`, recursively. `provided` carries what an ancestor already
 * supplies at the same version, so shared dependencies are hoisted rather than
 * duplicated at every level, and a dependency cycle terminates instead of
 * copying forever.
 */
const MAX_DEPTH = 8;

/** The `node_modules` directory that directly contains a package entry. */
function owningNodeModules(pkgDir) {
  const parent = path.dirname(pkgDir);
  if (path.basename(parent) === 'node_modules') return parent;
  // Scoped: <node_modules>/@scope/name
  const grandparent = path.dirname(parent);
  if (path.basename(grandparent) === 'node_modules') return grandparent;
  return null;
}

/**
 * The dependencies a package actually needs at runtime.
 *
 * Not "everything sitting next to it in the store": pnpm places optional peers
 * there too, so `next`'s store directory contains `@playwright/test` (17 MB of
 * test runner the server never requires). Reading the manifest keeps that out.
 *
 * Optional peers are skipped; non-optional ones (react, react-dom for next) are
 * genuinely required and kept. Returns null when there is no manifest to read,
 * so the caller can fall back to the sibling set.
 */
function declaredDependencies(pkgDir) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }

  const names = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
  ]);

  const peerMeta = manifest.peerDependenciesMeta || {};
  for (const name of Object.keys(manifest.peerDependencies || {})) {
    if (!peerMeta[name]?.optional) names.add(name);
  }

  return names;
}

/** Package entries in a node_modules dir, as `name` or `@scope/name`. */
function listPackages(nodeModulesDir) {
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    // `.pnpm` and `.bin` are not packages.
    if (entry.name.startsWith('.')) continue;
    const full = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@')) {
      let scoped;
      try {
        scoped = fs.readdirSync(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const inner of scoped) {
        found.push({ name: `${entry.name}/${inner.name}`, dir: path.join(full, inner.name) });
      }
    } else {
      found.push({ name: entry.name, dir: full });
    }
  }
  return found;
}

let installedCount = 0;

/**
 * @param {string} srcPkgDir  package directory, possibly a symlink
 * @param {string} destPkgDir where it should end up as real files
 * @param {Map<string,string>} provided  name -> realpath already resolvable from an ancestor
 * @param {number} depth
 * @param {boolean} force  install even if `provided` already lists it — true for
 *   the top-level round, whose entries ARE what `provided` describes
 */
function installPackage(srcPkgDir, destPkgDir, provided, depth, force = false) {
  if (depth > MAX_DEPTH) return;

  let real;
  try {
    real = fs.realpathSync(srcPkgDir);
  } catch {
    return; // dangling link; nothing to install
  }

  const nodeModulesDir = owningNodeModules(real);
  const selfName = nodeModulesDir ? path.relative(nodeModulesDir, real).split(path.sep).join('/') : null;

  // An ancestor already supplies this exact package — Node will find it there.
  // Comparing realpaths, not names: a different version lives at a different
  // store path, so it correctly gets its own nested copy.
  if (!force && selfName && provided.get(selfName) === real) return;

  if (!fs.existsSync(destPkgDir)) {
    fs.mkdirSync(path.dirname(destPkgDir), { recursive: true });
    fs.cpSync(real, destPkgDir, { recursive: true, dereference: true });
    installedCount++;
  }

  if (!nodeModulesDir || !selfName) return;

  const childProvided = new Map(provided);
  childProvided.set(selfName, real);

  const needed = declaredDependencies(real);

  for (const sibling of listPackages(nodeModulesDir)) {
    if (sibling.name === selfName) continue;
    if (needed && !needed.has(sibling.name)) continue;
    installPackage(
      sibling.dir,
      path.join(destPkgDir, 'node_modules', ...sibling.name.split('/')),
      childProvided,
      depth + 1,
    );
  }
}

function rebuildNodeModules(root) {
  const nodeModulesDir = path.join(root, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    console.log('[prepare-standalone] no node_modules in standalone output; nothing to rebuild');
    return;
  }

  const storeDir = path.join(nodeModulesDir, '.pnpm');
  const usesPnpmLayout = fs.existsSync(storeDir);
  if (!usesPnpmLayout) {
    console.log('[prepare-standalone] standalone output is already a plain tree; nothing to rebuild');
    return;
  }

  const staging = path.join(root, 'node_modules.rebuilt');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const provided = new Map();

  // pnpm's own hoist directory holds every transitive dependency of the
  // bundle. Placing these at the top level first means anything resolving from
  // the standalone root finds them, and deeper packages share one copy.
  const hoistDir = path.join(storeDir, 'node_modules');
  const hoisted = fs.existsSync(hoistDir) ? listPackages(hoistDir) : [];
  for (const pkg of hoisted) {
    try {
      provided.set(pkg.name, fs.realpathSync(pkg.dir));
    } catch {
      // dangling; installPackage will skip it too
    }
  }

  // Direct dependencies of the server keep their top-level position.
  const topLevel = listPackages(nodeModulesDir);
  for (const pkg of topLevel) {
    try {
      provided.set(pkg.name, fs.realpathSync(pkg.dir));
    } catch {
      /* ignore */
    }
  }

  // `provided` is now complete, so nested dependencies that already exist at
  // the top level are skipped instead of being copied again at every level.
  // Without this, `typescript` alone landed five times and the tree was 387 MB.
  for (const pkg of [...hoisted, ...topLevel]) {
    const dest = path.join(staging, ...pkg.name.split('/'));
    if (fs.existsSync(dest)) continue;
    installPackage(pkg.dir, dest, provided, 0, true);
  }

  fs.rmSync(nodeModulesDir, { recursive: true, force: true });
  fs.renameSync(staging, nodeModulesDir);

  console.log(
    `[prepare-standalone] rebuilt node_modules as a plain tree: ${installedCount} package(s), pnpm store dropped`,
  );
}

rebuildNodeModules(standaloneRoot);

/** Nothing may point outside the package. Fail the build rather than ship it. */
function assertNoSymlinks(root) {
  const offenders = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) offenders.push(full);
      else if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);

  if (offenders.length > 0) {
    fail(
      `${offenders.length} symlink(s) remain under ${path.relative(webRoot, root)}, e.g. ` +
        `${path.relative(webRoot, offenders[0])}. Packaging would fail and the build would not run ` +
        'on another machine.',
    );
  }
}

assertNoSymlinks(standaloneRoot);

console.log(
  `[prepare-standalone] done. server entry: ${path.relative(webRoot, path.join(serverDir, 'server.js'))}`,
);
