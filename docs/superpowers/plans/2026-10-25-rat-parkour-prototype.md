# Rat Parkour Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-level browser parkour game where the player drives the rigged rat along narrow block paths and across gaps to a green goal pad; falling off restarts the run.

**Architecture:** The viewer's keyboard controller moves into shared, three.js-free ES modules (`clip-player.js`, `controller.js`, `camera.js`) that take a pluggable *world* (ground height + wall-aware movement). The viewer passes a flat world; the game passes axis-aligned box collision (`game/collision.js`) over a level defined as data (`game/level.js`). Pure modules get `node --test` unit tests; both pages get a headless Edge/Chrome check driven over the DevTools protocol.

**Tech Stack:** three.js 0.170.0 (pinned import map, jsDelivr), plain ES modules, Node 24 (`node:test`, global `WebSocket`/`fetch`), locally installed Edge or Chrome for headless checks, `serve` 14.2.4 to play.

**Spec:** `docs/superpowers/specs/2026-10-25-rat-parkour-prototype-design.md`

## Global Constraints

- three.js 0.170.0 from the existing pinned import map; no physics engine, no other runtime dependencies.
- Shared modules (`clip-player.js`, `controller.js`, `camera.js`, `collision.js`, `level.js`) must not import three.js, so Node can test them.
- Boxes are axis-aligned `{ x, y, z, w, h, d }` = centre x, **bottom** y, centre z, size along x/y/z, metres.
- `RAT_RADIUS = 0.02` m, `STEP = 0.015` m, gravity 9.81 m/s², fall-out `killY` = lowest block top − 0.3 m.
- Controller constants stay as in the viewer: `turnRate` 2.1, `runTurnRate` 3.0, `backScale` 0.5, `turnInPlaceScale` 0.5, `jumpHeight` 0.35, `leapHeight` 0.25, `leapSpeed` walk 1.2 / run 2.2, `jumpCut` 0.4, `landRecover` 0.12, `fade` 0.2.
- Controls identical in viewer and game: W/↑ walk, Shift run, S/↓ back, A/D/←/→ turn, Space jump (hold = higher), E eat, R rear, F sniff, X die.
- Game states and copy: `ready` "Reach the green pad — press any key to start", `playing`, `fell` "You fell! Press Space to restart", `won` "You made it! Press Space to restart".
- The game is served from the repo root (`npm run game`) so it can load `models/rat/dist/rat.glb`.
- The viewer's behaviour must not change.

## Review Focus

1. **Seams between touching blocks** (pad → beam): walking across the join must not drop the rat. Pinned by `groundHeight` seam test (Task 1).
2. **Restart while falling or mid-jump**: the rat must stand still on the start, not keep the fall's velocity. Pinned by the controller-world reset test (Task 3).
3. **The Space press that restarts must not also jump**. Pinned in the game headless check (Task 4).
4. **Low frame rates (dt clamped to 0.1 s)**: a leap must still land on a step rather than tunnel. Pinned by the large-dt controller-world test (Task 3).
5. **Window loses focus while a key is held**: the rat must stop, not walk off forever. Pinned in the game headless check (Task 4).

## Deviations from the spec (flag at handoff)

