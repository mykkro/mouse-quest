// Headless regression check for the viewer's keyboard control. Run: npm run check:viewer
import { checker, openPage, serveStatic, sleep } from './cdp.mjs';

const server = await serveStatic();
const page = await openPage('http://127.0.0.1:5199/models/rat/viewer/');
const { check, near, done } = checker();
const pos = () => page.ev(`({ x: ratViewer.rat.position.x, y: ratViewer.rat.position.y,
  z: ratViewer.rat.position.z, ry: ratViewer.rat.rotation.y, s: ratViewer.state })`);
const key = (code, down) => page.ev(`ratViewer.key('${code}', ${down})`);
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
try {
  await page.waitFor('!!window.ratViewer');
  await sleep(1500); // first frames stall on shader compiles; the 0.1 s dt cap would swallow that time

  let p0 = await pos();
  await key('KeyW', true); await sleep(2000);
  let p1 = await pos(); await key('KeyW', false);
  check(p1.s === 'walk', `W walks (state ${p1.s})`);
  near(dist(p0, p1), 0.5, 0.075, 'walk distance in 2 s');
  await sleep(400);

  p0 = await pos();
  await key('ShiftLeft', true); await key('KeyW', true); await sleep(1000);
  p1 = await pos(); await key('KeyW', false); await key('ShiftLeft', false);
  check(p1.s === 'run', `Shift+W runs (state ${p1.s})`);
  near(dist(p0, p1), 0.8, 0.12, 'run distance in 1 s');
  await sleep(400);

  p0 = await pos();
  await key('KeyA', true); await sleep(1000);
  p1 = await pos(); await key('KeyA', false);
  near(p1.ry - p0.ry, 2.1, 0.3, 'turn in 1 s (rad)');
  near(dist(p0, p1), 0, 0.001, 'turning in place does not move');
  await sleep(400);

  const states = [];
  await key('Space', true);
  for (const t0 = Date.now(); Date.now() - t0 < 1800; await sleep(25)) {
    if (Date.now() - t0 > 800) await key('Space', false);
    const s = (await pos()).s;
    if (states.at(-1) !== s) states.push(s);
  }
  check(states.join('>').includes('jump_start>air>land'), `standing jump sequence (${states.join('>')})`);
  near((await pos()).y, 0, 1e-6, 'lands on the ground');
  await sleep(300);

  await key('KeyW', true); await sleep(400);
  p0 = await pos();
  await key('Space', true); await sleep(300); await key('Space', false); await sleep(900);
  p1 = await pos(); await key('KeyW', false);
  check(p1.s === 'walk', `walking jump ends walking (state ${p1.s})`);
  check(dist(p0, p1) > 0.4, `walking jump carries the rat forward (${dist(p0, p1).toFixed(3)} m)`);
  await sleep(400);

  await key('KeyX', true); await key('KeyX', false); await sleep(1700);
  check((await pos()).s === 'dead', 'X dies');
  await key('KeyW', true); await key('KeyW', false); await sleep(200);
  check((await pos()).s === 'idle', 'a key respawns into idle');

  check(page.errors().length === 0, `no console errors (${page.errors().join('; ') || 'none'})`);
} finally {
  page.close();
  server.close();
  done();
}
