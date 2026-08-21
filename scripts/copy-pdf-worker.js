/**
 * Copies the pdf.js worker into public/ so it is served as a static asset.
 *
 * pdf.js runs its parser in a web worker, and the worker file has to be
 * fetchable at a stable URL at runtime. Letting the bundler resolve it from
 * node_modules works in some setups and breaks in others (Turbopack dev vs
 * webpack build vs the Electron file:// origin), so it is copied to a fixed
 * path instead and referenced as "/pdf.worker.min.mjs".
 *
 * Run from postinstall so the copy cannot drift from the installed version —
 * a stale worker and a newer pdf.js core fail with confusing version errors.
 */

const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const destination = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');

if (!fs.existsSync(source)) {
  // Not an error: pdfjs-dist may not be installed yet in a partial install,
  // and failing here would break `pnpm install` itself.
  console.warn('[copy-pdf-worker] pdfjs-dist not found, skipping.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('[copy-pdf-worker] Copied pdf.worker.min.mjs to public/');