- Two extra shared modules, `clip-player.js` (crossfades, used by both pages) and `camera.js` (swing-behind camera), so the game doesn't copy viewer code.
- `collision.js` also exports `makeWorld(boxes)`, the world object used by the game and the tests.
- The pad after the first gap is 40 × 40 cm (spec doesn't size it) so a walking leap (~0.54 m) has a ~29 cm take-off window; later blocks shift by 10 cm in z accordingly.
- Headless check scripts are committed under `tools/headless/` (with a tiny static server) so they can be re-run.

## File map

```
package.json                          root: type module, scripts test/game/check:*, devDep serve   Task 2
game/
  collision.js                        box collision + makeWorld                                       Task 1
  level.js                            course data                                                     Task 3
  index.html                          game page                                                       Task 4
  test/collision.test.js                                                                              Task 1
  test/level.test.js                                                                                  Task 3
  test/controller-world.test.js                                                                       Task 3
models/rat/viewer/
  clip-player.js, controller.js, camera.js   shared modules                                           Task 2
  index.html                          imports the shared modules                                      Task 2
  test/rig.js, test/controller.test.js                                                                Task 2
tools/headless/
  cdp.mjs                             static server + DevTools driver                                 Task 2
  viewer-check.mjs                                                                                    Task 2
  game-check.mjs                                                                                      Task 4
```

---

### Task 1: Box collision

**Files:**
- Create: `game/collision.js`
- Test: `game/test/collision.test.js`

(No `package.json` yet: Node 24 detects ES module syntax, so plain `node --test` works. Task 2 adds the root `package.json` with `"type": "module"`.)

**Interfaces:**
- Produces: `RAT_RADIUS`, `RAT_HEIGHT`, `STEP` (numbers); `top(box) -> number`; `groundHeight(boxes, x, z, footY) -> number` (highest reachable top under the point, or `-Infinity`); `moveWithWalls(boxes, from{x,z}, to{x,z}, footY) -> {x,z}`; `onGoal(pos{x,y,z}, goal{x,z,w,d,top}) -> boolean`; `hasFallen(pos, level{killY}) -> boolean`; `makeWorld(boxes) -> { step, groundHeight(x,z,footY), move(from,to,footY) }`.

- [ ] **Step 1: Write the failing tests**

`game/test/collision.test.js`:

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test game/test/collision.test.js`
Expected: FAIL with `Cannot find module '.../game/collision.js'`

- [ ] **Step 3: Write `game/collision.js`**

```js
// Axis-aligned box collision for the rat parkour prototype (pure functions, no three.js).
// Box: { x, y, z, w, h, d } = centre x, bottom y, centre z, size along x/y/z, in metres.
export const RAT_RADIUS = 0.02; // the rat's footprint: a circle around its body centre
export const RAT_HEIGHT = 0.08; // boxes entirely above this (over its head) don't block it
export const STEP = 0.015;      // steps up to this height are climbed without jumping

export const top = (b) => b.y + b.h;

const inside = (b, x, z) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2;

function hitsCircle(b, x, z, r) {
  const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
  const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
  return dx * dx + dz * dz < r * r;
}

const isWall = (b, footY) => top(b) > footY + STEP && b.y < footY + RAT_HEIGHT;

// Highest box top under the point that the rat can stand on from footY (a point test, so
// the rat goes over an edge once its body centre is past it). -Infinity if there is none.
export function groundHeight(boxes, x, z, footY) {
  let best = -Infinity;
  for (const b of boxes) {
    const t = top(b);
    if (t <= footY + STEP && t > best && inside(b, x, z)) best = t;
  }
  return best;
}

// A wall blocks a move only if the rat's circle would newly overlap it, so a rat that is
// already touching one can always move away. Resolved per axis, so it slides along walls.
export function moveWithWalls(boxes, from, to, footY) {
  const blocked = (x0, z0, x1, z1) => boxes.some((b) =>
    isWall(b, footY) && hitsCircle(b, x1, z1, RAT_RADIUS) && !hitsCircle(b, x0, z0, RAT_RADIUS));
  const x = blocked(from.x, from.z, to.x, from.z) ? from.x : to.x;
  const z = blocked(x, from.z, x, to.z) ? from.z : to.z;
  return { x, z };
}

export function onGoal(pos, goal) {
  return Math.abs(pos.x - goal.x) <= goal.w / 2 && Math.abs(pos.z - goal.z) <= goal.d / 2
    && Math.abs(pos.y - goal.top) <= STEP;
}

export const hasFallen = (pos, level) => pos.y < level.killY;

// The world interface the shared rat controller expects.
export function makeWorld(boxes) {
  return {
    step: STEP,
    groundHeight: (x, z, footY) => groundHeight(boxes, x, z, footY),
    move: (from, to, footY) => moveWithWalls(boxes, from, to, footY),
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test game/test/collision.test.js`
Expected: `# pass 18`, `# fail 0`. If Node warns about module type detection, ignore it here; Task 2's root `package.json` sets `"type": "module"`.

- [ ] **Step 5: Commit**

```bash
git add game/collision.js game/test/collision.test.js
git commit -m "Add box collision for the rat parkour prototype

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared controller modules and viewer refactor

**Files:**
- Create: `package.json` (repo root)
- Create: `models/rat/viewer/clip-player.js`, `models/rat/viewer/controller.js`, `models/rat/viewer/camera.js`
- Create: `models/rat/viewer/test/rig.js`, `models/rat/viewer/test/controller.test.js`
- Modify: `models/rat/viewer/index.html` (whole `<script type="module">` block replaced)
- Create: `tools/headless/cdp.mjs`, `tools/headless/viewer-check.mjs`

**Interfaces:**
- Produces (`clip-player.js`): `ONE_SHOTS: Set<string>`; `createClipPlayer(actions, { loopOnce }) -> { play(name, fade), step(dt), current }` (`current` getter = the AnimationAction last played).
- Produces (`controller.js`): `GRAVITY`, `CTRL`, `KEYMAP`, `MAPPED: Set<string>`, `launchSpeed(h)`, `FLAT_WORLD`; `createController({ rat, actions, speeds, play, current, world = FLAT_WORLD }) -> { press(code), release(code), releaseAll(), clipFinished(name), update(dt), reset(), state, speed }`. `rat` needs only `position {x,y,z}` and `rotation {y}`. `world = { step, groundHeight(x, z, footY), move(from{x,z}, to{x,z}, footY) -> {x,z} }`.
- Produces (`camera.js`): `swingBehind(camera, target, yaw, dt, rate = 2.5)` mutates `camera.position` x/z.
- Produces (`test/rig.js`): `makeRig(world?) -> { rat, c, played, step(seconds, dt?), until(pred, maxSeconds, dt?) }`.
- Produces (`tools/headless/cdp.mjs`): `ROOT`, `sleep(ms)`, `serveStatic(root?, port?) -> Promise<http.Server>`, `openPage(url, { port? }) -> Promise<{ ev(expr), logs, errors(), waitFor(expr, ms?), screenshot(path), close() }>`, `checker() -> { check(cond, msg), near(v, want, tol, msg), done() }`.

- [ ] **Step 1: Add the root `package.json` and install**

`package.json`:

```json
{
  "name": "mouse-quest",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"game/test/*.test.js\" \"models/rat/viewer/test/*.test.js\"",
    "game": "serve . -l 5180",
    "check:viewer": "node tools/headless/viewer-check.mjs",
    "check:game": "node tools/headless/game-check.mjs"
  },
  "devDependencies": {
    "serve": "14.2.4"
  }
}
```

Run: `npm install` (repo root). Expected: `package-lock.json` created; `node_modules/` is already git-ignored.

- [ ] **Step 2: Write the failing controller tests**

`models/rat/viewer/test/rig.js`:

```js
// Test rig for the shared controller: a fake rat, fake AnimationActions and a recording play().
import { createController, FLAT_WORLD } from '../controller.js';

const CLIPS = ['Idle', 'Walk', 'Run', 'Jump_Start', 'Jump_Air', 'Jump_Land', 'Eat', 'Sniff',
  'Rear_Start', 'Rear_Loop', 'Rear_End', 'Death'];

export function makeRig(world = FLAT_WORLD) {
  const rat = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  const actions = Object.fromEntries(CLIPS.map((name) => [name, {
    name, timeScale: 1, setEffectiveTimeScale(t) { this.timeScale = t; return this; },
  }]));
  let current = null;
  const played = [];
  const play = (name) => { current = actions[name]; played.push(name); };
  const c = createController({ rat, actions, speeds: { Walk: 0.25, Run: 0.8 }, play, current: () => current, world });
  const step = (seconds, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) c.update(dt); };
  const until = (pred, maxSeconds, dt = 1 / 60) => {
    for (let t = 0; t < maxSeconds; t += dt) { if (pred()) return t; c.update(dt); }
    throw new Error(`condition not met within ${maxSeconds} s (state ${c.state})`);
  };
  return { rat, c, played, actions, step, until };
}
```

`models/rat/viewer/test/controller.test.js`:

```js
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
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test`
Expected: collision tests pass; controller tests FAIL with `Cannot find module '.../models/rat/viewer/controller.js'`.

- [ ] **Step 4: Write the shared modules**

`models/rat/viewer/clip-player.js`:

```js
// Crossfading clip player for the rat's AnimationActions (no three.js import).
// three.js fades always run 0->1 / 1->0, so a clip re-selected while still fading out would pop;
// these weight ramps start from each action's current weight instead.
export const ONE_SHOTS = new Set(['Jump_Start', 'Jump_Land', 'Turn_L', 'Turn_R', 'Rear_Start', 'Rear_End', 'Death']);

export function createClipPlayer(actions, { loopOnce }) {
  for (const [name, action] of Object.entries(actions)) {
    if (ONE_SHOTS.has(name)) { action.setLoop(loopOnce); action.clampWhenFinished = true; }
  }
  let current = null;
  const ramps = new Map(); // action -> { from, to, t, dur }
  const ramp = (action, to, dur) => ramps.set(action, { from: action.getEffectiveWeight(), to, t: 0, dur });

  function step(dt) {
    for (const [action, r] of ramps) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      action.setEffectiveWeight(r.from + (r.to - r.from) * k);
      if (k >= 1) { ramps.delete(action); if (r.to === 0) action.stop(); }
    }
  }

  function play(name, fade) {
    const next = actions[name];
    const prev = current;
    if (prev && prev !== next && fade > 0) {
      const finishedHold = ONE_SHOTS.has(name) && next.time >= next.getClip().duration;
      if (next.isRunning() && next.getEffectiveWeight() > 0 && !finishedHold) {
        ramp(next, 1, fade); // still fading out: keep its time, fade back in from where it is
      } else {
        next.reset().setEffectiveWeight(0).play();
        ramps.delete(next);
        ramp(next, 1, fade);
      }
      ramp(prev, 0, fade);
    } else {
      ramps.delete(next);
      next.reset().setEffectiveWeight(1).play();
      if (prev && prev !== next) { ramps.delete(prev); prev.stop(); }
    }
    current = next;
  }

  return { play, step, get current() { return current; } };
}
```

`models/rat/viewer/camera.js`:

```js
// Swing a camera round its orbit target until it sits behind something facing `yaw`
// (forward = (sin yaw, cos yaw) in x/z). Eases with rate; leaves the height alone.
export function swingBehind(camera, target, yaw, dt, rate = 2.5) {
  const ox = camera.position.x - target.x;
  const oz = camera.position.z - target.z;
  let d = Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) - Math.atan2(ox, oz);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const a = d * (1 - Math.exp(-rate * dt));
  const c = Math.cos(a), s = Math.sin(a);
  camera.position.x = target.x + ox * c + oz * s;
  camera.position.z = target.z - ox * s + oz * c;
}
```

`models/rat/viewer/controller.js`:

```js
// Keyboard controller for the rat (tank controls), shared by the viewer and the parkour game.
// No three.js import: the rat only needs position {x, y, z} and rotation {y}.
// W/S move along the rat's facing (local +Z), A/D rotate it. Clips stay in place; this code
// moves the object at the clip's speed so planted feet don't slide. Backward walking plays
// Walk reversed at half speed (and moves at half speed) for the same reason.
// Rats are strong jumpers: a standing rat clears ~35 cm, a running one leaps ~1 m.
export const GRAVITY = 9.81;
export const CTRL = { turnRate: 2.1, runTurnRate: 3.0, backScale: 0.5, turnInPlaceScale: 0.5,
                      jumpHeight: 0.35,                   // standing jump, m
                      leapHeight: 0.25,                   // moving jump, m
                      leapSpeed: { walk: 1.2, run: 2.2 }, // forward speed through a moving jump, m/s
                      jumpCut: 0.4,  // releasing Space while rising keeps this fraction of the upward speed
                      landRecover: 0.12, fade: 0.2 };
