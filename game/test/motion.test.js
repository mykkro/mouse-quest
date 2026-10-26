import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlatforms,resetPlatforms,platformPose} from '../motion.js';
import {groundHeight,makeWorld,top} from '../collision.js';
import {makeRig} from '../../models/rat/viewer/test/rig.js';
import {levels} from '../level.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function moving(settings={}) {
 const b={x:0,y:-.1,z:0,w:1,d:1,h:.1,yaw:0,motion:{origin:{x:0,y:-.1,z:0,yaw:0},period:4,...settings}};
 return {b,level:{boxes:[b]},rat:{position:{x:.2,y:0,z:.1},rotation:{y:0}}};
}
test('shuttle carries a standing rider and preserves its offset',()=>{
 const {b,level,rat}=moving({dx:2,dz:1});advancePlatforms(level,2,rat,true);
 near(b.x,2);near(rat.position.x,2.2);near(rat.position.z,1.1);near(rat.position.y,top(b));
});
test('elevator carries rider up and down, including across controller updates',()=>{
 const {b,level}=moving({dy:.8});const {rat,c}=makeRig(makeWorld(level.boxes));
 for(let i=1;i<=240;i++){advancePlatforms(level,i/60,rat,c.state!=='air');c.update(1/60);near(rat.position.y,top(b));}
 near(rat.position.y,0);assert.equal(c.state,'idle');
});
test('rotating platform carries position and yaw with its actual footprint',()=>{
 const {b,level,rat}=moving({spin:Math.PI/2});advancePlatforms(level,1,rat,true);
 near(rat.position.x,.1);near(rat.position.z,-.2);near(rat.rotation.y,Math.PI/2);
 b.w=.2;b.d=1;
 near(groundHeight([b],.4,0,0),0);
 assert.equal(groundHeight([b],0,.4,0),-Infinity,'rotated corner is not an axis-aligned fake floor');
});
test('airborne rat and rat on another dock do not follow platform motion',()=>{
 const {level,rat}=moving({dx:2});const initial={...rat.position};advancePlatforms(level,1,rat,false);
 assert.deepEqual(rat.position,initial);
 rat.position.x=4;advancePlatforms(level,2,rat,true);near(rat.position.x,4);
});
test('jumping from a moving platform detaches the rat',()=>{
 const {level}=moving({dx:2});const {rat,c}=makeRig(makeWorld(level.boxes));
 c.press('Space');c.clipFinished('Jump_Start');assert.equal(c.state,'air');
 advancePlatforms(level,1,rat,c.state!=='air');near(rat.position.x,0);
});
test('platform reset restores deterministic boarding positions',()=>{
 const l=levels[9];resetPlatforms(l);
 const origins=l.boxes.filter(b=>b.motion).map(b=>({x:b.x,y:b.y,z:b.z,yaw:b.yaw}));
 const rat={position:{x:100,y:0,z:100},rotation:{y:0}};advancePlatforms(l,3,rat,false);resetPlatforms(l);
 assert.deepEqual(l.boxes.filter(b=>b.motion).map(b=>({x:b.x,y:b.y,z:b.z,yaw:b.yaw})),origins);
 assert.equal(l.boxes.filter(b=>b.motion).length,5);
});
test('elevator reaches upper landing with boarding space at both ends',()=>{
 const l=levels[9],lift=l.boxes.find(b=>b.motion?.dy);const upper=platformPose(lift,lift.motion.period/2);
 near(upper.y+lift.h,.8);
 assert.ok(l.boxes.some(b=>!b.motion&&Math.abs(top(b)-.8)<1e-8&&Math.hypot(b.x-upper.x,b.z-upper.z)<1));
});

test('rat can leap from elevator at its upper stop onto the fixed dock',()=>{
 const l=levels[9];resetPlatforms(l);const lift=l.boxes.find(b=>b.motion?.dy);
 const rig=makeRig(makeWorld(l.boxes));let t=lift.motion.period/2;
 advancePlatforms(l,t,rig.rat,false);
 Object.assign(rig.rat.position,{x:lift.x,y:top(lift),z:lift.z});
 rig.c.press('KeyW');rig.c.press('Space');
 for(let i=0;i<120&&rig.c.state!=='land';i++) {
  t+=1/120;advancePlatforms(l,t,rig.rat,rig.c.state!=='air');rig.c.update(1/120);
 }
 assert.equal(rig.c.state,'land');near(rig.rat.position.y,.8);
 assert.ok(rig.rat.position.z>=2.475,'landed on fixed upper dock');resetPlatforms(l);
});

test('falling rat lands on a translating platform and then rides it',()=>{
 const {level,b}=moving({dx:.3});const {rat,c}=makeRig(makeWorld(level.boxes));
 rat.position.y=.5;let t=0;
 for(let i=0;i<180&&c.state!=='land';i++) {t+=1/120;advancePlatforms(level,t,rat,c.state!=='air');c.update(1/120);}
 assert.equal(c.state,'land');near(rat.position.y,top(b));
 const offset=rat.position.x-b.x;
 for(let i=0;i<60;i++){t+=1/120;advancePlatforms(level,t,rat,true);c.update(1/120);}
 near(rat.position.x-b.x,offset);
});

// Separating-axis test of oriented platform volumes, independent of gameplay collision.
function intersects(a,b) {
 if(Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<=1e-9)return false;
 const axes=p=>[[Math.cos(p.yaw ?? 0),-Math.sin(p.yaw ?? 0)],[Math.sin(p.yaw ?? 0),Math.cos(p.yaw ?? 0)]];
 const aa=axes(a),bb=axes(b);
 const radius=(p,axes,axis)=>Math.abs(axes[0][0]*axis[0]+axes[0][1]*axis[1])*p.w/2+Math.abs(axes[1][0]*axis[0]+axes[1][1]*axis[1])*p.d/2;
 return [...aa,...bb].every(axis=>Math.abs((a.x-b.x)*axis[0]+(a.z-b.z)*axis[1])<radius(a,aa,axis)+radius(b,bb,axis)-1e-9);
}

test('clockwork moving pieces clear every dock and platform throughout their full cycles',()=>{
 const l=levels[9];
 // Each mover against all static geometry, and each pair over both independent phases.
 const movers=l.boxes.filter(b=>b.motion),fixed=l.boxes.filter(b=>!b.motion);
 const poses=b=>Array.from({length:361},(_,i)=>({...b,...platformPose(b,b.motion.period*i/360)}));
 for(const b of movers)for(const pose of poses(b))for(const dock of fixed)
  assert.ok(!intersects(pose,dock),`moving platform at ${pose.x},${pose.z} intersects dock at ${dock.x},${dock.z}`);
 for(let i=0;i<movers.length;i++)for(let j=i+1;j<movers.length;j++) {
  const first=poses(movers[i]),second=poses(movers[j]);
  for(const a of first)for(const b of second)assert.ok(!intersects(a,b),`movers ${i} and ${j} overlap`);
 }
});
