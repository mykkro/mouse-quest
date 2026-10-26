import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, RAT_RADIUS, top } from '../collision.js';
import { makeRig } from '../../models/rat/viewer/test/rig.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} not within ${tol} of ${expected}`);
const floor = { x: 0, y: -0.1, z: 0, w: 0.2, h: 0.1, d: 1 };        // top 0, z -0.5..0.5
const lower = { x: 0, y: -0.3, z: 1, w: 0.2, h: 0.1, d: 1 };        // top -0.2, z 0.5..1.5
const wall = { x: 0, y: -0.1, z: 0.35, w: 0.4, h: 0.4, d: 0.1 };    // top 0.3, front face z 0.3
const tall = { x: 0, y: -0.1, z: 0.35, w: 0.4, h: 0.6, d: 0.1 };    // top 0.5, front face z 0.3
const step = { x: 0, y: -0.1, z: 0.55, w: 0.2, h: 0.2, d: 0.5 };    // top 0.1, z 0.3..0.8

test('walking off the end of a block falls', () => {
  const { rat, c, until, step: run } = makeRig(makeWorld([floor]));
  c.press('KeyW');
  until(() => c.state === 'air', 5);
  near(rat.position.z, 0.5, 0.01, 'leaves at the edge');
  run(1);
  assert.ok(rat.position.y < -0.3, `still falling: y ${rat.position.y}`);
});

test('walking off onto a lower block lands on it', () => {
  const { rat, c, until } = makeRig(makeWorld([floor, lower]));
  c.press('KeyW');
  until(() => c.state === 'land', 5);
  assert.equal(rat.position.y, top(lower)); // -0.3 + 0.1 in floating point, not the literal -0.2
});

test('a wall stops a walking rat at its radius', () => {
  const { rat, c, step: run } = makeRig(makeWorld([floor, wall]));
  c.press('KeyW'); run(2);
  assert.equal(c.state, 'walk');
  near(rat.position.z, 0.3 - RAT_RADIUS, 0.005, 'stops at the wall');
  assert.equal(rat.position.y, 0);
});

test('a moving leap lands on a 10 cm step', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, step]));
  c.press('KeyW'); run(0.4); c.press('Space');
  until(() => c.state === 'land', 2);
  assert.equal(rat.position.y, 0.1);
  assert.ok(rat.position.z > 0.3);
});

test('a leap into a wall too high to clear drops back in front of it', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, tall]));
  c.press('KeyW'); run(0.4); c.press('Space');
  until(() => c.state === 'land', 2);
  assert.equal(rat.position.y, 0);
  assert.ok(rat.position.z <= 0.3 - RAT_RADIUS + 1e-9, `z ${rat.position.z}`);
});

test('at a 0.1 s frame step a leap still lands on the step (no tunnelling)', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, step]));
  c.press('KeyW'); run(0.4, 0.1); c.press('Space');
  until(() => c.state === 'land', 2, 0.1);
  assert.equal(rat.position.y, 0.1);
});

test('reset after falling leaves the rat standing still where it is placed', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor]));
  c.press('KeyW');
  until(() => c.state === 'air', 5);
  run(0.3);
  Object.assign(rat.position, { x: 0, y: 0, z: 0 });
  rat.rotation.y = 0;
  c.reset();
  run(0.5);
  assert.equal(c.state, 'idle');
  assert.deepEqual([rat.position.x, rat.position.y, rat.position.z], [0, 0, 0]);
});