export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'], eat: ['KeyE'], rear: ['KeyR'], sniff: ['KeyF'], die: ['KeyX'],
};
export const MAPPED = new Set(Object.values(KEYMAP).flat());
export const launchSpeed = (height) => Math.sqrt(2 * GRAVITY * height);
// Endless flat ground at height 0 with no walls: the viewer's world.
export const FLAT_WORLD = { step: 0.015, groundHeight: () => 0, move: (from, to) => to };

// States in which the keys may pick a new clip; all others wait for a clip to finish.
// 'recover' is a pass-through after a moving landing: the next frame crossfades from Jump_Land.
const FREE = new Set(['idle', 'walk', 'run', 'back', 'turn', 'eat', 'sniff', 'recover']);

export function createController({ rat, actions, speeds, play, current, world = FLAT_WORLD }) {
  const held = new Set();
  const isDown = (action) => KEYMAP[action].some((code) => held.has(code));
  let state = 'idle';
  let speed = 0;       // current forward speed, m/s (negative = backward)
  let airSpeed = 0;    // forward speed locked in at take-off (momentum through the air)
  let vy = 0;
  let jumpCut = false; // upward speed already cut because Space was released
  let stateTime = 0;   // seconds spent in the current state

  function enter(next, clip, timeScale = 1, fade = CTRL.fade) {
    if (next !== state) stateTime = 0;
    state = next;
    actions[clip].setEffectiveTimeScale(timeScale);
    if (current() !== actions[clip]) play(clip, fade); // Walk/back/turn share a clip: only timeScale changes
  }

  // What the movement keys ask for right now; used on the ground and during jumps alike.
  function moveIntent() {
    const fwd = isDown('forward') - isDown('back');
    const turn = isDown('left') - isDown('right');
    const running = fwd > 0 && isDown('run');
    const v = fwd > 0 ? speeds[running ? 'Run' : 'Walk'] : fwd < 0 ? -speeds.Walk * CTRL.backScale : 0;
    return { fwd, turn, running, speed: v };
  }

  // Move d metres along the facing through the world; false if a wall stopped the move.
  function moveForward(d) {
    if (d === 0) return true;
    const p = rat.position;
    const to = { x: p.x + Math.sin(rat.rotation.y) * d, z: p.z + Math.cos(rat.rotation.y) * d };
    const r = world.move({ x: p.x, z: p.z }, to, p.y);
    p.x = r.x;
    p.z = r.z;
    return r.x === to.x && r.z === to.z;
  }

  function steer(m, dt) {
    rat.rotation.y += m.turn * (m.running ? CTRL.runTurnRate : CTRL.turnRate) * dt;
    speed = m.speed;
    moveForward(speed * dt);
  }

  // On the ground: follow small steps, or start falling if the ground dropped away.
  function settle() {
    const p = rat.position;
    const g = world.groundHeight(p.x, p.z, p.y);
    if (g >= p.y - world.step) { p.y = g; return true; }
    vy = 0;
    airSpeed = speed;
    jumpCut = true; // nothing to cut: it walked off an edge
    enter('air', 'Jump_Air', 1, 0.1);
    return false;
  }

  function takeOff() {
    const m = moveIntent();
    if (m.speed > 0) { // forward leap: lower and long
      vy = launchSpeed(CTRL.leapHeight);
      airSpeed = m.running ? CTRL.leapSpeed.run : CTRL.leapSpeed.walk;
    } else {           // standing (or backing) jump: straight up
      vy = launchSpeed(CTRL.jumpHeight);
      airSpeed = m.speed;
    }
    jumpCut = false;
    enter('air', 'Jump_Air', 1, 0.1);
  }

  function onPress(code) {
    if (state === 'dead') { enter('idle', 'Idle', 1, 0.3); return; }
    if (!FREE.has(state)) return;
    if (KEYMAP.jump.includes(code)) {
      // Standing jumps crouch first; a moving rat leaves the ground straight away.
      if (moveIntent().speed > 0) takeOff();
      else enter('jump_start', 'Jump_Start', 1, 0.1);
    }
    else if (KEYMAP.rear.includes(code)) enter('rear_start', 'Rear_Start');
    else if (KEYMAP.die.includes(code)) enter('dead', 'Death');
  }

  function clipFinished(name) {
    if (name === 'Jump_Start' && state === 'jump_start') takeOff();
    else if ((name === 'Jump_Land' && state === 'land') || (name === 'Rear_End' && state === 'rear_end')) enter('idle', 'Idle');
    else if (name === 'Rear_Start' && state === 'rear_start') {
      if (isDown('rear')) enter('rear', 'Rear_Loop', 1, 0);
      else enter('rear_end', 'Rear_End', 1, 0);
    }
  }

  function updateAir(m, dt) {
    // Momentum carries the rat; the keys can only turn it. A wall stops the forward motion.
    rat.rotation.y += m.turn * CTRL.turnRate * dt;
    speed = airSpeed;
    if (!moveForward(speed * dt)) airSpeed = speed = 0;
    // Hold Space for the full jump; let go early (or just tap it) for a lower, shorter hop.
    if (!jumpCut && vy > 0 && !isDown('jump')) { vy *= CTRL.jumpCut; jumpCut = true; }
    const p = rat.position;
    const y0 = p.y;
    p.y += vy * dt - 0.5 * GRAVITY * dt * dt; // exact parabola step: same arc at any frame rate
    vy -= GRAVITY * dt;
    const g = world.groundHeight(p.x, p.z, Math.max(y0, p.y)); // surfaces passed this step count
    if (vy <= 0 && p.y <= g) { p.y = g; vy = 0; enter('land', 'Jump_Land', 1, 0.1); }
  }

  function update(dt) {
    stateTime += dt;
    const m = moveIntent();
    if (state === 'air') { updateAir(m, dt); return; }
    if (state === 'jump_start' || state === 'land') {
      steer(m, dt); // crouch and landing: the keys drive the rat as on the ground
      if (!settle()) return;
      if (state === 'land' && m.speed !== 0 && stateTime >= CTRL.landRecover) {
        state = 'recover'; // locomotion below picks the clip on the next frame
      }
      return;
    }
    if (state === 'rear' && !isDown('rear')) { enter('rear_end', 'Rear_End', 1, 0.15); return; }
    if (!FREE.has(state)) { speed = 0; return; }

    if (m.fwd > 0) enter(m.running ? 'run' : 'walk', m.running ? 'Run' : 'Walk');
    else if (m.fwd < 0) enter('back', 'Walk', -CTRL.backScale);
    else if (m.turn) enter('turn', 'Walk', CTRL.turnInPlaceScale);
    else if (isDown('eat')) enter('eat', 'Eat');
    else if (isDown('sniff')) enter('sniff', 'Sniff');
    else if (state !== 'idle') enter('idle', 'Idle');
    steer(m, dt);
    settle();
  }

  // Back to a calm idle on the spot (the caller places the rat first).
  function reset() {
    held.clear();
    speed = airSpeed = vy = 0;
    jumpCut = false;
    state = 'reset';
    enter('idle', 'Idle', 1, 0);
  }

  return {
    press(code) { held.add(code); onPress(code); },
    release(code) { held.delete(code); },
    releaseAll() { held.clear(); },
    clipFinished, update, reset,
    get state() { return state; },
    get speed() { return speed; },
  };
}
```

Note the two small behaviour changes from the viewer's inline controller, both needed for the game and invisible in the viewer's flat world: `settle()` lets a rat walk off an edge into a fall, and `clipFinished` ignores a clip that finishes after the controller has left that state (e.g. Jump_Start ending after the rat walked off an edge mid-crouch). The dead → idle respawn no longer sets `y = 0` (the flat world keeps the rat at 0; the game restarts by placing the rat).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all collision and controller tests pass (27 tests), output free of warnings.

- [ ] **Step 6: Switch the viewer to the shared modules**

In `models/rat/viewer/index.html`, replace everything from `<script type="module">` to its closing `</script>` with:

```html
<script type="module">
// Reference for game code:
//  - Clips are in place. Move the rat yourself at gltf.scene.userData.clipSpeeds[clip] m/s
//    along its local +Z (Walk 0.25, Run 0.8) so the feet don't slide.
//  - Jump_Start -> Jump_Air is not pose-continuous: use a short crossfade between them.
//  - One-shots play once and hold their last frame (LoopOnce + clampWhenFinished).
//  - Turn_L/Turn_R end rotated ±90° relative to the root: when they finish, add the
//    rotation to the object (rotation.y += ±PI/2) and switch to Idle with no crossfade.
//  - Keyboard driving lives in controller.js, crossfades in clip-player.js (shared with game/).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClipPlayer } from './clip-player.js';
import { createController, MAPPED } from './controller.js';
import { swingBehind } from './camera.js';

