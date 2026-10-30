// Builds the static site for GitHub Pages: the game (landing page), the viewer and the rat model,
// copied with their repo-relative paths so no import or asset URL needs rewriting.
// Usage: node tools/build-site.mjs [outDir]   (default: dist/)
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

export const SITE_FILES = [
  'game/fonts/baloo-2.ttf', 'game/fonts/OFL.txt',
  'game/i18n.js', 'game/idle.js', 'game/index.html', 'game/collision.js', 'game/level.js', 'game/scenery.js', 'game/motion.js',
  'models/rat/viewer/index.html', 'models/rat/viewer/clip-player.js',
  'models/rat/viewer/controller.js', 'models/rat/viewer/camera.js',
  'models/rat/dist/rat.glb',
];

const LANDING = `<!doctype html>
<meta charset="utf-8">
<title>Mouse Quest</title>
<meta http-equiv="refresh" content="0; url=game/">
<a href="game/">Play the rat parkour prototype</a>
`;

export function buildSite(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  for (const file of SITE_FILES) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, file), target);
  }
  writeFileSync(join(outDir, 'index.html'), LANDING);
  writeFileSync(join(outDir, '.nojekyll'), ''); // serve files as-is, no Jekyll processing
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(ROOT, process.argv[2] ?? 'dist');
  buildSite(out);
  console.log(`site built in ${out}`);
}
