import { moveWithWalls, surfaceAt, top } from './collision.js';

// Analytic trajectories are deterministic and reset to the same boarding positions.
export function platformPose(b, time) {
  const m=b.motion;
  if (!m) return {x:b.x,y:b.y,z:b.z,yaw:b.yaw ?? 0};
  const wave=(1-Math.cos(2*Math.PI*time/m.period))/2;
  return { x:m.origin.x+(m.dx ?? 0)*wave, y:m.origin.y+(m.dy ?? 0)*wave,
    z:m.origin.z+(m.dz ?? 0)*wave, yaw:(m.origin.yaw ?? 0)+(m.spin ?? 0)*time };
}

export function resetPlatforms(level) {
  for(const b of level.boxes) if(b.motion) Object.assign(b,platformPose(b,0));
}

export function advancePlatforms(level, toTime, rat, grounded) {
  const support=grounded ? surfaceAt(level.boxes,rat.position.x,rat.position.z,rat.position.y) : null;
  const previous=support?.motion ? {x:support.x,z:support.z,y:top(support),yaw:support.yaw ?? 0} : null;
  for(const b of level.boxes) if(b.motion) Object.assign(b,platformPose(b,toTime));
  if(!previous) return;
  const angle=(support.yaw ?? 0)-previous.yaw,c=Math.cos(angle),s=Math.sin(angle);
  const ox=rat.position.x-previous.x,oz=rat.position.z-previous.z;
  const target={x:support.x+ox*c+oz*s,z:support.z-ox*s+oz*c};
  const y=rat.position.y+top(support)-previous.y;
  const others=level.boxes.filter(b=>b!==support);
  // Sweep the carried displacement instead of teleporting through static obstacles.
  const count=Math.max(1,Math.ceil(Math.hypot(target.x-rat.position.x,target.z-rat.position.z)/.008));
  const dx=(target.x-rat.position.x)/count,dz=(target.z-rat.position.z)/count;
  for(let i=0;i<count;i++) Object.assign(rat.position,moveWithWalls(others,rat.position,
    {x:rat.position.x+dx,z:rat.position.z+dz},y,rat.rotation.y+angle));
  rat.position.y=y;
  rat.rotation.y+=angle;
}