const TURNS = { Turn_L: Math.PI / 2, Turn_R: -Math.PI / 2 };
const WRAP_RADIUS = 3; // m: past this the rat is put back at the centre
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2126);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0.45, 0.3, 0.55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.05, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(0.6, 1.2, 0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 3 });
scene.add(sun, sun.target);
const SUN_OFFSET = sun.position.clone();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a4048 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(4, 80, 0x66707a, 0x4a525a); // 5 cm cells
grid.position.y = 0.0005;
scene.add(grid);

const gltf = await new GLTFLoader().loadAsync('../dist/rat.glb');
const rat = gltf.scene;
rat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(rat);
const speeds = rat.userData.clipSpeeds ?? {};

const skeleton = new THREE.SkeletonHelper(rat);
skeleton.visible = false;
scene.add(skeleton);

const mixer = new THREE.AnimationMixer(rat);
const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
const player = createClipPlayer(actions, { loopOnce: THREE.LoopOnce });

function play(name, fade = Number($('fade').value)) {
  player.play(name, fade);
  for (const b of $('clips').children) b.classList.toggle('active', b.textContent === name);
  const speed = speeds[name];
  $('status').textContent = `${name}${speed ? ` · ${speed} m/s` : ''} · ${gltf.animations.length} clips · ${skeleton.bones.length} joints`;
}

