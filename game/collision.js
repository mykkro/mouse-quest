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
