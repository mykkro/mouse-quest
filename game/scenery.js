import * as THREE from 'three';

// A camera-centred sky sphere gives the courses an endless void, with no false floor.
export function createVoid(scene) {
  const uniforms = { time: { value: 0 }, theme: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec3 direction;
      uniform float time;
      uniform float theme;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
          mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
          mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 d = normalize(direction);
        vec3 p = d * 4.0 + vec3(time*.012, time*.018, 0.0);
        float mist = noise(p)*.6 + noise(p*2.1)*.28 + noise(p*4.3)*.12;
        vec3 color;
        if (theme < .5) {
          color = mix(vec3(.32,.49,.60),vec3(.045,.13,.28),smoothstep(-.25,.85,d.y));
          float clouds = smoothstep(.47,.73,mist) * (1.0-smoothstep(.2,.8,d.y));
          color = mix(color,vec3(.69,.76,.79),clouds*.65);
          color = mix(color,vec3(.045,.085,.14),smoothstep(.0,1.0,-d.y));
        } else if (theme < 1.5) {
          float glow = pow(max(0.0,mist),4.0) * (1.0-smoothstep(-.2,.8,d.y));
          color = vec3(.006,.014,.019) + vec3(.045,.48,.19)*glow*2.5;
          color += vec3(.012,.075,.055)*exp(-abs(d.y+.25)*3.0);
        } else if (theme > 2.5) {
          color = mix(vec3(.008,.014,.038),vec3(.028,.052,.105),exp(-abs(d.y)*3.0));
          vec2 starCell = vec2(atan(d.x,d.z)/6.2831853+.5,asin(d.y)/3.1415927+.5)*vec2(360.0,180.0);
          float star = 1.0-smoothstep(.025,.15,length(fract(starCell)-.5));
          star *= step(.975,hash(vec3(floor(starCell),7.0))) * smoothstep(-.8,-.25,d.y);
          color += vec3(.7,.82,1.0)*star*3.0;
          float moonDistance = length(d-normalize(vec3(-.48,-.32,.84)));
          float disc = 1.0-smoothstep(.057,.060,moonDistance);
          float crater = noise(d*180.0)*.6+noise(d*390.0)*.4;
          color += vec3(.12,.17,.29)*exp(-moonDistance*15.0);
          color = mix(color,vec3(.8,.84,.76)*(.65+crater*.35),disc);
          color += vec3(.014,.023,.045)*smoothstep(.5,.75,mist);
        } else {
          float below = 1.0-smoothstep(-.95,.2,d.y);
          float fire = smoothstep(.30,.78,mist) * below;
          color = mix(vec3(.018,.009,.024),vec3(.19,.025,.008),below);
          color += mix(vec3(.42,.035,.002),vec3(1.0,.33,.025),fire)*fire;
        }
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);
  return {
    setLevel(level) {
      const theme = level.id==='pantry' ? 3 : ['pipes', 'drains', 'labyrinth'].includes(level.id) ? 1
        : ['escape', 'clockwork'].includes(level.id) ? 2 : 0;
      uniforms.theme.value = theme;
      scene.fog = new THREE.FogExp2(theme === 0 ? 0x526b80 : theme === 1 ? 0x071b16 : theme===3 ? 0x080f25 : 0x240e0b, .035);
    },
    update(camera, dt) { sky.position.copy(camera.position); uniforms.time.value += dt; },
  };
}

