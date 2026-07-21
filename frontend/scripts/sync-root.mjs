/**
 * Kopiuje wynik builda Vite (../build) do katalogu głównego repo,
 * z którego .htaccess serwuje aplikację (index.html + assets/ + pliki PWA).
 *
 * Uruchamiane przez: npm run deploy (patrz package.json)
 */
import { cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
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

for (const entry of ['index.html', 'sw.js', 'manifest.json', 'vite.svg']) {
    cpSync(path.join(buildDir, entry), path.join(root, entry));
}
cpSync(path.join(buildDir, 'icons'), path.join(root, 'icons'), { recursive: true });

console.log('Zsynchronizowano build z rootem repo:');
for (const f of readdirSync(path.join(root, 'assets'))) {
    console.log('  assets/' + f);
}
