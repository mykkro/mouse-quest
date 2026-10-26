import test from 'node:test';
import assert from 'node:assert/strict';
import { CTRL, GRAVITY, MAPPED } from '../controller.js';
import { makeRig } from './rig.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} not within ${tol} of ${expected}`);

test('every mapped key is a KeyboardEvent code', () => {
  for (const code of ['KeyW', 'ArrowUp', 'ShiftLeft', 'Space', 'KeyX']) assert.ok(MAPPED.has(code));
});

test('W walks forward at the Walk clip speed', () => {
  const { rat, c, step } = makeRig();
  c.press('KeyW'); step(2);
  assert.equal(c.state, 'walk');
  near(rat.position.z, 0.5, 1e-9, 'distance');
});

test('Shift+W runs; S backs off at half walk speed with Walk reversed', () => {
  const r = makeRig();
  r.c.press('ShiftLeft'); r.c.press('KeyW'); r.step(1);
  assert.equal(r.c.state, 'run'); near(r.rat.position.z, 0.8, 1e-9, 'run');
  const b = makeRig();
  b.c.press('KeyS'); b.step(1);
  assert.equal(b.c.state, 'back'); near(b.rat.position.z, -0.125, 1e-9, 'back');
  assert.equal(b.actions.Walk.timeScale, -CTRL.backScale);
});

test('A turns left in place', () => {
  const { rat, c, step } = makeRig();
  c.press('KeyA'); step(1);
  assert.equal(c.state, 'turn');
  near(rat.rotation.y, CTRL.turnRate, 1e-9, 'yaw');
  assert.deepEqual([rat.position.x, rat.position.z], [0, 0]);
});

test('a walking jump leaps forward and lands back on flat ground', () => {
  const { rat, c, step, until } = makeRig();
  c.press('KeyW'); step(0.5);
  const z0 = rat.position.z;
  c.press('Space');
  assert.equal(c.state, 'air', 'a moving rat takes off at once');
  until(() => c.state === 'land', 2);
  const airTime = 2 * Math.sqrt(2 * CTRL.leapHeight / GRAVITY);
  near(rat.position.z - z0, CTRL.leapSpeed.walk * airTime, 0.03, 'leap length');
  assert.equal(rat.position.y, 0);
});

test('a standing jump crouches, then reaches jumpHeight while Space is held', () => {
  const { rat, c, until } = makeRig();
  c.press('Space');
  assert.equal(c.state, 'jump_start');
  c.clipFinished('Jump_Start');
  let peak = 0;
  until(() => { peak = Math.max(peak, rat.position.y); return c.state === 'land'; }, 2);
  near(peak, CTRL.jumpHeight, 0.01, 'peak');
  c.clipFinished('Jump_Land');
  assert.equal(c.state, 'idle');
});

test('releasing Space early cuts the jump short', () => {
  const { rat, c, until } = makeRig();
  c.press('Space'); c.clipFinished('Jump_Start'); c.release('Space');
  let peak = 0;
  until(() => { peak = Math.max(peak, rat.position.y); return c.state === 'land'; }, 2);
  assert.ok(peak < 0.1, `peak ${peak}`);
});

test('X dies and any mapped key respawns into idle', () => {
  const { c } = makeRig();
  c.press('KeyX'); assert.equal(c.state, 'dead');
  c.release('KeyX'); c.press('KeyW');
  assert.equal(c.state, 'idle');
});

test('releaseAll stops a walking rat', () => {
  const { c, step } = makeRig();
  c.press('KeyW'); step(0.2); c.releaseAll(); step(0.1);
  assert.equal(c.state, 'idle'); assert.equal(c.speed, 0);
});
