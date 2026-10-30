import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { buildSite } from '../build-site.mjs';

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test('the site build contains the game, the viewer and the model, and nothing else', () => {
  const out = mkdtempSync(join(tmpdir(), 'rat-site-'));
  try {
    buildSite(out);
    const files = filesUnder(out).map((f) => relative(out, f).replaceAll('\\', '/')).sort();
    assert.deepEqual(files, [
      '.nojekyll',
      'game/collision.js', 'game/fonts/OFL.txt', 'game/fonts/baloo-2.ttf',
      'game/i18n.js', 'game/idle.js', 'game/index.html', 'game/level.js', 'game/motion.js', 'game/scenery.js',
      'index.html',
      'models/rat/dist/rat.glb',
      'models/rat/viewer/camera.js', 'models/rat/viewer/clip-player.js',
      'models/rat/viewer/controller.js', 'models/rat/viewer/index.html',
    ]);
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /url=game\//);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('every relative import and asset URL in the built pages resolves to a built file', () => {
  const out = mkdtempSync(join(tmpdir(), 'rat-site-'));
  try {
    buildSite(out);
    const refs = /(?:from\s+|import\(|loadAsync\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
    let checked = 0;
    for (const file of filesUnder(out).filter((f) => /\.(html|js)$/.test(f))) {
      for (const [, ref] of readFileSync(file, 'utf8').matchAll(refs)) {
        const target = resolve(dirname(file), ref);
        assert.ok(existsSync(target), `${relative(out, file)} references missing ${ref}`);
        checked++;
      }
    }
    assert.ok(checked >= 10, `only ${checked} references found`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