const controller = createController({ rat, actions, speeds, play, current: () => player.current });

mixer.addEventListener('finished', (e) => {
  if (e.action !== player.current) return;
  const name = e.action.getClip().name;
  if (name in TURNS) {
    rat.rotation.y += TURNS[name];
    play('Idle', 0);
  } else if ($('keyboard').checked) {
    controller.clipFinished(name);
  }
});

for (const clip of gltf.animations) {
  const b = document.createElement('button');
  b.textContent = clip.name;
  b.onclick = () => { actions[clip.name].setEffectiveTimeScale(1); play(clip.name); };
  $('clips').appendChild(b);
}

addEventListener('keydown', (e) => {
  if (!$('keyboard').checked || !MAPPED.has(e.code)) return;
  e.preventDefault(); // no page scrolling, no slider nudging
  if (document.activeElement !== document.body) document.activeElement.blur();
  if (e.repeat) return;
  controller.press(e.code);
});
addEventListener('keyup', (e) => controller.release(e.code));
addEventListener('blur', () => controller.releaseAll());

const syncLabels = () => {
  $('fadeVal').textContent = Number($('fade').value).toFixed(2);
  $('speedVal').textContent = Number($('speed').value).toFixed(2);
  mixer.timeScale = Number($('speed').value);
};
$('fade').oninput = $('speed').oninput = syncLabels;
syncLabels();
$('skeleton').onchange = (e) => { skeleton.visible = e.target.checked; };
$('wireframe').onchange = (e) => rat.traverse((o) => { if (o.isMesh) o.material.wireframe = e.target.checked; });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const before = new THREE.Vector3();
const delta = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // no huge step after a background tab
  player.step(dt);
  mixer.update(dt);
  before.copy(rat.position);
  const keyboard = $('keyboard').checked;
  const name = player.current?.getClip().name;
  if (keyboard) {
    controller.update(dt * mixer.timeScale);
  } else if ($('move').checked && speeds[name]) {
    rat.translateZ(speeds[name] * dt * mixer.timeScale);
  }
  if (Math.hypot(rat.position.x, rat.position.z) > WRAP_RADIUS) rat.position.set(0, rat.position.y, 0);
  delta.subVectors(rat.position, before);
  camera.position.add(delta);
  controls.target.add(delta);
  if (keyboard && controller.speed !== 0) swingBehind(camera, controls.target, rat.rotation.y, dt);
  sun.position.copy(rat.position).add(SUN_OFFSET); // keep the shadow camera on the rat
  sun.target.position.copy(rat.position);
  controls.update();
  renderer.render(scene, camera);
});

