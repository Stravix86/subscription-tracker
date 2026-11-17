// Copies the web app into native/www so the desktop and Android wrappers can bundle it.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'native', 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'style.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icons']) {
  cpSync(join(root, f), join(out, f), { recursive: true });
}
console.log('Staged web app in', out);