// Tileable, deterministic canvas textures; no external image downloads.
export function createMaterials(renderer) {
  const result = {};
  for (const kind of ['concrete', 'brick', 'wood', 'metal', 'grate']) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const colors = { concrete: '#8a8b80', brick: '#995e48', wood: '#997044', metal: '#65736f', grate: '#58646a' };
    ctx.fillStyle = colors[kind]; ctx.fillRect(0, 0, 256, 256);
    let seed = 42;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = random() > .5 ? '#ffffff12' : '#00000018';
      ctx.fillRect(random()*256, random()*256, 1 + random()*3, 1 + random()*3);
    }
    ctx.lineWidth = 3;
    if (kind === 'brick') {
      ctx.strokeStyle = '#d1ba96';
      for (let y = 0; y < 256; y += 64) {
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke();
        for (let x = (y/64 % 2)*64; x < 256; x += 128) { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+64); ctx.stroke(); }
      }
    } else if (kind === 'wood') {
      for (let y = 0; y < 256; y += 4) {
        ctx.strokeStyle = y % 64 === 0 ? '#48341d' : '#65432344';
        ctx.beginPath(); ctx.moveTo(0,y); ctx.bezierCurveTo(80,y-3,170,y+3,256,y); ctx.stroke();
      }
    } else if (kind === 'grate') {
      ctx.fillStyle = '#10272e';
      for (let x=4;x<256;x+=16) for(let y=4;y<256;y+=32) ctx.fillRect(x,y,8,23);
    } else if (kind === 'metal') {
      ctx.strokeStyle = '#183f39'; ctx.strokeRect(2,2,252,252);
      ctx.fillStyle = '#b5d1bf';
      for (const x of [12,244]) for (const y of [12,244]) { ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); }
      ctx.strokeStyle = '#b2cdbe33';
      for(let y=32;y<240;y+=32) { ctx.beginPath(); ctx.moveTo(25,y); ctx.lineTo(231,y); ctx.stroke(); }
    } else {
      // Pores and aggregate, rather than a repeating outline around every tile.
      for (let i=0;i<750;i++) {
        ctx.fillStyle = random() > .3 ? '#292c2638' : '#dedbca55';
        ctx.beginPath(); ctx.arc(random()*256,random()*256,.3+random()*1.4,0,Math.PI*2); ctx.fill();
      }
    }
    // Fine directional grain and scratches break up the formerly flat surfaces.
    if (kind === 'wood' || kind === 'metal' || kind === 'grate') {
      for (let i=0;i<650;i++) {
        const x=random()*256, y=random()*256;
        ctx.strokeStyle=random()>.5 ? '#fff3d51c' : '#171a1828';
        ctx.lineWidth=.3+random()*.7;
        ctx.beginPath();ctx.moveTo(x,y);
        const length=kind==='wood' ? 20+random()*90 : 2+random()*22;
        ctx.lineTo(x+length,y+(kind==='wood' ? Math.sin(y)*1.8 : random()*2));ctx.stroke();
      }
    }
    // Wrap stains across tile boundaries so repeated surfaces have no hard seams.
    for (let i=0;i<18;i++) {
      const x=random()*256,y=random()*256,r=8+random()*25;
      for (const dx of [-256,0,256]) for (const dy of [-256,0,256]) {
        const stain=ctx.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
        stain.addColorStop(0,kind==='metal' || kind==='grate' ? '#73351a30' : '#30282020');
        stain.addColorStop(1,'#30282000');ctx.fillStyle=stain;
        ctx.fillRect(x+dx-r,y+dy-r,r*2,r*2);
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const reliefCanvas=document.createElement('canvas');
    reliefCanvas.width=reliefCanvas.height=256;
    const relief=reliefCanvas.getContext('2d');
    const pixels=ctx.getImageData(0,0,256,256);
    for(let i=0;i<pixels.data.length;i+=4) {
      const gray=Math.round(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722);
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;
    }
    relief.putImageData(pixels,0,0);
    const bumpMap=new THREE.CanvasTexture(reliefCanvas);
    bumpMap.wrapS=bumpMap.wrapT=THREE.RepeatWrapping;
    bumpMap.anisotropy=map.anisotropy;
    // Weathered metal varies its highlights; porous materials stay matte.
    result[kind] = new THREE.MeshStandardMaterial({ map, bumpMap,
      bumpScale: kind==='brick' ? .003 : kind==='grate' ? .002 : .0008,
      roughnessMap:kind==='metal' || kind==='grate' ? bumpMap : null,
      roughness: kind === 'metal' || kind==='grate' ? .95 : .9,
      metalness: kind === 'metal' || kind === 'grate' ? .65 : 0 });
  }
  return result;
}

