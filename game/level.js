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

// Additional courses use the same solid surfaces as the controller's collision world.
function course(id, name, description, material, color, route, extras = []) {
  const surfaces = route.map(([x, z, w, d, y = 0, h = 0.12]) => box(x, z, w, d, y, h));
  const first = surfaces[0], last = surfaces.at(-1);
  return { id, name, description, material, color, boxes: [...surfaces, ...extras],
    route: surfaces, start: { x: first.x, z: first.z, top: first.y + first.h, yaw: 0 },
    goal: { x: last.x, z: last.z, w: 0.2, d: 0.2, top: last.y + last.h },
    killY: Math.min(...surfaces.map(b => b.y + b.h)) - 0.3 };
}

Object.assign(level, { id: 'training', name: 'The first scramble',
  description: 'Find your feet. Narrow beams, little climbs, one big leap.',
  material: 'concrete', color: '#b8c8c0', route: boxes });

export const levels = [level,
  course('pipes', 'The pipe labyrinth', 'Follow the weathered ducts. Dead ends hide around the bends.', 'metal', '#65c5a5', [
    [0,0,.5,.5], [0,.85,.24,1.2], [.55,1.4,1.1,.24], [1.1,2,.24,1.2],
    [.55,2.6,1.1,.24], [0,3.2,.24,1.2], [.7,3.8,1.4,.24], [1.4,4.3,.24,1], [1.4,4.95,.55,.55],
  ], [box(-.5,1.4,1,.24,0,.12), box(1.65,2.6,1.1,.24,0,.12), box(-.5,3.8,1,.24,0,.12)]),
  course('rooftops', 'Above the alley', 'Brick rooftops and ventilation ducts. Hold Shift for the long gaps.', 'brick', '#e4a77d', [
    [0,0,.6,.7], [0,.85,.5,.5,.1,.25], [0,1.7,.65,.65,.2,.35],
    [.85,1.7,.5,.55,.3,.45], [1.7,1.7,.65,.65,.3,.45], [1.7,2.6,.25,1.15,.3],
    [1.7,3.7,.65,.6,.15], [.8,3.7,.6,.6,.15], [0,3.7,.65,.65,.15],
  ]),
  course('pantry', 'Midnight pantry', 'Climb wooden crates and cross the shelves to find your supper.', 'wood', '#e4c48a', [
    [0,0,.6,.6], [0,.65,.5,.5,.12,.25], [0,1.25,.5,.5,.27,.4],
    [.55,1.25,.5,.5,.42,.55], [1.1,1.25,.5,.5,.57,.7], [1.1,2,.18,1,.57],
    [1.1,2.85,.65,.5,.57], [.25,2.85,.55,.5,.47], [-.6,2.85,.6,.6,.47],
    [-.6,3.6,.2,.9,.47], [-.6,4.35,.65,.6,.47],
  ]),
  course('drains', 'Across the spillway', 'A chain of grates above the water. Line up each jump before you leap.', 'grate', '#79bdcf', [
    [0,0,.6,.7], [0,.9,.45,.5], [.55,1.6,.45,.5], [0,2.3,.45,.5],
    [-.55,3,.45,.5], [0,3.7,.45,.5], [0,4.5,.13,1.1], [.65,5.1,1.3,.18], [1.5,5.1,.6,.6],
  ]),
  course('escape', 'The great escape', 'One last climb through the works. The green beacon is your way out.', 'metal', '#bea7e8', [
    [0,0,.6,.6], [0,.85,.1,1.1], [0,1.65,.45,.5,.1,.25], [.6,1.65,.5,.45,.25,.4],
    [1.2,1.65,.5,.45,.4,.55], [1.2,2.4,.15,1.05,.4], [1.2,3.25,.5,.5,.4],
    [.35,3.25,.5,.5,.3], [-.4,3.25,.5,.5,.2], [-.4,4,.1,1,.2],
    [-.4,4.85,.5,.7,.2], [-.4,6,.7,.6,.2],
  ]),
];

