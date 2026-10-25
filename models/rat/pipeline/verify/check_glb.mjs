// Checks a rat GLB against the spec. Usage: node check_glb.mjs <rat.glb> <expected.json>
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import validator from 'gltf-validator';

const BUDGET = 1.5 * 1024 * 1024;
const FORBIDDEN_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

const [glbPath, expectedPath] = process.argv.slice(2);
const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
const bytes = new Uint8Array(await readFile(glbPath));
const errors = [];
const fail = (msg) => errors.push(msg);

if (bytes.byteLength > BUDGET) fail(`size ${bytes.byteLength} B exceeds budget ${BUDGET} B`);

const report = await validator.validateBytes(bytes);
if (report.issues.numErrors > 0) {
  const msgs = report.issues.messages.filter((m) => m.severity === 0).slice(0, 10);
  fail(`gltf-validator: ${report.issues.numErrors} errors: ` + msgs.map((m) => `${m.code} ${m.pointer ?? ''}`).join('; '));
}

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
const root = doc.getRoot();

const used = root.listExtensionsUsed().map((e) => e.extensionName);
for (const ext of FORBIDDEN_EXT) if (used.includes(ext)) fail(`uses ${ext}`);

// Clips: exact names and durations
const anims = new Map(root.listAnimations().map((a) => [a.getName(), a]));
const missing = Object.keys(expected.clips).filter((n) => !anims.has(n));
const extra = [...anims.keys()].filter((n) => !(n in expected.clips));
if (missing.length || extra.length) fail(`clips: missing [${missing}] unexpected [${extra}]`);
for (const [name, anim] of anims) {
  if (!(name in expected.clips)) continue;
  const end = Math.max(...anim.listSamplers().map((s) => s.getInput().getMax([])[0]));
  const want = expected.clips[name].duration;
  if (Math.abs(end - want) > 1e-3) fail(`${name}: duration ${end.toFixed(4)} s, expected ${want.toFixed(4)} s`);
}

// Skeleton
const skins = root.listSkins();
if (skins.length !== 1) fail(`expected 1 skin, found ${skins.length}`);
else {
  const joints = skins[0].listJoints().map((j) => j.getName());
  const absent = expected.joints.filter((n) => !joints.includes(n));
  if (joints.length !== expected.joints.length || absent.length) fail(`joints: ${joints.length} found, missing [${absent}]`);
}

// Vertex attributes
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const w = prim.getAttribute('WEIGHTS_0');
    if (!prim.getAttribute('JOINTS_0') || !w) fail(`${mesh.getName()}: not skinned`);
    if (prim.getAttribute('JOINTS_1')) fail(`${mesh.getName()}: more than 4 influences (JOINTS_1 present)`);
    for (const a of ['COLOR_0', 'TEXCOORD_1']) if (prim.getAttribute(a)) fail(`${mesh.getName()}: unexpected ${a}`);
    if (w) {
      const el = [];
      for (let i = 0; i < w.getCount(); i++) {
        w.getElement(i, el);
        const s = el.reduce((a, b) => a + b, 0);
        if (Math.abs(s - 1) > 0.01) { fail(`vertex ${i}: weights sum to ${s}`); break; }
      }
    }
  }
}

// Materials and textures
const mats = root.listMaterials();
if (mats.length !== 1) fail(`expected 1 material, found ${mats.length}`);
else {
  const m = mats[0];
  if (!m.getDoubleSided()) fail('material must be double-sided');
  if (!m.getBaseColorTexture() || !m.getNormalTexture() || !m.getMetallicRoughnessTexture()) fail('material needs base color, normal and metallic-roughness textures');
  if (m.getMetallicFactor() !== 0) fail(`metallicFactor ${m.getMetallicFactor()}, expected 0`);
  const spec = m.getExtension('KHR_materials_specular');
  if (spec && !(spec.getSpecularFactor() > 0)) fail(`KHR_materials_specular specularFactor ${spec.getSpecularFactor()}: specular disabled, roughness map has no effect`);
}
for (const tex of root.listTextures()) {
  if (tex.getMimeType() !== 'image/webp') fail(`texture ${tex.getName()} is ${tex.getMimeType()}, expected image/webp`);
  const size = tex.getSize();
  if (size && Math.max(...size) > 2048) fail(`texture ${tex.getName()} is ${size.join('x')}`);
}

// Scale and orientation in bind pose: faces +Z, paws at y ~ 0, ~0.47 m long
const scene = root.listScenes()[0];
const { min, max } = getBounds(scene);
const length = max[2] - min[2];
if (length < 0.4 || length > 0.55) fail(`length along Z ${length.toFixed(3)} m, expected ~0.47`);
if (!(max[2] > 0.08 && min[2] < -0.25)) fail(`rat must face +Z with the tail toward -Z (z from ${min[2].toFixed(3)} to ${max[2].toFixed(3)})`);
if (Math.abs(min[1]) > 0.01) fail(`lowest point y = ${min[1].toFixed(4)}, expected ~0`);

// Speeds for game code
const speeds = scene.getExtras().clipSpeeds ?? {};
const speedKeys = Object.keys(expected.clipSpeeds);
if (Object.keys(speeds).length !== speedKeys.length || speedKeys.some((k) => Math.abs(speeds[k] - expected.clipSpeeds[k]) > 1e-6)) {
  fail(`scene extras clipSpeeds ${JSON.stringify(speeds)}, expected ${JSON.stringify(expected.clipSpeeds)}`);
}

if (errors.length) {
  for (const e of errors) console.error(`PIPELINE ERROR: ${e}`);
  process.exitCode = 1;
} else {
  console.log(`check_glb: OK (${(bytes.byteLength / 1024).toFixed(0)} KiB, ${anims.size} clips)`);
}
