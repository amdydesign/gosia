/**
 * Kopiuje wynik builda Vite (../build) do katalogu głównego repo,
 * z którego .htaccess serwuje aplikację (index.html + assets/ + pliki PWA).
 *
 * Uruchamiane przez: npm run deploy (patrz package.json)
 */
import { cpSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildDir = path.join(root, 'build');

if (!existsSync(path.join(buildDir, 'index.html'))) {
    console.error('Brak build/index.html — najpierw uruchom "npm run build".');
    process.exit(1);
}

// Stare zahashowane bundle usuwamy w całości, żeby nie zalegały w repo
rmSync(path.join(root, 'assets'), { recursive: true, force: true });
cpSync(path.join(buildDir, 'assets'), path.join(root, 'assets'), { recursive: true });

for (const entry of ['index.html', 'manifest.json', 'vite.svg']) {
    cpSync(path.join(buildDir, entry), path.join(root, entry));
}
cpSync(path.join(buildDir, 'icons'), path.join(root, 'icons'), { recursive: true });

// Service worker: wersja cache pochodna od hasha zbudowanego bundle'a JS.
// Dzięki temu każdy nowy build tworzy nowy CACHE_NAME → stare cache są czyszczone,
// a klient dostaje prompt aktualizacji (patrz main.jsx).
const jsBundle = readdirSync(path.join(buildDir, 'assets')).find((f) => f.startsWith('index-') && f.endsWith('.js'));
const version = jsBundle ? jsBundle.replace(/^index-|\.js$/g, '') : 'dev';
const swSource = readFileSync(path.join(buildDir, 'sw.js'), 'utf8').replace(/gosia-v1/g, `gosia-${version}`);
writeFileSync(path.join(root, 'sw.js'), swSource);

console.log('Zsynchronizowano build z rootem repo:');
for (const f of readdirSync(path.join(root, 'assets'))) {
    console.log('  assets/' + f);
}