// Sloped walkways share their actual inclined top with rendering and collision.
const rooftop = levels[2];
const roofRamp = { ...box(0,.475,.38,.25,.05,.08), slopeZ: .4 };
rooftop.boxes.push(roofRamp);
rooftop.route.splice(1,0,roofRamp);
const pantry = levels[3];
const shelfRamp = pantry.route[5];
shelfRamp.z = 2.05; shelfRamp.d = 1.2; shelfRamp.y += .09; shelfRamp.slopeZ = .15;
for (const b of pantry.route.slice(6)) b.y += .18;
pantry.goal.top = pantry.route.at(-1).y + pantry.route.at(-1).h;
pantry.description = 'Climb crates and shelves under the moon and stars. Glue slows your paws; icy landings boost your slide.';
pantry.patches = [{ x:1.1,z:2.85,w:.42,d:.3,top:.75,effect:'glue' }];
levels[4].patches = [
  {x:0,z:2.3,w:.4,d:.38,top:0,effect:'slip'},
  {x:0,z:3.7,w:.4,d:.38,top:0,effect:'slip'},
];
levels[4].description = 'Frosted grates are slippery. Icy landings boost your slide: brake early and leave room to stop.';
levels[5].patches = [
  {x:1.2,z:3.25,w:.4,d:.35,top:.4,effect:'glue'},
  {x:-.4,z:4,w:.09,d:.55,top:.2,effect:'slip'},
];
levels[5].description = 'Amber glue grips; icy landings boost your slide. Choose your approach to the last leap.';
// A broad detour through a sticky maze, with a clear strip along either edge.
const pipes = levels[1];
pipes.patches = [{x:.55,z:1.4,w:.45,d:.12,top:0,effect:'glue'}];
pipes.description = 'Follow the ducts. Skirt the amber glue or push slowly through it.';

// Build elevated routes from short ramp sections. Each lap occupies the same X/Z
// footprint at a different height, with enough clearance to walk underneath.
function towerCourse(id, name, description, material, points, laps, rise, widths) {
  const route = [], branches = [], patches = [];
  let height = 0;
  const landing = (x,z,width,y) => {
    const pad = box(x,z,width,width,y,.06);
    route.push(pad); return pad;
  };
  landing(points[0][0],points[0][1],.7,0);
  for (let lap=0;lap<laps;lap++) {
    const width = widths[lap];
    for (let leg=0;leg<points.length-1;leg++) {
      const [ax,az] = points[leg], [bx,bz] = points[leg+1];
      const length = Math.hypot(bx-ax,bz-az), ux=(bx-ax)/length, uz=(bz-az)/length;
      const margin = route.at(-1).d/2;
      const endMargin = Math.max(.42,width+.15)/2;
      const run=length-margin-endMargin;
      const pieces = Math.max(2,Math.ceil(rise/.14));
      for(let part=0;part<pieces;part++) {
        const mid=(part+.5)/pieces;
        const gap = id === 'skymaze' && leg===2 ? .12 : 0;
        const segment=run/pieces-gap;
        const b=box(ax+ux*(margin+run*mid),az+uz*(margin+run*mid),
          ux ? segment : width, uz ? segment : width, height+rise*mid,.055);
        b.slopeX=ux*rise/run; b.slopeZ=uz*rise/run;
        route.push(b);
      }
      height+=rise;
      const pad=landing(bx,bz,Math.max(.42,width+.15),height);
      if (leg === 1 || leg === 4) patches.push({x:bx,z:bz,w:pad.w*.7,d:pad.d*.7,top:height,effect:lap%2 ? 'glue':'slip'});
      // Alternate side branches end over the void, below crossing routes above.
      if (id==='skymaze' && leg%2===0) {
        const dx=-uz, dz=ux;
        branches.push(box(bx+dx*.55,bz+dz*.55,dx ? .75 : .16,dz ? .75 : .16,height,.055));
        branches.push(box(bx+dx*.95,bz+dz*.95,.32,.32,height,.055));
      }
    }
  }
  const first=route[0], last=route.at(-1);
  // A catch floor and a sloping return to the starting pad make falls recoverable.
  const base=box(0,0,7.4,7.4,-.45,.12);
  const returnRamp={...box(first.x,first.z-.95,.36,1.2,-.225,.06),slopeZ:.375};
  return { id,name,description,material,color:id==='spiral'?'#c1a4ff':'#79dcf2',
    route,boxes:[...route,...branches,base,returnRamp,...(id==='spiral' ? [box(0,0,.65,.65,height+.15,height+.6)] : [])],patches,
    start:{x:first.x,z:first.z,top:0,yaw:0},
    goal:{x:last.x,z:last.z,w:.2,d:.2,top:height},killY:-.75,
    tower:{height,landings:route.filter(b=>!b.slopeX&&!b.slopeZ).map((b,i)=>({x:b.x,z:b.z,y:b.y+b.h,label:String(i+1).padStart(2,'0')})),
      recovery:{x:first.x,z:first.z-1.55},laps} };
}

levels.push(
  towerCourse('spiral','The corkscrew tower',
    'Three narrowing laps to the summit. Slip off and catch a lower tier; the bottom ramp leads back up.',
    'metal',[[-1.6,-1.6],[-1.6,1.6],[1.6,1.6],[1.6,-1.6],[-1.6,-1.6]],3,.6,[.5,.34,.18]),
  towerCourse('skymaze','The tangled skyworks',
    'Four storeys of crossing ramps, broken bridges and false branches. Blue slides, amber sticks. Find the summit.',
    'grate',[[-1.8,-1.8],[-1.8,0],[0,0],[0,1.8],[1.8,1.8],[1.8,-1.8],[-1.8,-1.8]],4,.24,[.28,.24,.2,.16]),
);

