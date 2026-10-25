# Rigged, Animated Rat GLB for three.js — Design

Date: 2026-10-25
Status: Draft — awaiting review

## Goal

Produce a realistic, rigged and animated rat as a single `.glb` for a three.js
(WebGL) game in which the rat is the **player character**. The asset must load
with `GLTFLoader`, play its clips with `AnimationMixer`, and crossfade cleanly.

## Decisions (agreed during brainstorming)

| Topic | Decision |
|---|---|
| Use | Player character in a three.js game |
| Mesh source | Existing CGTrader model in `models/rat/cgtrader/` (same rat as `models/rat/rat.png`) |
| Animation set | Full set (14 clips, see below) |
| Movement | In-place clips; game code moves the rat |
| Approach | Fully scripted headless Blender pipeline + `.blend` checkpoint for optional hand-polish |
| Scale | Real-world, 1 unit = 1 m (rat ≈ 0.47 m incl. tail) |
| Textures | WebP base color + mild generated normal and roughness maps |
| Source files | `models/rat/cgtrader/` is read-only and git-ignored |

## Source asset facts (verified)

- `Rat.blend`: one mesh `sm_1_0_0`, 4,646 verts / 6,800 tris, 92 disconnected
  islands (eyes, teeth, whiskers, eyelids…), 2,320 non-manifold edges.
- UV layers `DiffuseUV`, `LightmapUV`; two vertex color layers.
- One material (Principled BSDF, double-sided) with one 2048² base color `Rat.png`.
- **45 weighted vertex groups** using RAGE naming (`SKEL_*`, `FACIAL_*`) and an
  Armature modifier named `SKEL_ROOT` with **no armature object**. No bones or
  actions exist in the `.blend` or either FBX.
- World bbox ≈ (-0.046, -0.133, -0.007) → (0.046, 0.336, 0.123); Blender +Y is
  the long axis.

### Licensing risk

The bone naming (`SKEL_ROOT`, `FACIAL_L_EyelidUpper`, `SKEL_Tail0–4`) matches
Rockstar's RAGE engine and strongly suggests the mesh is a GTA V asset
re-uploaded as "royalty free". Fine for prototyping; before publishing, confirm
provenance or replace the mesh. The pipeline must work with any mesh that
carries the same vertex-group names, so the model can be swapped without
rewriting it.

## File layout

```
models/rat/
  cgtrader/              source, never modified (git-ignored)
  pipeline/
    common.py            paths, Blender helpers, assertions
    01_prep.py           import, clean, scale/orient
    02_skeleton.py       rebuild armature from vertex-group weights
    03_anims.py          control rig, gait engine, clip generation, bake
    04_export.py         GLB export
    optimize.mjs|.sh     gltf-transform post-processing
    verify/              render previews, GLB checks
    build.sh             runs everything in order
  build/                 checkpoints + previews (git-ignored)
    rat.blend
    previews/*.png
  dist/rat.glb           final asset (committed)
  viewer/index.html      three.js test page
```

Each script runs as `blender -b <input.blend> --python <script>` and saves its
output `.blend` into `build/`, so stages can be re-run individually.

## Stage 1 — Prep (`01_prep.py`)

- Open `cgtrader/Rat.blend` (never save over it).
- Remove `LightmapUV` and both vertex color layers; rename `DiffuseUV` → `UVMap`.
- Merge by distance only where the merge does not break UV seams (`remove_doubles`
  restricted to coincident verts with identical UVs). Do not decimate.
- Orient so the rat faces Blender −Y, which the glTF exporter maps to glTF
  +Z forward / +Y up. Set the origin on the ground plane between the feet.
  Apply transforms.
- Keep the material double-sided.
- Fail if any of the 45 expected vertex groups is missing or empty.

## Stage 2 — Skeleton (`02_skeleton.py`)

Hierarchy (from RAGE convention):

```
SKEL_ROOT
└─ SKEL_Pelvis
   ├─ SKEL_Spine0 → Spine1 → Spine2 → Spine3
   │   ├─ SKEL_Neck0 → SKEL_Neck1 → SKEL_Head
   │   │   ├─ FACIAL_C_Jaw, FACIAL_Nose
   │   │   ├─ FACIAL_{L,R}_Ear0 → Ear1
   │   │   ├─ FACIAL_{L,R}_Eyeball
   │   │   └─ FACIAL_{L,R}_EyelidUpper, EyelidLower
   │   └─ SKEL_{L,R}_UpperArm → Forearm → Hand → Finger00 → Finger01
   ├─ SKEL_{L,R}_Thigh → Calf → Foot → Toe0 → Toe1
   └─ SKEL_Tail0 → Tail1 → Tail2 → Tail3 → Tail4
```

(If the weight data suggests a group's parent differs, e.g. the upper arms
hang from Spine2 rather than Spine3, choose the parent whose group shares the
most boundary vertices with it, and log the choice.)

Bone placement:
- **Head** = weighted centroid of vertices weighted to *both* the bone and its
  parent (the joint region). For bones whose region doesn't touch the parent's
  (e.g. facial bones), use the bone's own weighted centroid.
- **Tail** = head of its first child; for leaf bones, extend along the
  principal axis of its own weighted vertices, by the parent's length × 0.5.
- **Roll**: legs and arms roll so the knee and elbow bend in the anatomical
  direction; spine and tail roll with local Z up.
- `SKEL_ROOT` sits at the origin on the ground and gets no weights.
- Bind: parent the mesh to the armature, keeping existing weights (no auto
  weights). Normalize to ≤ 4 influences per vertex (glTF limit for one joint
  set), then re-normalize.