play('Idle');
window.ratViewer = {
  play, actions, mixer, rat,
  get state() { return controller.state; },
  key(code, pressed) { // for scripted tests: same path as real key events
    dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { code }));
  },
};
</script>
```

- [ ] **Step 7: Write the headless driver and the viewer check**

`tools/headless/cdp.mjs`:

```js
// Minimal headless-browser test driver: a static file server plus the Chrome DevTools Protocol
// over Node 24's global WebSocket. Uses a locally installed Edge or Chrome; no npm dependencies.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const BROWSERS = [process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'];

export function serveStatic(root = ROOT, port = 5199) {
  const server = createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const file = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

export async function openPage(url, { port = 9230 } = {}) {
  const exe = BROWSERS.find((p) => p && existsSync(p));
  if (!exe) throw new Error('no Edge or Chrome found; set BROWSER to the browser executable');
  const profile = mkdtempSync(join(tmpdir(), 'rat-cdp-'));
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800', 'about:blank'],
  { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(100); }
  }
  if (!targets) throw new Error('browser did not open its DevTools port');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`exception: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      logs.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) => {
    const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
    if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  return {
    ev, logs,
    errors: () => logs.filter((l) => !l.includes('favicon.ico')),
    async waitFor(expression, ms = 20000) {
      for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await ev(expression)) return;
      throw new Error(`timed out waiting for ${expression}`);
    },
    async screenshot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      ws.close();
      proc.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold it */ }
    },
  };
}

export function checker() {
  const failures = [];
  const check = (ok, msg) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (!ok) failures.push(msg);
  };
  const near = (v, want, tol, msg) => check(Math.abs(v - want) <= tol, `${msg}: ${v.toFixed(3)} (want ${want} ± ${tol})`);
  const done = () => {
    if (failures.length) { console.error(`${failures.length} check(s) failed`); process.exitCode = 1; }
    else console.log('all checks passed');
  };
  return { check, near, done };
}
```

`tools/headless/viewer-check.mjs`:

```js
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
```

- [ ] **Step 8: Run the viewer check**

Run: `npm run check:viewer`
Expected: every line `ok`, then `all checks passed`, exit 0. The test runs at software-rendered frame rates (10–20 fps); tolerances allow for that.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json models/rat/viewer tools/headless/cdp.mjs tools/headless/viewer-check.mjs
git commit -m "Share the rat controller between viewer and game; add headless viewer check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The level and controller-world behaviour

**Files:**
- Create: `game/level.js`
- Test: `game/test/level.test.js`
- Test: `game/test/controller-world.test.js`

**Interfaces:**
- Consumes: `game/collision.js` (`top`, `groundHeight`, `makeWorld`, `RAT_RADIUS`, `STEP`); `models/rat/viewer/controller.js` (`CTRL`, `GRAVITY`); `models/rat/viewer/test/rig.js` (`makeRig`).
- Produces: `level = { boxes, start: { x, z, top, yaw }, goal: { x, z, w, d, top }, killY }` (named export `level`), boxes in path order.

- [ ] **Step 1: Write the failing tests**

`game/test/level.test.js`:

```js
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
```

`game/test/controller-world.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, RAT_RADIUS } from '../collision.js';
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
  assert.equal(rat.position.y, -0.2);
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: `level.test.js` FAILS with `Cannot find module '.../game/level.js'`; the controller-world tests pass already (they exercise Task 1 and Task 2 code) — if any of them fails, fix the controller or collision code before going on, since the level relies on this behaviour.

- [ ] **Step 3: Write `game/level.js`**

```js
// The prototype course: axis-aligned boxes in path order (see the design spec, "Level").
// Units are metres. The rat starts facing +Z; its left is +X. Box y is the bottom face.
const H = 0.1; // thickness below the top for flat blocks
const box = (x, z, w, d, topY, h = H) => ({ x, y: topY - h, z, w, d, h });

const boxes = [
  box(0, 0, 0.40, 0.40, 0),                   // 1 start platform
  box(0, 0.70, 0.15, 1.00, 0),                // 2 warm-up path, 15 cm wide (z 0.2..1.2)
  box(0, 1.45, 0.08, 0.50, 0),                //   narrowing to 8 cm (z 1.2..1.7)
  box(0, 2.15, 0.40, 0.40, 0),                // 3 after a 25 cm gap: zig-zag pad 1 (z 1.95..2.35)
  box(0.50, 2.15, 0.60, 0.06, 0),             // 4 beam turning left (x 0.2..0.8)
  box(0.90, 2.15, 0.20, 0.20, 0),             //   pad 2
  box(0.90, 2.55, 0.06, 0.60, 0),             //   beam turning right (z 2.25..2.85)
  box(0.90, 2.95, 0.20, 0.20, 0),             //   pad 3
  box(1.30, 2.95, 0.60, 0.06, 0),             //   beam turning left (x 1.0..1.6)
  box(1.70, 2.95, 0.20, 0.20, 0),             //   pad 4 (x 1.6..1.8)
  box(1.95, 2.95, 0.30, 0.25, 0.10, 0.20),    // 5 stairs: +10 cm (solid to the base so they are walls)
  box(2.25, 2.95, 0.30, 0.25, 0.25, 0.35),    //   +15 cm
  box(2.55, 2.95, 0.30, 0.25, 0.45, 0.55),    //   +20 cm
  box(2.90, 2.95, 0.40, 0.40, 0.05),          // 6 landing after a 40 cm drop (x 2.7..3.1)
  box(3.70, 2.95, 1.20, 0.035, 0.05),         // 7 balance beam, 3.5 cm (x 3.1..4.3)
  box(4.90, 2.95, 1.20, 0.20, 0.05),          // 8 run-up (x 4.3..5.5)
  box(6.55, 2.95, 0.50, 0.50, 0.05),          // 9 goal platform after an 80 cm gap (x 6.3..6.8)
];

export const level = {
  boxes,
  start: { x: 0, z: 0, top: 0, yaw: 0 },
  goal: { x: 6.55, z: 2.95, w: 0.2, d: 0.2, top: 0.05 },
  killY: Math.min(...boxes.map((b) => b.y + b.h)) - 0.3,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all 40 tests pass, no warnings.

- [ ] **Step 5: Commit**

```bash
git add game/level.js game/test/level.test.js game/test/controller-world.test.js
git commit -m "Add the parkour course and controller-world tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The game page

**Files:**
- Create: `game/index.html`
- Create: `tools/headless/game-check.mjs`

**Interfaces:**
- Consumes: `createClipPlayer`, `createController`, `MAPPED`, `swingBehind` (Task 2); `makeWorld`, `onGoal`, `hasFallen` (Task 1); `level` (Task 3); `cdp.mjs` (Task 2).
- Produces: `window.ratGame = { state, ctrlState, speed, rat, level, key(code, pressed), teleport(x, y, z, yaw) }`.

- [ ] **Step 1: Write the failing game check**

`tools/headless/game-check.mjs`:

```js
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
  await sleep(500);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run check:game`
Expected: FAIL — `timed out waiting for !!window.ratGame` (the page doesn't exist yet), non-zero exit.

- [ ] **Step 3: Write `game/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rat parkour</title>
<style>
  body { margin: 0; overflow: hidden; background: #101418; color: #e8e8e8; font: 14px system-ui, sans-serif; }
  #hud { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); padding: 14px 22px;
         border-radius: 8px; background: #000b; font-size: 20px; text-align: center; pointer-events: none; }
  #help { position: absolute; bottom: 8px; left: 8px; padding: 6px 10px; border-radius: 6px; background: #0008;
          font-size: 12px; line-height: 1.6; }
  #help kbd { padding: 0 4px; border: 1px solid #fff5; border-radius: 3px; font: inherit; }
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
</head>
<body>
<div id="hud" hidden></div>
<div id="help">
  <kbd>W</kbd>/<kbd>↑</kbd> walk · <kbd>Shift</kbd> run · <kbd>S</kbd>/<kbd>↓</kbd> back ·
  <kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> turn · <kbd>Space</kbd> jump (hold = higher; while moving = leap)
</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClipPlayer } from '../models/rat/viewer/clip-player.js';
import { createController, MAPPED } from '../models/rat/viewer/controller.js';
import { swingBehind } from '../models/rat/viewer/camera.js';
import { hasFallen, makeWorld, onGoal } from './collision.js';
import { level } from './level.js';

const CAMERA_BACK = 0.75; // m behind the rat
const CAMERA_UP = 0.4;    // m above it
const TARGET_UP = 0.05;   // look at a point this high above the rat's feet
const MESSAGES = {
  ready: 'Reach the green pad — press any key to start',
  fell: 'You fell! Press Space to restart',
  won: 'You made it! Press Space to restart',
};
const hud = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
const SUN_OFFSET = new THREE.Vector3(0.8, 1.5, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 4 });
scene.add(sun, sun.target);

