# Rat Parkour Prototype — Design

Date: 2026-10-25
Status: Draft — awaiting review

## Goal

Find out whether rat parkour is fun. Build one hand-made level in the browser where
the player drives the rigged rat (`models/rat/dist/rat.glb`) along narrow paths and
across gaps to a goal. Falling off means game over and a restart from the beginning.
This is a throwaway-quality prototype: keep it as simple as possible.

## Decisions (agreed during brainstorming)

| Topic | Decision |
|---|---|
| Purpose | Playable prototype of one level, to judge feel |
| Look | Abstract blocks floating over a void |
| Obstacles | Narrow beams, gaps, height changes, zig-zag turns |
| Not included | Moving platforms, timer, checkpoints, menus, lives, sound, slopes, ledge grabbing |
| Approach | Custom axis-aligned box collision, no physics engine |
| Controls | Same keyboard controller as the viewer, shared code |
| Fail | Falling below the level shows "You fell!", Space restarts at the start |
| Win | Stepping on the goal pad shows "You made it!", Space restarts |

## Files

```
game/
  index.html        game page: scene, chase camera, lights, HUD, game states
  level.js          level data: boxes, start, goal
  collision.js      pure functions: groundHeight, moveWithWalls, onGoal, hasFallen
  test/             node --test unit tests (collision, level sanity)
models/rat/viewer/
  controller.js     keyboard controller moved out of viewer/index.html
  index.html        imports controller.js; behaviour unchanged
package.json        repo root: "game" script serving the repo root
```

The game is served from the repo root so it can load `models/rat/dist/rat.glb` and
`models/rat/viewer/controller.js`. Both pages keep three.js 0.170.0 from the existing
pinned import map.

## Shared controller

`controller.js` holds the current viewer controller unchanged in behaviour: tank
controls (W/S/arrows move along local +Z at the clip speed, Shift runs, S walks back
with Walk reversed at half speed, A/D turn), Space jump with hold-for-higher
(`jumpHeight` 0.35 m standing, `leapHeight` 0.25 m moving, `leapSpeed` walk 1.2 /
run 2.2 m/s, `jumpCut` 0.4), E/R/F/X poses, the clip state machine, exact parabola
integration. It is created with the rat, its actions, the `play()` crossfade function
and a **world** object:

- `world.groundHeight(x, z, footY)`: height of the surface the rat would stand on.
- `world.move(from, to)`: returns the reachable position after walls (sliding).

The viewer passes a flat world (ground 0, no walls), so it behaves exactly as before.
The game passes the level. Gravity, landing and "walked off an edge → fall" live in
the controller, so falling plays Jump_Air and touchdown plays Jump_Land in both
pages.

## Collision rules (`collision.js`)

All functions are pure and take the level's box list. Boxes are axis-aligned:
`{ x, y, z, w, h, d }` = centre x, bottom y, centre z, size along x/y/z, in metres.

- **Rat footprint**: a circle of radius `RAT_RADIUS = 0.02` m around the body centre
  (the rat's object origin, between its paws). Tail and nose may hang over edges.
- **groundHeight(x, z, footY)**: the highest box top whose top-down rectangle contains
  the point (x, z) and whose top is ≤ `footY + STEP` (`STEP = 0.015` m). Returns
  `-Infinity` when there is no such box. The point test (not the circle) is used so
  the rat goes over an edge once its centre is past it: forgiving on narrow beams.
- **moveWithWalls(from, to, footY)**: a box blocks if its top is more than `STEP`
  above `footY` and it overlaps the rat's circle at `to`. Movement is resolved per
  axis (x then z) so the rat slides along walls instead of stopping.
- **onGoal(pos, goal)**: true when the body centre is inside the goal pad rectangle
  and the rat is standing on it.
- **hasFallen(pos, level)**: true when `pos.y < level.killY` (0.3 m below the lowest
  block top).

### Controller use of the world

- Standing: if `groundHeight` is within `STEP` of the feet, snap to it; this also
  climbs small steps.
- If `groundHeight` is lower than the feet (or none), the rat falls under gravity
  9.81 m/s² with its current forward speed as momentum and plays Jump_Air.
- During any airborne phase the rat lands on the first surface its feet reach going
  down; a wall hit mid-air stops horizontal motion and the rat keeps falling.

## Level (`level.js`)

About 10 m long, floating over a dark void with a faint floor grid 3 m below.
Blocks are blue-grey with lighter top edges; the goal pad glows green.

1. Start platform 40 × 40 cm.
2. Warm-up path 15 cm wide, 1.5 m long, narrowing to 8 cm.
3. Gap of 25 cm (walking leap).
4. Zig-zag: three 6 cm beams joined by small square pads, turning left, right, left
   by 90°.
5. Stairs up: blocks stepping up 10, 15 and 20 cm. A step is climbed with a moving
   leap (W held + Space; the last one needs Space held). A standing jump goes straight
   up with no forward momentum, so it can't carry the rat onto a step.
6. Drop of 40 cm onto a landing platform.
7. Balance beam 3.5 cm wide, 1.2 m long.
8. Big leap: 1.2 m run-up, then an 80 cm gap (running leap with Space held).
9. Goal platform with the glowing pad.

The rat starts on the start platform facing along the path. A careful run takes about
a minute. Every size is a number in `level.js`.

## Game page (`game/index.html`)

- States: `ready` (hint "Reach the goal", first key starts), `playing`,
  `fell` ("You fell! Press Space to restart"), `won` ("You made it! Press Space to
  restart"). Restart puts the rat back on the start, facing the path, in Idle.
- Chase camera as in the viewer, a little higher and farther back, easing on
  vertical motion; mouse orbit still allowed.
- The directional light's shadow camera follows the rat.
- `window.ratGame` exposes state, the rat, `key(code, pressed)` and a teleport helper
  for scripted tests.

## Testing

- **Unit tests** (`node --test game/test`): groundHeight on, between and beside boxes;
  step climbing; wall blocking and sliding per axis; onGoal; hasFallen.
- **Level sanity test**: every step up ≤ 85 % of `leapHeight` (0.21 m), every gap
  ≤ the running-leap distance computed from the controller's jump constants minus a
  15 % margin, every beam ≥ 0.03 m wide, start and goal on blocks.
- **Viewer regression**: the existing headless keyboard checks (walk/run/back
  distances, turn, jump states, rear/eat/sniff/death) still pass after the controller
  is moved out.
- **Headless game check** (local Edge over the DevTools protocol, same as the viewer
  checks): no console errors except the favicon; rat starts on the start block;
  walking off the side of the warm-up path ends in `fell`, Space restarts at the
  start; a scripted run across the first gap and through the zig-zag lands on the
  blocks; teleporting next to the goal and stepping on it gives `won`.

## Done

Unit tests and headless checks pass, then the user plays the level and judges the
feel.