Verification: render 4 test poses (legs spread, spine bent 30°, head turned
45°, tail curled) to `build/previews/skeleton_*.png` and review them before
continuing.

## Stage 3 — Animations (`03_anims.py`)

### Clips (30 fps, exact names)

| Clip | Type | Length | Content |
|---|---|---|---|
| `Idle` | loop | 4 s | breathing, tail sway, ear twitch, one blink |
| `Sniff` | loop | 4 s | head lifts and turns L/R, nose and jaw twitch |
| `Walk` | loop | 1.0 s | lateral-sequence walk (LH→LF→RH→RF), 0.25 m/s |
| `Run` | loop | 0.4 s | half-bound gallop, spine flexion, 0.8 m/s |
| `Jump_Start` | one-shot | 0.3 s | crouch → push off |
| `Jump_Air` | loop | 0.5 s | legs tucked, tail trailing |
| `Jump_Land` | one-shot | 0.35 s | absorb → neutral |
| `Turn_L` | one-shot | 0.6 s | 90° step-turn left in place |
| `Turn_R` | one-shot | 0.6 s | 90° step-turn right in place |
| `Rear_Start` | one-shot | 0.5 s | rise onto hind legs |
| `Rear_Loop` | loop | 3 s | upright, sniffing the air |
| `Rear_End` | one-shot | 0.5 s | return to four legs |
| `Eat` | loop | 2 s | sitting up, forepaws at mouth, jaw chewing |
| `Death` | one-shot | 1.5 s | stagger, roll onto side, last twitch, holds last pose |

14 clips total. Speeds are exported as glTF `extras`
on the scene (`{"clipSpeeds": {"Walk": 0.25, "Run": 0.8}}`) and documented in
the viewer.

For `Turn_L`/`Turn_R`, the root does not rotate; the body animates the step-turn
from facing 0° to facing ±90° *relative to the root*, ending in the neutral pose
rotated by ±90°. Game code applies the 90° rotation to the object at the end of
the clip (the viewer demonstrates this).

### Generation technique

- **Control rig** (non-deform, never exported): IK targets for the four feet
  (`Foot`/`Hand` bones, chain length 3) with pole targets for knees and elbows;
  a body/pelvis control; a head look-at control.
- **Gait engine**: `gait(params)` where params = per-leg phase offsets, duty
  factor, stride length, step height, speed, spine/head amplitudes. Feet stay
  planted during stance (the IK target slides back at exactly `speed`) and
  swing forward in a raised arc. This keeps feet from sliding when the game
  moves the rat at the clip speed.
- **Secondary motion**: tail chain and ears follow body motion with a phase lag
  per segment and decaying amplitude; partial head stabilization.
- **Non-gait clips** (Idle, Sniff, Rear, Eat, Death, Jump) are keyframed
  from pose functions plus procedural layers (breathing sine, blinks, chewing).
- **Parameters** for every clip live in one dict at the top of the script.
- **Bake**: each clip is baked to keyframes on the 45 deform bones + root, as
  its own Action with a fake user, pushed to NLA tracks for export. Looping
  clips: last frame == first frame; the script asserts this (bone transforms
  equal within 1e-4).

The saved `build/rat.blend` contains the control rig and actions, so a clip
can be hand-polished in Blender. A hand-edited action marked with a custom
property `locked=True` is not regenerated by `03_anims.py`.

## Stage 4 — Export (`04_export.py` + optimize)

- glTF exporter: GLB, Y-up, deform bones only, export all actions as separate
  animations, no shape keys, attributes = position/normal/UV0/joints/weights,
  material = base color + normal + metallic-roughness.
- Textures: base color from `Rat.png`; normal and roughness maps generated from
  the base color's luminance (high-pass for the normal map, inverted/levelled
  for roughness; mild strength, roughness kept in ~0.6–0.9). Generated at 2048²,
  shipped at 1024² unless that's visibly worse.
- `gltf-transform` (via `npx @gltf-transform/cli`): `dedup`, `prune`,
  `resample` (animation key reduction), `webp` texture compression. No
  Draco or meshopt compression.
- Budget: `dist/rat.glb` ≤ 1.5 MB (target ~1 MB).

## Viewer (`viewer/index.html`)

- Single HTML file, three.js from a pinned CDN version (import map), served with
  `npx serve`.
- Ground grid, hemisphere + directional light with shadow, OrbitControls.
- UI: clip buttons, crossfade duration slider, playback speed, toggles for
  SkeletonHelper and wireframe, "move at clip speed" (translates the rat forward
  at `clipSpeeds[clip]` to check foot sliding), Turn buttons that apply the
  90° rotation when the clip finishes.
- Serves as reference code for loading, the mixer and crossfades in the game.

## Verification

1. **Skeleton**: test-pose renders reviewed (Stage 2).
2. **Clips**: one contact sheet per clip (6 evenly spaced frames, side + 3/4
   view) in `build/previews/clips/`, reviewed.
3. **GLB checks** (`verify/check_glb.mjs`): run `gltf-validator` and require 0 errors;
   exactly the 14 clip names from the table present;
   46 joints (45 + root); ≤ 4 influences per vertex; file size within budget.
4. **Runtime**: open the viewer in a browser, play every clip with no
   console errors, take a screenshot.

## Error handling

Scripts fail loudly (non-zero exit, clear message) on: missing or empty vertex
group, a bone with zero weighted vertices, a loop whose first and last frames
don't match, an exported clip count that doesn't match the spec, or a validator error.
`build.sh` stops at the first failing stage.

## Out of scope

- Fur cards or shell fur, LODs, physics or ragdoll, facial blend shapes, root motion.
- Game-side character controller (the viewer only demonstrates usage).
