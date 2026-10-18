// Prepara la carpeta _site para publicar en GitHub Pages.
// - Copia los archivos de la app.
// - Calcula un hash de todo el contenido: si nada cambió, la versión es la misma
//   y el celular no descarga nada; si algo cambió, descarga la versión nueva una vez.
// Uso: node scripts/build.mjs   (lo corre GitHub Actions en cada push a main)
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '_site');
const INCLUDE = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'data', 'images', 'icons'];

function walk(p) {
  return statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => walk(join(p, f))) : [p];
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of INCLUDE) cpSync(join(ROOT, item), join(OUT, item), { recursive: true });

const files = walk(OUT).map((f) => relative(OUT, f)).filter((f) => f !== 'sw.js' && !f.endsWith('.md'));
const hash = createHash('sha256');
for (const f of files) { hash.update(f); hash.update(readFileSync(join(OUT, f))); }
const version = hash.digest('hex').slice(0, 10);

const assets = ['./', ...files];
const swPath = join(OUT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
       .replace(/const ASSETS = \[[^\]]*\];/, `const ASSETS = ${JSON.stringify(assets)};`);
writeFileSync(swPath, sw);

const appPath = join(OUT, 'app.js');
writeFileSync(appPath, readFileSync(appPath, 'utf8').replace(/const BUILD = '[^']*';/, `const BUILD = '${version}';`));
writeFileSync(join(OUT, '.nojekyll'), '');

const bytes = files.reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`Versión ${version} · ${files.length} archivos · ${(bytes / 1024).toFixed(0)} KB`);