const floorGrid = new THREE.GridHelper(60, 240, 0x2a3440, 0x1c232b); // far floor for depth
floorGrid.position.y = -3;
scene.add(floorGrid);

const blockMat = new THREE.MeshStandardMaterial({ color: 0x5a6b80, roughness: 0.8 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0xa8bdd6 });
for (const b of level.boxes) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const mesh = new THREE.Mesh(geo, blockMat);
  mesh.position.set(b.x, b.y + b.h / 2, b.z);
  mesh.castShadow = mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  edges.position.copy(mesh.position);
  scene.add(mesh, edges);
}
const { goal } = level;
const pad = new THREE.Mesh(new THREE.BoxGeometry(goal.w, 0.004, goal.d),
  new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x22cc66, emissiveIntensity: 1.2 }));
pad.position.set(goal.x, goal.top + 0.002, goal.z);
scene.add(pad);

const gltf = await new GLTFLoader().loadAsync('../models/rat/dist/rat.glb');
const rat = gltf.scene;
rat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(rat);
const speeds = rat.userData.clipSpeeds ?? {};

const mixer = new THREE.AnimationMixer(rat);
const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
const player = createClipPlayer(actions, { loopOnce: THREE.LoopOnce });
const controller = createController({
  rat, actions, speeds, play: player.play, current: () => player.current, world: makeWorld(level.boxes),
});
mixer.addEventListener('finished', (e) => {
  if (e.action === player.current) controller.clipFinished(e.action.getClip().name);
});