function createPatchMaterial(glue) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  let seed=glue ? 197 : 431;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  // Soft, uneven edges make these read as deposited material rather than painted tiles.
  ctx.beginPath();ctx.moveTo(24,10);
  ctx.bezierCurveTo(85,0,170,12,229,7);ctx.quadraticCurveTo(252,12,247,44);
  ctx.bezierCurveTo(253,105,242,174,250,226);ctx.quadraticCurveTo(249,249,220,246);
  ctx.bezierCurveTo(150,254,80,242,28,249);ctx.quadraticCurveTo(4,248,8,218);
  ctx.bezierCurveTo(0,150,13,79,6,33);ctx.quadraticCurveTo(5,10,24,10);ctx.closePath();
  ctx.save();ctx.clip();
  const base=ctx.createLinearGradient(0,0,256,256);
  base.addColorStop(0,glue ? '#ffdc77' : '#d4f6ff');
  base.addColorStop(.5,glue ? '#bd6a13' : '#539ac0');
  base.addColorStop(1,glue ? '#eeb342' : '#b1e6f2');
  ctx.fillStyle=base;ctx.fillRect(0,0,256,256);
  for(let i=0;i<1700;i++) {
    ctx.fillStyle=glue ? '#ffedaf16' : '#efffff30';
    ctx.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);
  }
  if(glue) {
    // Trapped bubbles, thick flow lines, and curved wet highlights.
    for(let i=0;i<65;i++) {
      const x=random()*256,y=random()*256,r=1+random()*5;
      ctx.fillStyle='#6b320d30';ctx.strokeStyle='#fff0b880';ctx.lineWidth=.8;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    for(let i=0;i<9;i++) {
      const y=20+i*27;
      ctx.strokeStyle=i%2 ? '#8d450e30' : '#fff2bf70';ctx.lineWidth=1+random()*2;
      ctx.beginPath();ctx.moveTo(12,y);ctx.bezierCurveTo(80,y-20,155,y+30,245,y-8);ctx.stroke();
    }
  } else {
    // Fine fractures with branching hairlines and milky frost along the rim.
    for(let i=0;i<12;i++) {
      let x=random()*256,y=random()*256;
      ctx.strokeStyle='#ecffffa0';ctx.lineWidth=.5+random();ctx.beginPath();ctx.moveTo(x,y);
      for(let j=0;j<5;j++) {
        x+=(random()-.5)*65;y+=12+random()*20;ctx.lineTo(x,y);
        if(j===2) {ctx.lineTo(x+20,y-12);ctx.moveTo(x,y);}
      }
      ctx.stroke();
    }
    const frost=ctx.createRadialGradient(128,128,65,128,128,160);
    frost.addColorStop(0,'#ffffff00');frost.addColorStop(1,'#edffffcf');
    ctx.fillStyle=frost;ctx.fillRect(0,0,256,256);
  }
  ctx.restore();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const bumpMap=new THREE.CanvasTexture(canvas);
  return new THREE.MeshPhysicalMaterial({map,bumpMap,bumpScale:glue ? .00005 : .00003,
    color:0xffffff,roughness:glue ? .18 : .12,metalness:0,
    clearcoat:1,clearcoatRoughness:glue ? .12 : .07,
    transparent:true,opacity:glue ? .94 : .88,alphaTest:.05,depthWrite:false,
    side:THREE.DoubleSide});
}