// A seeded spanning-tree maze on four decks. Junctions are physical platforms,
// not hints about the solution; all branches get the same lights and textures.
function tangledLabyrinth() {
  const boxes=[], route=[], patches=[], obstacles=[], junctions=[], decks=[];
  let seed=9019;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const key=(x,z)=>`${x},${z}`;
  const position=(x,z)=>({x:(x-2)*1.3,z:(z-2)*1.3});
  const padSize=.46;
  let entrance=key(0,0);
  const bridges=[];
  const addLink=(a,b,y,width,broken=false)=>{
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const run=length-padSize;
    const parts=broken ? 2 : 1, gap=broken ? .24 : 0;
    const span=(run-gap)/parts;
    const surfaces=[];
    for(let i=0;i<parts;i++) {
      const distance=padSize/2+span/2+i*(span+gap);
      const surface=box(a.x+ux*distance,a.z+uz*distance,ux?span:width,uz?span:width,y,.055);
      boxes.push(surface);surfaces.push(surface);
    }
    if(broken) bridges.push({a,b,y});
    return surfaces;
  };
  const connectors=[];
  let pending=[];
  for(let deck=0;deck<4;deck++) {
    const y=deck*1.2,nodes=new Map(),edges=new Map();
    for(let x=0;x<5;x++) for(let z=0;z<5;z++) {
      if(x===2&&z===2) continue; // This open shaft remains void on every deck.
      const id=key(x,z),p=position(x,z),pad=box(p.x,p.z,padSize,padSize,y,.065);
      nodes.set(id,{id,gx:x,gz:z,...p,pad,neighbors:[]});boxes.push(pad);
      junctions.push({x:p.x,z:p.z,y,label:['A','B','C','D'][deck]});
    }
    const stack=[entrance],seen=new Set(stack);
    while(stack.length) {
      const node=nodes.get(stack.at(-1));
      const options=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>nodes.get(key(node.gx+dx,node.gz+dz))).filter(n=>n&&!seen.has(n.id));
      if(!options.length) {stack.pop();continue;}
      const next=options[Math.floor(random()*options.length)];
      node.neighbors.push(next.id);next.neighbors.push(node.id);seen.add(next.id);stack.push(next.id);
      const broken=edges.size%8===5;
      const surfaces=addLink(node,next,y,.18+random()*.1,broken);
      const edge={a:node.id,b:next.id,surfaces,broken};edges.set([node.id,next.id].sort().join('|'),edge);
      // Low crate hurdles on intact bridges, leaving a clear jumping approach.
      if(!broken && edges.size%7===3) {
        const alongX=node.x!==next.x;
        const hurdle={...box((node.x+next.x)/2,(node.z+next.z)/2,alongX?.09:.34,alongX?.34:.09,y+.1,.1),material:'wood',obstacle:true};
        obstacles.push(hurdle);boxes.push(hurdle);
      }
    }
    // Pick a distant boundary exit, then retain the actual solution for validation.
    const queue=[entrance],parent=new Map([[entrance,null]]),distance=new Map([[entrance,0]]);
    for(let i=0;i<queue.length;i++) for(const id of nodes.get(queue[i]).neighbors) if(!parent.has(id)) {
      parent.set(id,queue[i]);distance.set(id,distance.get(queue[i])+1);queue.push(id);
    }
    const boundary=[...nodes.values()].filter(n=>n.gx===0||n.gx===4||n.gz===0||n.gz===4);
    const exit=boundary.reduce((best,n)=>distance.get(n.id)>distance.get(best.id)?n:best,boundary[0]);
    const path=[];for(let id=exit.id;id!==null;id=parent.get(id))path.unshift(id);
    route.push(...pending,nodes.get(entrance).pad);
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],edge=edges.get([a,b].sort().join('|'));
      route.push(...(edge.a===a?edge.surfaces:[...edge.surfaces].reverse()),nodes.get(b).pad);
    }
    for(const [i,node] of [...nodes.values()].entries()) if(node.id!==entrance&&node.id!==exit.id&&i%5===2) {
      patches.push({x:node.x,z:node.z,w:.3,d:.3,top:y,effect:(i+deck)%2?'slip':'glue'});
    }
    decks.push({y,entrance,exit:exit.id,nodes:[...nodes.values()].map(n=>({id:n.id,x:n.x,z:n.z,neighbors:n.neighbors})),path});
    if(deck===3) break;
    // Switchback stairwell outside the maze boundary. It reconnects at a different
    // junction one deck above, so solving a deck is not just repeating a spiral.
    const alongX=exit.gx!==0&&exit.gx!==4;
    const next=alongX?nodes.get(key(exit.gx<=2?4:0,exit.gz)):nodes.get(key(exit.gx,exit.gz<=2?4:0));
    const outward=alongX?(exit.gz===0?-.9:.9):(exit.gx===0?-.9:.9);
    const points=alongX?[
      exit,{x:exit.x,z:exit.z+outward},{x:next.x,z:next.z+outward},next,
    ]:[exit,{x:exit.x+outward,z:exit.z},{x:next.x+outward,z:next.z},next];
    const total=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
    pending=[];let h=y;
    for(let leg=1;leg<points.length;leg++) {
      const a=points[leg-1],b=points[leg],len=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/len,uz=(b.z-a.z)/len;
      const rise=1.2*len/total,run=len-padSize,parts=Math.ceil(rise/.16);
      for(let i=0;i<parts;i++) {
        const mid=(i+.5)/parts;
        const ramp={...box(a.x+ux*(padSize/2+run*mid),a.z+uz*(padSize/2+run*mid),ux?run/parts:.23,uz?run/parts:.23,h+rise*mid,.055),slopeX:ux*rise/run,slopeZ:uz*rise/run};
        boxes.push(ramp);pending.push(ramp);connectors.push(ramp);
      }
      h+=rise;
      if(leg<points.length-1) {const pad=box(b.x,b.z,padSize,padSize,h,.065);boxes.push(pad);pending.push(pad);junctions.push({x:b.x,z:b.z,y:h,label:'+'});}
    }
    entrance=next.id;
  }
  const first=route[0],last=route.at(-1);
  return {id:'labyrinth',name:'The abyssal labyrinth',
    description:'Four tangled decks, false turns and crate hurdles. Find the green beacon. Open shafts fall into the void: no safety floor.',
    material:'metal',color:'#dfa4ff',boxes,route,patches,
    start:{x:first.x,z:first.z,top:0,yaw:0},goal:{x:last.x,z:last.z,w:.2,d:.2,top:last.y+last.h},killY:-.9,
    tower:{height:3.6,landings:junctions},maze:{decks,bridges,obstacles,connectors,void:{x:0,z:0},deadEnds:decks.flatMap(d=>d.nodes.filter(n=>n.neighbors.length===1).map(n=>({...n,y:d.y})))}};
}
levels.push(tangledLabyrinth());


