// Headless check of the parkour game. Run: npm run check:game
import { join } from 'node:path';
import { checker, openPage, ROOT, serveStatic, sleep } from './cdp.mjs';

const server = await serveStatic();
const page = await openPage('http://127.0.0.1:5199/game/');
const { check, near, done } = checker();
const snap = () => page.ev(`({ s: ratGame.state, c: ratGame.ctrlState, v: ratGame.speed,
  x: ratGame.rat.position.x, y: ratGame.rat.position.y, z: ratGame.rat.position.z })`);
const key = (code, down) => page.ev(`ratGame.key('${code}', ${down})`);
const tap = async (code) => { await key(code, true); await key(code, false); };
const tp = (x, y, z, yaw) => page.ev(`ratGame.teleport(${x}, ${y}, ${z}, ${yaw})`);
const LEFT = Math.PI / 2; // yaw facing +X
const leap = async (holdMs = 600) => {
  await key('KeyW', true); await sleep(100);
  await key('Space', true); await sleep(holdMs);
  await key('Space', false); await key('KeyW', false); await sleep(400);
};
try {
  await page.waitFor('!!window.ratGame', 30000);
  await sleep(1500); // first frames stall on shader compiles; the 0.1 s dt cap would swallow that time
  let s = await snap();
  check(s.s === 'ready', `starts ready (${s.s})`);
  near(Math.hypot(s.x, s.z), 0, 1e-6, 'rat on the start block');
  near(s.y, 0, 1e-6, 'rat standing on the start top');

  await tap('KeyW');
  check((await snap()).s === 'playing', 'a key starts the run');

  // Walk off the side of the warm-up path.
  await tp(0, 0, 0.7, LEFT);
  await key('KeyW', true); await sleep(1500); await key('KeyW', false);
  s = await snap();
  check(s.s === 'fell', `walking off the path ends the run (${s.s})`);

  // Space restarts; the same press must not also jump.
  await tap('Space'); await sleep(500);
  s = await snap();
  check(s.s === 'ready' && s.c === 'idle', `Space restarts into a calm ready state (${s.s}/${s.c})`);
  near(s.y, 0, 1e-6, 'restart: on the start top');
  near(Math.hypot(s.x, s.z), 0, 1e-6, 'restart: on the start block');

  // Leap the 25 cm gap from the end of the narrow path.
  await tap('KeyW');
  await tp(0, 0, 1.6, 0);
  await leap();
  s = await snap();
  check(s.s === 'playing', `the first gap is cleared (${s.s})`);
  near(s.y, 0, 1e-6, 'landed on zig-zag pad 1');
  check(s.z >= 1.95 && s.z <= 2.35, `landed within pad 1 (z ${s.z.toFixed(3)})`);

  // Walk along each beam without falling.
  for (const [x, y, z, yaw, name] of [[0.25, 0, 2.15, LEFT, 'zig-zag beam 1'], [0.9, 0, 2.3, 0, 'zig-zag beam 2'],
    [1.05, 0, 2.95, LEFT, 'zig-zag beam 3'], [3.15, 0.05, 2.95, LEFT, 'balance beam']]) {
    await tp(x, y, z, yaw);
    await key('KeyW', true); await sleep(1000); await key('KeyW', false); await sleep(150);
    s = await snap();
    check(s.s === 'playing' && Math.abs(s.y - y) < 1e-6, `${name}: walked along it (${s.s}, y ${s.y.toFixed(3)})`);
  }

  // Leap from the back of pad 4 onto the stairs (from the front edge it would hit the step's face).
  await tp(1.62, 0, 2.95, LEFT);
  await leap();
  s = await snap();
  check(s.s === 'playing' && s.y >= 0.1 - 1e-6, `leapt onto a stair (y ${s.y.toFixed(3)})`);

  // Step onto the goal pad.
  await tp(6.35, 0.05, 2.95, LEFT);
  await key('KeyW', true); await sleep(1000); await key('KeyW', false); await sleep(150);
  check((await snap()).s === 'won', 'stepping on the goal pad wins');

  // Losing window focus releases held keys.
  await tap('Space'); await tap('KeyW');
  await key('KeyW', true); await sleep(300);
  await page.ev('dispatchEvent(new Event("blur"))'); await sleep(300);
  s = await snap();
  check(s.c === 'idle' && s.v === 0, `blur stops the rat (${s.c}, speed ${s.v})`);
  await key('KeyW', false);

  await page.screenshot(join(ROOT, 'models/rat/build/previews/game.png'));
  check(page.errors().length === 0, `no console errors (${page.errors().join('; ') || 'none'})`);
} finally {
  page.close();
  server.close();
  done();
}