export function buildCourse(scene, level, materials) {
  const group = new THREE.Group();
  const movingMeshes=[];
  const add = (geometry, material, x,y,z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  for (const b of level.boxes) {
    const kind=b.material ?? level.material;
    // Small bevels catch the light without visibly shrinking narrow walkways.
    // Ramps and grates retain their precise, flat profiles.
    const radius = b.slopeX || b.slopeZ || kind==='grate' ? 0
      : Math.min(kind==='metal' ? .003 : .006, Math.min(b.w,b.h,b.d)*.06);
    const geo = new THREE.BoxGeometry(b.w,b.h,b.d,radius ? 6 : 1,radius ? 6 : 1,radius ? 6 : 1);
    if(radius) {
      const positions=geo.attributes.position, normals=geo.attributes.normal;
      const inner=new THREE.Vector3(b.w/2-radius,b.h/2-radius,b.d/2-radius);
      const lower=inner.clone().negate();
      const point=new THREE.Vector3(), core=new THREE.Vector3(), normal=new THREE.Vector3();
      for(let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i);
        core.copy(point).clamp(lower,inner);
        normal.subVectors(point,core).normalize();
        point.copy(core).addScaledVector(normal,radius);
        positions.setXYZ(i,point.x,point.y,point.z);
        normals.setXYZ(i,normal.x,normal.y,normal.z);
      }
    }
    if (b.slopeX || b.slopeZ) {
      const positions = geo.attributes.position;
      for (let i=0;i<positions.count;i++) positions.setY(i, positions.getY(i)+(b.slopeX ?? 0)*positions.getX(i)+(b.slopeZ ?? 0)*positions.getZ(i));
      geo.computeVertexNormals();
    }
    // Scale UVs in metres so long beams retain their texture detail.
    const uv = geo.attributes.uv;
    const verticesPerFace=uv.count/6;
    for (let i=0;i<uv.count;i++) {
      const face = Math.floor(i/verticesPerFace);
      const [w,h] = face < 2 ? [b.d,b.h] : face < 4 ? [b.w,b.d] : [b.w,b.h];
      uv.setXY(i,uv.getX(i)*w/.25,uv.getY(i)*h/.25);
    }
    const mesh=add(geo,materials[b.material ?? level.material],b.x,b.y+b.h/2,b.z);
    mesh.rotation.y=b.yaw ?? 0;
    if(level.id==='clockwork' && !b.motion) {
      const dockMat=new THREE.MeshStandardMaterial({color:'#ffc66e',emissive:'#9d5710',emissiveIntensity:.35});
      for(const sign of [-1,1]) {
        const edge=new THREE.Mesh(new THREE.BoxGeometry(b.w*.85,.004,.018),dockMat);
        edge.position.set(0,b.h/2+.003,sign*(b.d/2-.04));mesh.add(edge);
      }
    }
    if(b.motion) {
      movingMeshes.push({mesh,b});
      const stripeMat=new THREE.MeshStandardMaterial({color:'#77e8ff',emissive:'#15738c',emissiveIntensity:.6});
      for(const sign of [-1,1]) {
        const stripe=new THREE.Mesh(new THREE.BoxGeometry(b.w*.85,.004,.025),stripeMat);
        stripe.position.set(0,b.h/2+.003,sign*(b.d/2-.04));mesh.add(stripe);
      }
    }
    if (level.id === 'pipes') {
      // Rounded pipe underside with a flat, collidable inspection walkway on top.
      const alongZ = b.d > b.w;
      const radius = Math.min(b.w,b.d)*.65;
      const pipe = add(new THREE.CylinderGeometry(radius,radius,Math.max(b.w,b.d),20), materials.metal,
        b.x,b.y-radius*1.15,b.z);
      pipe.rotation[alongZ ? 'x' : 'z'] = Math.PI/2;
      for (const sign of [-1,1]) {
        const collar = add(new THREE.CylinderGeometry(radius*1.14,radius*1.14,.035,20), materials.metal,
          b.x+(alongZ?0:sign*(b.w/2-.04)), b.y-radius*1.15,b.z+(alongZ?sign*(b.d/2-.04):0));
        collar.rotation.copy(pipe.rotation);
      }
    }
  }
  if (level.tower) {
    // Numbered landing lights distinguish overlapping floors when viewed from below.
    for (const [i,pad] of level.tower.landings.entries()) {
      const color = new THREE.Color().setHSL((i*.075)%1,.55,.65);
      const mat = new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35});
      add(new THREE.BoxGeometry(.22,.004,.025),mat,pad.x,pad.y+.003,pad.z-.14);
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#142a2b';ctx.fillRect(0,0,128,64);
      ctx.fillStyle='#ecffe8';ctx.font='bold 42px system-ui';ctx.textAlign='center';ctx.fillText(pad.label,64,48);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const labelMat=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide});
      const label=add(new THREE.PlaneGeometry(.14,.07),labelMat,pad.x,pad.y+.004,pad.z);
      label.rotation.x=-Math.PI/2;
    }
  }
  const patchMaterials={};
  for (const patch of level.patches ?? []) {
    const glue = patch.effect === 'glue';
    const mat=patchMaterials[patch.effect] ??= createPatchMaterial(glue);
    const film=add(new THREE.PlaneGeometry(patch.w,patch.d),mat,patch.x,patch.top+.002,patch.z);
    film.rotation.x=-Math.PI/2;
    film.castShadow=false; // Thin films receive the rat's shadow without casting surface acne.
  }
  if (level.id === 'drains') {
    const water = new THREE.MeshStandardMaterial({ color: '#246c74', roughness: .25, metalness: .3, transparent: true, opacity: .75 });
    add(new THREE.BoxGeometry(14,.02,16),water,0,-.65,3);
  }
  const g = level.goal;
  const glow = new THREE.MeshStandardMaterial({ color: '#7affad', emissive: '#32d878', emissiveIntensity: 1 });
  add(new THREE.BoxGeometry(g.w,.006,g.d),glow,g.x,g.top+.003,g.z);
  const ring = add(new THREE.TorusGeometry(.13,.008,8,40),glow,g.x,g.top+.22,g.z);
  const start = level.start;
  add(new THREE.BoxGeometry(.18,.003,.045), new THREE.MeshStandardMaterial({color:level.color}),start.x,start.top+.002,start.z+.08);
  scene.add(group);
  return { group, ring, sync() {
    for(const {mesh,b} of movingMeshes) {mesh.position.set(b.x,b.y+b.h/2,b.z);mesh.rotation.y=b.yaw ?? 0;}
  }, dispose() {
    scene.remove(group);
    group.traverse(o=>{if(o.isMesh) o.geometry.dispose();});
    const owned = new Set();
    group.traverse(o => { if (o.isMesh && !Object.values(materials).includes(o.material)) owned.add(o.material); });
    owned.forEach(material => {
      new Set([material.map,material.bumpMap,material.roughnessMap].filter(Boolean)).forEach(map=>map.dispose());
      material.dispose();
    });
  } };
}
