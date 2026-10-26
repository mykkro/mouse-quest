import * as THREE from 'three';

// Tileable, deterministic canvas textures; no external image downloads.
export function createMaterials(renderer) {
  const result = {};
  for (const kind of ['concrete', 'brick', 'wood', 'metal', 'grate']) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const colors = { concrete: '#83918b', brick: '#a2644c', wood: '#ad8350', metal: '#48786d', grate: '#4c6974' };
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
      ctx.strokeStyle = '#34473b55'; ctx.strokeRect(1,1,254,254);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    result[kind] = new THREE.MeshStandardMaterial({ map, roughness: kind === 'metal' ? .48 : .88, metalness: kind === 'metal' || kind === 'grate' ? .45 : 0 });
  }
  return result;
}

export function buildCourse(scene, level, materials) {
  const group = new THREE.Group();
  const movingMeshes=[];
  const add = (geometry, material, x,y,z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  for (const b of level.boxes) {
    const geo = new THREE.BoxGeometry(b.w,b.h,b.d);
    if (b.slopeX || b.slopeZ) {
      const positions = geo.attributes.position;
      for (let i=0;i<positions.count;i++) positions.setY(i, positions.getY(i)+(b.slopeX ?? 0)*positions.getX(i)+(b.slopeZ ?? 0)*positions.getZ(i));
      geo.computeVertexNormals();
    }
    // Scale UVs in metres so long beams retain their texture detail.
    const uv = geo.attributes.uv;
    for (let i=0;i<uv.count;i++) {
      const face = Math.floor(i/4);
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
  for (const patch of level.patches ?? []) {
    const glue = patch.effect === 'glue';
    const mat = new THREE.MeshStandardMaterial({ color: glue ? '#f5b52f' : '#69d9ff',
      emissive: glue ? '#9b4d05' : '#146987', emissiveIntensity:.3, roughness:.12,
      metalness:.15, transparent:true, opacity:.8 });
    add(new THREE.BoxGeometry(patch.w,.003,patch.d),mat,patch.x,patch.top+.002,patch.z);
    // Repeated contrasting bars make patches readable even without color perception.
    const stripe = new THREE.MeshStandardMaterial({ color:glue ? '#5d3709' : '#e0faff' });
    for(let z=-patch.d/2+.025;z<patch.d/2;z+=.07)
      add(new THREE.BoxGeometry(patch.w*.8,.001,.009),stripe,patch.x,patch.top+.004,patch.z+z);
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
    owned.forEach(material => { if (material.map) material.map.dispose(); material.dispose(); });
  } };
}
