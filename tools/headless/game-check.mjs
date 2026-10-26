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
  await page.ev("{ const select=document.getElementById('language');select.value='en';select.dispatchEvent(new Event('change')); }");
  await sleep(1500); // first frames stall on shader compiles; the 0.1 s dt cap would swallow that time
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

  // Every selectable course must spawn safely, detect its goal, and advance to the next world.
  const levelCount = await page.ev('ratGame.levelCount');
  for (let i = 0; i < levelCount; i++) {
    await page.ev(`ratGame.loadLevel(${i})`);
    await sleep(80);
    check((await snap()).s === 'ready', `level ${i+1}: ready on selection`);
    await tap('KeyW');
    await page.ev(`{ const g = ratGame.level.goal; ratGame.teleport(g.x, g.top, g.z, 0); }`);
    await page.waitFor("ratGame.state === 'won'", 3000);
    check((await snap()).s === 'won', `level ${i+1}: beacon detected`);
    await tap('Space');
    check(await page.ev(`ratGame.levelIndex === ${(i+1)%levelCount} && ratGame.state === 'ready'`), `level ${i+1}: advances with Space`);
  }
  await page.ev('ratGame.loadLevel(9)');
  await page.ev(`{ const b=ratGame.level.boxes.find(b=>b.motion?.dz); ratGame.teleport(b.x,b.y+b.h,b.z,0); }`);
  await tap('KeyW');
  await page.waitFor('ratGame.motionTime > 1',5000);
  check(await page.ev(`(() => {const b=ratGame.level.boxes.find(b=>b.motion?.dz); const p=ratGame.rat.position; return Math.abs(p.z-b.z)<.08 && Math.abs(p.y-b.y-b.h)<.001;})()`),'shuttle carries idle rat in the browser');
  await page.ev('ratGame.loadLevel(9)');
  await page.ev(`{const b=ratGame.level.boxes.find(b=>b.motion?.dy);ratGame.teleport(b.x,b.y+b.h,b.z,0);}`);
  await tap('KeyW');
  await page.waitFor('ratGame.motionTime > 1',5000);
  check(await page.ev(`(() => {const b=ratGame.level.boxes.find(b=>b.motion?.dy);return ratGame.rat.position.y>.05 && Math.abs(ratGame.rat.position.y-b.y-b.h)<.001;})()`),'elevator raises standing rat without falling');
  await page.ev('ratGame.loadLevel(9)');
  await page.ev(`{const b=ratGame.level.boxes.find(b=>b.motion?.spin);ratGame.teleport(b.x,b.y+b.h,b.z+.25,0);}`);
  await tap('KeyW');await tap('KeyV');
  await page.waitFor('ratGame.motionTime > 1',5000);
  check(await page.ev(`(() => {const b=ratGame.level.boxes.find(b=>b.motion?.spin);return ratGame.rat.position.x>b.x+.05 && Math.abs(ratGame.rat.rotation.y-b.yaw)<.01 && ratGame.view==='first-person';})()`),'turntable rotates rider and first-person heading');
  await page.screenshot(join(ROOT,'models/rat/build/previews/clockwork-first-person.png'));
  await tap('KeyV');
  await page.ev("document.getElementById('retry').click()");
  check(await page.ev('ratGame.motionTime===0 && ratGame.level.boxes.filter(b=>b.motion).every(b=>Math.abs(b.y-b.motion.origin.y)<1e-9 && Math.abs(b.z-b.motion.origin.z)<1e-9 && b.yaw===0)'),'restart resets every platform');
  await page.ev('ratGame.camera.position.set(6,5,8)');
  await page.screenshot(join(ROOT,'models/rat/build/previews/clockwork.png'));
  await page.ev('ratGame.loadLevel(8)');
  await tp(0,3.6,0,0);await tap('KeyW');
  await page.waitFor("ratGame.state === 'fell'",5000);
  check((await snap()).s==='fell','labyrinth central shaft falls into the void');
  await tap('Space');
  check(await page.ev("ratGame.levelIndex === 8 && ratGame.state === 'ready'"),'void fall restarts the labyrinth at its entrance');
  await tp(-2.6,2,-2.6,0);await tap('KeyW');
  await page.waitFor('Math.abs(ratGame.rat.position.y - 1.2)<.001',5000);
  check((await snap()).s==='playing','labyrinth lower junction catches a recoverable fall');
  await page.ev('ratGame.loadLevel(8)');
  await page.ev('ratGame.camera.position.set(9,9,10)');
  await page.screenshot(join(ROOT,'models/rat/build/previews/labyrinth.png'));
  await page.ev('ratGame.loadLevel(6)');
  await tp(-1.46,5.1,0,0);
  await tap('KeyW');
  await page.waitFor('ratGame.ctrlState === "land" || (ratGame.rat.position.y < 3 && ratGame.rat.position.y > 2 && ratGame.ctrlState === "idle")', 5000);
  s=await snap();
  check(s.s==='playing' && s.y>2 && s.y<3, 'fall from upper spiral lands on lower lap without restarting');
  await page.ev('ratGame.loadLevel(7)');
  await tp(2.8,3,2.8,0);await tap('KeyW');
  await page.waitFor('Math.abs(ratGame.rat.position.y + .45) < .001',5000);
  check((await snap()).s==='playing','sky maze catch floor keeps the run alive');
  await page.ev('ratGame.loadLevel(6)');
  await page.ev(`ratGame.camera.position.set(9,9,10);`);
  await page.screenshot(join(ROOT, 'models/rat/build/previews/spiral.png'));
  await page.ev('ratGame.loadLevel(7)');
  await page.ev(`ratGame.camera.position.set(10,9,10);`);
  await page.screenshot(join(ROOT, 'models/rat/build/previews/skymaze.png'));
  await page.ev('ratGame.loadLevel(2)');
  await tp(0,0,.28,0);
  await key('KeyW',true);
  await page.waitFor('ratGame.rat.position.z > .65 || ratGame.state === \'fell\'', 8000);
  await key('KeyW',false);
  s=await snap();
  check(s.s === 'playing' && s.z > .65 && Math.abs(s.y-.1)<.001, `walks up rooftop ramp onto higher platform (${s.s}, z ${s.z}, y ${s.y})`);
  await page.ev('ratGame.loadLevel(3)');
  await tp(1.1,.6075,1.7,0);
  await tap('KeyW');
  await page.waitFor('ratGame.rat.rotation.x < -.05', 3000);
  check(await page.ev('ratGame.rat.rotation.x < -.05'), 'body tilts to match pantry incline');
  await page.ev('ratGame.loadLevel(3)');
  await tp(1.1,.75,2.85,0);
  await tap('KeyW');
  await page.waitFor("document.getElementById('surface-status').textContent.includes('Sticky')",3000);
  check(await page.ev("document.getElementById('surface-status').textContent.includes('Sticky')"), 'glue patch shows movement warning');
  await page.ev('ratGame.loadLevel(4)');
  await tp(0,0,2.3,0);
  await key('KeyW',true); await sleep(200); await key('KeyW',false); await sleep(80);
  check(await page.ev("document.getElementById('surface-status').textContent.includes('Slippery') && ratGame.speed > 0"), 'wet patch coasts after key release');
  await page.ev('ratGame.loadLevel(1)');
  await tap('KeyV');
  check(await page.ev("ratGame.view === 'first-person' && ratGame.state === 'ready'"), 'V switches view without starting the run');
  await tp(.2, .1, .3, Math.PI/2);
  await sleep(100);
  check(await page.ev(`(() => {
    const { rat, camera } = ratGame;
    const l = rat.getObjectByName('FACIAL_L_Eyeball');
    const r = rat.getObjectByName('FACIAL_R_Eyeball');
    const eye = l.getWorldPosition(camera.position.clone()).add(r.getWorldPosition(camera.position.clone())).multiplyScalar(.5);
    const direction = camera.getWorldDirection(camera.position.clone());
    return camera.position.distanceTo(eye) < .001 && direction.x > .99 && !camera.layers.isEnabled(1);
  })()`), 'first-person camera follows the animated eyes and rat heading');
  await page.ev('ratGame.loadLevel(1)');
  check(await page.ev("ratGame.view === 'first-person'"), 'view persists when switching levels');
  await page.screenshot(join(ROOT, 'models/rat/build/previews/first-person.png'));
  await page.ev("document.getElementById('view').click()");
  check(await page.ev("ratGame.view === 'chase' && ratGame.camera.layers.isEnabled(1)"), 'button restores chase view and visible rat');
  await page.screenshot(join(ROOT, 'models/rat/build/previews/game.png'));
  await page.ev("{const select=document.getElementById('language');select.value='cs';select.dispatchEvent(new Event('change'));}");
  check(await page.ev("document.documentElement.lang==='cs' && document.title===String.fromCodePoint(80,345,237,98,283,104,32,107,114,121,115,121)"),'Czech title and document language');
  check(await page.ev("document.getElementById('levels').options.length===10 && document.getElementById('levels').options[9].textContent.includes('Mechanick') && document.getElementById('retry').textContent==='Znovu'"),'Czech level selector and buttons');
  const priorState=await page.ev('ratGame.state');
  await tap('KeyV');
  check(await page.ev("document.getElementById('view').textContent.includes('zezadu')"),'camera toggle stays localized');
  check((await page.ev('ratGame.state'))===priorState,'changing language preserves game state');
  await page.screenshot(join(ROOT,'models/rat/build/previews/czech.png'));
  await page.ev('location.reload()');await page.waitFor('!!window.ratGame',30000);
  check(await page.ev("ratGame.language==='cs' && document.documentElement.lang==='cs'"),'Czech preference survives reload');
  await page.ev("{const select=document.getElementById('language');select.value='en';select.dispatchEvent(new Event('change'));}");
  check(await page.ev("document.title==='Mouse Quest' && document.getElementById('retry').textContent==='Restart'"),'switches back to English');
  check(page.errors().length === 0, `no console errors (${page.errors().join('; ') || 'none'})`);
} finally {
  page.close();
  server.close();
  done();
}
