import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight, hasFallen, makeWorld, moveWithWalls, onGoal, RAT_RADIUS, STEP, top } from '../collision.js';

const floor = { x: 0, y: -0.1, z: 0, w: 1, h: 0.1, d: 1 };     // top 0, x/z -0.5..0.5
const lowStep = { x: 0, y: 0, z: 0.6, w: 0.2, h: 0.01, d: 0.2 }; // top 0.01: climbable
const wall = { x: 0, y: 0, z: 0.3, w: 0.2, h: 0.2, d: 0.05 };   // top 0.2, front face z 0.275
const overhang = { x: 0, y: 0.1, z: 0.3, w: 0.2, h: 0.05, d: 0.05 }; // above the rat's head

test('top is bottom plus height', () => assert.equal(top(wall), 0.2));

test('groundHeight: the top of the box under the point', () => {
  assert.equal(groundHeight([floor], 0.1, 0.1, 0), 0);
});

test('groundHeight: nothing underneath gives -Infinity', () => {
  assert.equal(groundHeight([floor], 2, 0, 0), -Infinity);
});

test('groundHeight: box edges count as inside', () => {
  assert.equal(groundHeight([floor], 0.5, -0.5, 0), 0);
});

test('groundHeight: walking across the seam of two touching blocks never drops', () => {
  const pad = { x: 0, y: -0.1, z: 0, w: 0.2, h: 0.1, d: 0.2 };     // x -0.1..0.1
  const beam = { x: 0.4, y: -0.1, z: 0, w: 0.6, h: 0.1, d: 0.06 }; // x 0.1..0.7
  for (let x = 0; x <= 0.2; x += 0.001) assert.equal(groundHeight([pad, beam], x, 0, 0), 0, `x=${x}`);
});

test('groundHeight: the highest surface within step reach wins', () => {
  assert.equal(groundHeight([floor, lowStep], 0, 0.6, 0), top(lowStep));
});

test('groundHeight: surfaces higher than a step are ignored', () => {
  assert.equal(groundHeight([floor, wall], 0, 0.3, 0), 0);
});

test('groundHeight: a falling rat finds the surface below it', () => {
  assert.equal(groundHeight([floor, wall], 0, 0.3, 0.25), 0.2);
});

test('moveWithWalls: a free move arrives', () => {
  assert.deepEqual(moveWithWalls([floor], { x: 0, z: 0 }, { x: 0.01, z: 0.02 }, 0), { x: 0.01, z: 0.02 });
});

test('moveWithWalls: a wall ahead stops the move', () => {
  assert.deepEqual(moveWithWalls([floor, wall], { x: 0, z: 0.2 }, { x: 0, z: 0.26 }, 0), { x: 0, z: 0.2 });
});

test('moveWithWalls: sliding along a wall keeps the sideways part', () => {
  assert.deepEqual(moveWithWalls([floor, wall], { x: 0, z: 0.2 }, { x: 0.05, z: 0.26 }, 0), { x: 0.05, z: 0.2 });
});

test('moveWithWalls: a step lower than STEP is not a wall', () => {
  assert.deepEqual(moveWithWalls([floor, lowStep], { x: 0, z: 0.45 }, { x: 0, z: 0.5 }, 0), { x: 0, z: 0.5 });
});

test('moveWithWalls: a box above the rat does not block', () => {
  assert.deepEqual(moveWithWalls([floor, overhang], { x: 0, z: 0.2 }, { x: 0, z: 0.3 }, 0), { x: 0, z: 0.3 });
});

test('moveWithWalls: a rat already touching a wall can move away from it', () => {
  const inside = { x: 0, z: 0.275 - RAT_RADIUS / 2 };
  assert.deepEqual(moveWithWalls([floor, wall], inside, { x: 0, z: 0.2 }, 0), { x: 0, z: 0.2 });
});

test('moveWithWalls: a rat already touching a wall cannot push deeper into it', () => {
  const inside = { x: 0, z: 0.275 - RAT_RADIUS / 2 };
  assert.deepEqual(moveWithWalls([floor, wall], inside, { x: 0, z: 0.27 }, 0), inside);
});

test('moveWithWalls: standing at the wall top height, it is ground, not a wall', () => {
  assert.deepEqual(moveWithWalls([floor, wall], { x: 0, z: 0.2 }, { x: 0, z: 0.3 }, 0.2), { x: 0, z: 0.3 });
});

test('onGoal: standing inside the pad', () => {
  const goal = { x: 0, z: 0, w: 0.2, d: 0.2, top: 0.05 };
  assert.equal(onGoal({ x: 0, y: 0.05, z: 0 }, goal), true);
  assert.equal(onGoal({ x: 0, y: 0.05 + STEP * 2, z: 0 }, goal), false, 'airborne above it');
  assert.equal(onGoal({ x: 0.2, y: 0.05, z: 0 }, goal), false, 'beside it');
});

test('hasFallen: below killY', () => {
  assert.equal(hasFallen({ x: 0, y: -0.31, z: 0 }, { killY: -0.3 }), true);
  assert.equal(hasFallen({ x: 0, y: -0.29, z: 0 }, { killY: -0.3 }), false);
});

test('makeWorld wires the box list into the controller world interface', () => {
  const w = makeWorld([floor, wall]);
  assert.equal(w.step, STEP);
  assert.equal(w.groundHeight(0, 0, 0), 0);
  assert.deepEqual(w.move({ x: 0, z: 0.2 }, { x: 0, z: 0.26 }, 0), { x: 0, z: 0.2 });
});
