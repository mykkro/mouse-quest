import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight, top } from '../collision.js';
import { level } from '../level.js';
import { CTRL, GRAVITY } from '../../models/rat/viewer/controller.js';

const { boxes, start, goal, killY } = level;
const gapBetween = (a, b) => Math.hypot(
  Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, 0),
  Math.max(Math.abs(a.z - b.z) - (a.d + b.d) / 2, 0));
const pairs = boxes.slice(1).map((b, i) => [boxes[i], b]);
const leapTime = 2 * Math.sqrt(2 * CTRL.leapHeight / GRAVITY);
const MAX_GAP = CTRL.leapSpeed.run * leapTime * 0.85;
const MAX_RISE = CTRL.leapHeight * 0.85;

test('every gap can be cleared by a running leap with a 15 % margin', () => {
  for (const [a, b] of pairs) assert.ok(gapBetween(a, b) <= MAX_GAP, `gap ${gapBetween(a, b)} > ${MAX_GAP}`);
});

test('every step up can be climbed with a moving leap', () => {
  for (const [a, b] of pairs) assert.ok(top(b) - top(a) <= MAX_RISE, `rise ${top(b) - top(a)} > ${MAX_RISE}`);
});

test('every block is at least 3 cm wide', () => {
  for (const b of boxes) assert.ok(Math.min(b.w, b.d) >= 0.03 - 1e-12, `block ${JSON.stringify(b)}`);
});

test('the start and the goal stand on blocks, the goal on the last one', () => {
  assert.equal(groundHeight(boxes, start.x, start.z, start.top), start.top);
  assert.equal(groundHeight(boxes, goal.x, goal.z, goal.top), goal.top);
  assert.equal(groundHeight([boxes.at(-1)], goal.x, goal.z, goal.top), goal.top);
});

test('killY is 0.3 m below the lowest block top', () => {
  assert.equal(killY, Math.min(...boxes.map(top)) - 0.3);
});

test('the course has the agreed obstacles', () => {
  const gaps = pairs.map(([a, b]) => gapBetween(a, b));
  const rises = pairs.map(([a, b]) => +(top(b) - top(a)).toFixed(3));
  assert.ok(gaps.some((g) => Math.abs(g - 0.25) < 1e-9), 'a 25 cm gap');
  assert.ok(gaps.some((g) => Math.abs(g - 0.8) < 1e-9), 'an 80 cm gap');
  for (const r of [0.1, 0.15, 0.2]) assert.ok(rises.includes(r), `a ${r} m step up`);
  assert.ok(rises.includes(-0.4), 'a 40 cm drop');
  assert.ok(boxes.some((b) => Math.min(b.w, b.d) === 0.035), 'a 3.5 cm balance beam');
  assert.ok(boxes.filter((b) => Math.min(b.w, b.d) === 0.06).length === 3, 'three 6 cm zig-zag beams');
});