// Timed crossings: a shuttle, an elevator, a turntable, then two opposing ferries.
const clockwork=course('clockwork','The clockwork crossing',
  'Ride cyan platforms; wait at amber docks. The striped turntable carries you around. Jump between rides; a missed transfer falls into the void.',
  'metal','#ffd28b',[
    [0,0,.65,.7], [0,.65,.5,.5], [0,2.05,.65,.65],
    [.75,2.05,.5,.5], [.75,2.8,.65,.65,.8],
    [.75,3.8,.3,1.2,.8], [1.75,3.8,.65,.65,.8],
    [2.45,3.8,.5,.5,.8], [3.75,3.8,.65,.65,.8],
    [3.75,4.5,.5,.5,.8], [3.75,5.8,.65,.65,.8],
    [2.95,5.8,.65,.65,.8],
  ]);
const moving=(index,settings)=>{
  const b=clockwork.route[index];b.motion={period:8,...settings,origin:{x:b.x,y:b.y,z:b.z,yaw:0}};
};
moving(1,{dz:.75,period:7});
moving(3,{dy:.8,period:9});
moving(5,{spin:Math.PI/8,period:16});
moving(7,{dx:.65,period:6});
moving(9,{dz:.65,period:7.5});
// Docks clear the turntable's full swept radius; shuttles stop 7.5 cm short of docks.
clockwork.killY=-.65;
levels.push(clockwork);

// Extra ice on roomy, flat landing pads. Leave starts, goals, ramps and moving
// platforms clear, with a dry margin for players who want to avoid the slide.
for (const [index, pads] of [[1,[3,5]], [2,[2,4,7]], [3,[2,7,8]], [4,[1,4]], [5,[3,8]], [9,[2,6,8]]]) {
  const course=levels[index];
  course.patches ??= [];
  for(const padIndex of pads) {
    const b=course.route[padIndex];
    if(!b || b.motion || b.slopeX || b.slopeZ) continue;
    course.patches.push({x:b.x,z:b.z,w:b.w*.8,d:b.d*.72,top:b.y+b.h,effect:'slip'});
  }
}
