// Axis-aligned box collision for the rat parkour prototype (pure functions, no three.js).
// Box: { x, y, z, w, h, d } = centre x, bottom y, centre z, size along x/y/z, in metres.
export const RAT_RADIUS = 0.02; // the rat's footprint: a circle around its body centre
export const RAT_HEIGHT = 0.08; // boxes entirely above this (over its head) don't block it
export const MAX_WALK_SLOPE = .6; // about 31 degrees
export const STEP = 0.015;      // steps up to this height are climbed without jumping

export const surfaceHeight = (b, x, z) => b.y + b.h + (b.slopeX ?? 0) * (x - b.x) + (b.slopeZ ?? 0) * (z - b.z);
export const top = (b) => b.y + b.h;

function localPoint(b,x,z) {
  const c=Math.cos(b.yaw ?? 0),s=Math.sin(b.yaw ?? 0),dx=x-b.x,dz=z-b.z;
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}
const inside = (b,x,z) => { const p=localPoint(b,x,z); return Math.abs(p.x)<=b.w/2 && Math.abs(p.z)<=b.d/2; };

// Distance from the point to the box's top-down rectangle (0 inside it).
function gap(b, x, z) {
  const p=localPoint(b,x,z);
  return Math.hypot(Math.max(Math.abs(p.x)-b.w/2,0),Math.max(Math.abs(p.z)-b.d/2,0));
}

const isWall = (b, footY) => top(b) > footY + STEP && b.y < footY + RAT_HEIGHT;

// Highest box top under the point that the rat can stand on from footY (a point test, so
// the rat goes over an edge once its body centre is past it). -Infinity if there is none.
export function groundHeight(boxes, x, z, footY) {
  let best = -Infinity;
  for (const b of boxes) {
    const t = surfaceHeight(b, x, z);
    if (t <= footY + STEP && t > best && inside(b, x, z)) best = t;
  }
  return best;
}

// A wall blocks any move that would bring the rat's circle closer into it. A rat already
// touching one (e.g. it began to overlap a block while still above its top, then dropped
// below it) can move away or along it but never deeper. Resolved per axis, so it slides.
export function moveWithWalls(boxes, from, to, footY, yaw) {
  // Overlapping circles cover the body through the model's 12.7 cm nose. Omitted yaw keeps the point API
  // available for generic collision queries and the animation viewer.
  const support = surfaceAt(boxes,from.x,from.z,footY);
  const offsets = yaw === undefined ? [0] : [-.035, 0, .04, .08, .12];
  const blocked = (x0, z0, x1, z1) => boxes.some(b => {
    const ramp = b.slopeX || b.slopeZ;
    if (ramp && Math.hypot(b.slopeX ?? 0,b.slopeZ ?? 0) > MAX_WALK_SLOPE
      && inside(b,x1,z1) && surfaceHeight(b,x1,z1) > surfaceHeight(b,x0,z0)
      && surfaceHeight(b,x1,z1) > footY + .0001) return true;
    if (ramp && Math.hypot(b.slopeX ?? 0,b.slopeZ ?? 0) <= MAX_WALK_SLOPE && inside(b,x1,z1) && Math.abs(surfaceHeight(b,x0,z0)-footY) <= STEP) return false;
    return offsets.some(offset => {
      const dx = Math.sin(yaw ?? 0)*offset, dz = Math.cos(yaw ?? 0)*offset;
      const h = surfaceHeight(b, Math.max(b.x-b.w/2,Math.min(b.x+b.w/2,x1+dx)),
        Math.max(b.z-b.d/2,Math.min(b.z+b.d/2,z1+dz)));
      const probeY = footY + (offset >= .08 ? .065 : 0) + (support?.slopeX ?? 0)*dx + (support?.slopeZ ?? 0)*dz;
      return h > probeY + STEP && b.y - Math.abs((b.slopeX ?? 0)*b.w/2) - Math.abs((b.slopeZ ?? 0)*b.d/2) < footY + RAT_HEIGHT
        && gap(b,x1+dx,z1+dz) < RAT_RADIUS && gap(b,x1+dx,z1+dz) < gap(b,x0+dx,z0+dz);
    });
  });
  const x = blocked(from.x,from.z,to.x,from.z) ? from.x : to.x;
  const z = blocked(x,from.z,x,to.z) ? from.z : to.z;
  return {x,z};
}

export function canTurn(boxes, pos, oldYaw, newYaw) {
  return !boxes.some(b => !(b.slopeX || b.slopeZ) && isWall(b,pos.y) && [-.035, .04, .08, .12].some(offset => {
    if (top(b) <= pos.y + STEP + (offset >= .08 ? .065 : 0)) return false;
    const distance = yaw => gap(b,pos.x+Math.sin(yaw)*offset,pos.z+Math.cos(yaw)*offset);
    return distance(newYaw) < RAT_RADIUS && distance(newYaw) < distance(oldYaw)-1e-9;
  }));
}

export function surfaceAt(boxes, x, z, y) {
  return boxes.findLast(b => inside(b,x,z) && Math.abs(surfaceHeight(b,x,z)-y) <= STEP) ?? null;
}

export function onGoal(pos, goal) {
  return Math.abs(pos.x - goal.x) <= goal.w / 2 && Math.abs(pos.z - goal.z) <= goal.d / 2
    && Math.abs(pos.y - goal.top) <= STEP;
}

export const hasFallen = (pos, level) => pos.y < level.killY;

// The world interface the shared rat controller expects.
export function makeWorld(boxes, patches = []) {
  return {
    step: STEP,
    groundHeight: (x, z, footY) => groundHeight(boxes, x, z, footY),
    move: (from, to, footY, yaw) => moveWithWalls(boxes, from, to, footY, yaw),
    canTurn: (pos, oldYaw, newYaw) => canTurn(boxes,pos,oldYaw,newYaw),
    surface: (pos) => {
      const b = surfaceAt(boxes,pos.x,pos.z,pos.y);
      if (!b) return {};
      const patch = patches.find(p => inside(p,pos.x,pos.z) && Math.abs(pos.y-p.top) <= STEP);
      return { slopeX: b.slopeX ?? 0, slopeZ: b.slopeZ ?? 0, effect: patch?.effect ?? b.effect };
    },
  };
}