let game = 'ready';
function setGame(next) {
  game = next;
  hud.textContent = MESSAGES[next] ?? '';
  hud.hidden = !MESSAGES[next];
}

function placeCamera() {
  const p = rat.position;
  controls.target.set(p.x, p.y + TARGET_UP, p.z);
  camera.position.set(p.x - Math.sin(rat.rotation.y) * CAMERA_BACK, p.y + CAMERA_UP,
    p.z - Math.cos(rat.rotation.y) * CAMERA_BACK);
  controls.update();
}

function place(x, y, z, yaw) {
  rat.position.set(x, y, z);
  rat.rotation.y = yaw;
  controller.reset();
  placeCamera();
}

function restart() {
  const { start } = level;
  place(start.x, start.top, start.z, start.yaw);
  setGame('ready');
}

addEventListener('keydown', (e) => {
  if (!MAPPED.has(e.code)) return;
  e.preventDefault(); // no page scrolling
  if (e.repeat) return;
  if (game === 'fell' || game === 'won') {
    if (e.code === 'Space') restart(); // this press only restarts; it doesn't reach the rat
    return;
  }
  if (game === 'ready') setGame('playing');
  controller.press(e.code);
});
addEventListener('keyup', (e) => controller.release(e.code));
addEventListener('blur', () => controller.releaseAll());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const before = new THREE.Vector3();
const delta = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // no huge step after a background tab
  player.step(dt);
  mixer.update(dt);
  before.copy(rat.position);
  controller.update(dt);
  if (game === 'playing') {
    if (hasFallen(rat.position, level)) { controller.releaseAll(); setGame('fell'); }
    else if (onGoal(rat.position, goal)) { controller.releaseAll(); setGame('won'); }
  }
  if (game !== 'fell') { // when it falls, the camera stays put and watches it drop
    delta.subVectors(rat.position, before);
    delta.y = 0;
    camera.position.add(delta);
    controls.target.add(delta);
    // Ease the height so jumps and drops don't jerk the view.
    const dy = (rat.position.y + TARGET_UP - controls.target.y) * (1 - Math.exp(-4 * dt));
    controls.target.y += dy;
    camera.position.y += dy;
    if (controller.speed !== 0) swingBehind(camera, controls.target, rat.rotation.y, dt);
  }
  sun.position.copy(rat.position).add(SUN_OFFSET); // keep the shadow camera on the rat
  sun.target.position.copy(rat.position);
  controls.update();
  renderer.render(scene, camera);
});

restart();
window.ratGame = {
  get state() { return game; },
  get ctrlState() { return controller.state; },
  get speed() { return controller.speed; },
  rat, level,
  key(code, pressed) { // for scripted tests: same path as real key events
    dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { code }));
  },
  teleport: place,
};
</script>
</body>
</html>
```

- [ ] **Step 4: Run the game check to verify it passes**

Run: `npm run check:game`
Expected: every line `ok`, `all checks passed`, exit 0; screenshot at `models/rat/build/previews/game.png`. Open the screenshot (Read tool) and confirm the blocks, the rat and the HUD are visible.
If the first-gap leap lands short or long, the check prints the landing z: adjust the take-off point in the check (`tp(0, 0, 1.6, 0)`), not the level, unless the leap can't land on the pad from any point before the edge (z ≤ 1.7) — then report it.

- [ ] **Step 5: Run everything once more**

Run: `npm test && npm run check:viewer && npm run check:game`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add game/index.html tools/headless/game-check.mjs
git commit -m "Add the rat parkour game page and its headless check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
