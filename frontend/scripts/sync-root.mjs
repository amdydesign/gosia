/**
 * Copy the Vite build output (../build) into the repository root, which is
 * what dHosting serves as public_html after `git pull`.
 *
 *   npm run deploy   ->  vite build + this script
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const buildDir = path.join(repoRoot, 'build');

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.error('Brak katalogu build/ - najpierw uruchom `npm run build`.');
    process.exit(1);
}

// Hashed assets: replace the whole folder so stale bundles don't accumulate
fs.rmSync(path.join(repoRoot, 'assets'), { recursive: true, force: true });
fs.cpSync(path.join(buildDir, 'assets'), path.join(repoRoot, 'assets'), { recursive: true });

// PWA + entry files
for (const file of ['index.html', 'sw.js', 'manifest.json', 'vite.svg']) {
    const src = path.join(buildDir, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(repoRoot, file));
}
if (fs.existsSync(path.join(buildDir, 'icons'))) {
    fs.cpSync(path.join(buildDir, 'icons'), path.join(repoRoot, 'icons'), { recursive: true });
}

console.log('Build skopiowany do katalogu głównego repo (index.html, assets/, sw.js, manifest.json, icons/).');
