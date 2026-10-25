# Rigged, Animated Rat GLB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A headless Blender pipeline that turns the read-only CGTrader rat in `models/rat/cgtrader/` into `models/rat/dist/rat.glb`: rigged with 46 joints, 14 named in-place clips, loadable by three.js `GLTFLoader`, plus a three.js viewer.

**Architecture:** Four Blender stage scripts (`01_prep` → `02_skeleton` → `03_anims` → `04_export`), each opening the previous stage's `.blend` from `build/` and saving its own, then a `gltf-transform` pass. All maths that doesn't need Blender (bone placement, weight limiting, the gait engine, every clip's pose function, texture generation, image tiling) lives in pure-Python modules with pytest tests. A thin Blender adapter (`rigpose.py`) turns a pose dict into pose-bone transforms. Each stage has a `verify/` check script that fails loudly; `build.sh` runs everything in order.

**Tech Stack:** Blender 5.2.2 LTS (bundled Python 3.13 + numpy), system Python 3.14 + pytest 9 + numpy for unit tests, Node 24 with `@gltf-transform/*` 4.5.1, `gltf-validator` 2.0.0-dev.3.10, `serve` 14.2.4, three.js 0.170.0 from jsDelivr.

**Spec:** `docs/superpowers/specs/2026-10-25-rat-rig-gltf-design.md`

## Global Constraints

- Blender binary: `/c/Program Files/Blender Foundation/Blender 5.2/blender.exe` (override with `BLENDER` env var); always run with `--factory-startup -b ... --python-exit-code 1`.
- Pure modules (`names.py`, `rig_math.py`, `gait.py`, `clips.py`, `textures.py`, `imgutil.py`) must not import `bpy` and must run on both Python 3.13 (Blender) and 3.14 (pytest).
- `models/rat/cgtrader/` is read-only: never save, write or modify anything in it. `build.sh` aborts if its files' hashes change.
- Scale: real-world, 1 unit = 1 m (rat ≈ 0.47 m incl. tail). Blender: rat faces −Y, Z up, X = rat's left. glTF: faces +Z, Y up.
- 30 fps. Exactly these 14 clip names: `Idle, Sniff, Walk, Run, Jump_Start, Jump_Air, Jump_Land, Turn_L, Turn_R, Rear_Start, Rear_Loop, Rear_End, Eat, Death`.
- 46 joints = the 45 RAGE vertex groups + `SKEL_ROOT`. ≤ 4 influences per vertex, weights sum to 1.
- In-place clips; no root motion. `clipSpeeds` = `{"Walk": 0.25, "Run": 0.8}` in glTF scene extras.
- Looping clips: last frame == first frame (bone transforms equal within 1e-4).
- Textures: WebP base color + generated normal + metallic-roughness (roughness ~0.6–0.9), shipped at 1024² unless visibly worse.
- `gltf-transform`: `dedup`, `prune`, `resample`, `webp`. No Draco, no meshopt.
- `dist/rat.glb` ≤ 1.5 MB (target ~1 MB). `gltf-validator`: 0 errors.
- Scripts fail loudly: non-zero exit and a message starting `PIPELINE ERROR:`.
- Blender 5.2 has no `Action.fcurves`; F-curves live in `action.layers[*].strips[*].channelbags[*].fcurves`.

## Review Focus

1. **Gait strides longer than the legs can reach** — the spec fixes Walk at 0.25 m/s / 1.0 s and Run at 0.8 m/s / 0.4 s; one stride per clip would be 25–32 cm for a ~5 cm leg, so the IK can't plant the foot and it slides. Expected: feet stay planted. Pinned by the IK reach check in Task 6 (fails with the leg, gap and frame), and Walk/Run play 3 and 2 gait cycles per clip so the clip length stays as spec'd.
2. **Rebuilding wipes a hand-polished clip** — someone polishes `Idle` in `build/rat.blend`, marks it `locked=True`, reruns `build.sh`. Expected: their clip survives. Pinned by the sentinel round-trip in Task 6.
3. **Chained clips pop at the seam** — `Rear_Start → Rear_Loop → Rear_End` and `Jump_Air → Jump_Land` are played back-to-back by game code. Expected: the end of one equals the start of the next. Pinned by the chain-continuity test in Task 5.
4. **GLB facing the wrong way or at the wrong scale in three.js** — Expected: faces +Z, paws on y ≈ 0, ~0.47 m long. Pinned by the bounds checks in `check_glb.mjs` (Task 9).
5. **Pipeline writes into the read-only source folder** — e.g. a `save_as_mainfile` with a wrong path or Blender's relative-path remap saving the image. Expected: `cgtrader/` unchanged byte for byte. Pinned by `save_blend()` refusing paths in `cgtrader/` and the hash guard in `build.sh` (Task 1).

## Deliberate deviations from the spec (flag to the user at handoff)

- Walk and Run contain 3 and 2 whole gait cycles per clip (length unchanged) so strides fit the legs (Review Focus 1).
- The spec's "body/pelvis control" and "head look-at control" are FK channels on `SKEL_Pelvis` / `SKEL_Neck*` / `SKEL_Head` in the pose dicts, since every clip is generated procedurally; IK targets and pole targets are real control bones.
- Eyeball and nose bones use their own centroid as pivot; eyelids pivot at their eyeball's centroid (the spec's joint-centroid rule would put eye pivots on the eye rim).
- "Parameters for every clip in one dict at the top of the script" → `PARAMS` at the top of `clips.py`, which `03_anims.py` imports.
- `build/rat.blend` is saved with the IK constraints muted so the baked actions play when opened; unmute them to polish through the control rig.

## File map

```
models/rat/
  package.json, package-lock.json   Node devDeps (Task 9)
  pipeline/
    names.py           bone/group/leg names, hierarchy (pure)                 Task 1
    common.py          paths, PipelineError/run, Blender helpers (bpy)        Task 1, 3, 6, 7
    01_prep.py         stage 1                                                Task 1
    rig_math.py        bone placement + weight limiting (pure)                Task 2
    02_skeleton.py     stage 2                                                Task 3
    rigpose.py         pose dict -> pose bones, visual basis (bpy)            Task 3
    gait.py            gait engine (pure)                                     Task 4
    clips.py           PARAMS, pose layers, 14 clip functions (pure)          Task 5
    write_expected.py  prints expected GLB contents as JSON                   Task 5
    03_anims.py        stage 3: control rig, bake, NLA                        Task 6
    imgutil.py         image tiling (pure)                                    Task 7
    textures.py        normal/roughness generation (pure)                     Task 8
    04_export.py       stage 4: textures, strip controls, GLB export          Task 9
    optimize.sh        gltf-transform pass                                    Task 9
    build.sh           runs everything                                        Task 1, 3, 6, 7, 9
    tests/             pytest for the pure modules
    verify/            check_prep.py, check_skeleton.py, render_poses.py,
                       check_anims.py, mark_locked.py, render_clips.py, check_glb.mjs
  viewer/index.html    three.js viewer                                        Task 10
  dist/rat.glb         committed asset                                        Task 9
```

---

### Task 1: Names, shared helpers and the prep stage

**Files:**
- Modify: `.gitignore`
- Create: `models/rat/pipeline/names.py`
- Create: `models/rat/pipeline/tests/conftest.py`
- Create: `models/rat/pipeline/tests/test_names.py`
- Create: `models/rat/pipeline/common.py`
- Create: `models/rat/pipeline/verify/check_prep.py`
- Create: `models/rat/pipeline/01_prep.py`
- Create: `models/rat/pipeline/build.sh`

**Interfaces:**
- Produces (`names.py`): `ROOT_BONE: str`, `SIDES = ("L","R")`, `HIERARCHY: dict[str, str|None]` (bone → default parent, parents always before children), `DEFORM_GROUPS: list[str]` (45), `JOINTS: list[str]` (46), `CANDIDATE_PARENTS: dict[str, list[str]]`, `TAIL_CHILD: dict[str, str]`, `OWN_CENTROID: set[str]`, `PIVOT_FROM: dict[str, str]`, `LEGS: dict[str, str]` (`"LH"|"RH"|"LF"|"RF"` → IK tip bone), `POLE_PARENT: dict[str, str]`, `is_limb(name) -> bool`, `mirror_name(name) -> str`.
- Produces (`common.py`): constants `PIPELINE, ROOT, SRC_DIR, SRC_BLEND, SRC_TEXTURE, BUILD, PREVIEWS, DIST, RAT_BLEND, MESH_OBJ="RatMesh", ARM_OBJ="Rat", SRC_MESH_OBJ="sm_1_0_0", TEX_SIZE=1024`; `PipelineError`; `check(cond, msg)`; `run(main)`; `script_args() -> list[str]`; `save_blend(path)`; `mesh_obj()`; `arm_obj()`; `coords(obj) -> np.ndarray (n,3)`; `weight_matrix(obj, names) -> np.ndarray (n, len(names))`; `require_groups(obj) -> W` over `DEFORM_GROUPS`; `group_centroid(co, W, name) -> np.ndarray(3)`.
- Produces: `build/01_prep.blend` containing one mesh object `RatMesh` (identity transform, UV layer `UVMap` only, no color attributes, paws on z = 0, facing −Y, material `Rat` double-sided, image path = `cgtrader/Rat.png` absolute).

- [ ] **Step 1: Ignore Python caches**

Append to `.gitignore`:

```
__pycache__/
.pytest_cache/
```

- [ ] **Step 2: Write the failing names test**

`models/rat/pipeline/tests/conftest.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

`models/rat/pipeline/tests/test_names.py`:

```python
from names import (CANDIDATE_PARENTS, DEFORM_GROUPS, HIERARCHY, JOINTS, LEGS, OWN_CENTROID,
                   PIVOT_FROM, POLE_PARENT, ROOT_BONE, TAIL_CHILD, is_limb, mirror_name)

# The 45 weighted vertex groups found in models/rat/cgtrader/Rat.blend.
SOURCE_GROUPS = {
    "SKEL_Pelvis", "SKEL_Spine0", "SKEL_Spine1", "SKEL_Spine2", "SKEL_Spine3",
    "SKEL_Neck0", "SKEL_Neck1", "SKEL_Head", "FACIAL_C_Jaw", "FACIAL_Nose",
    "SKEL_Tail0", "SKEL_Tail1", "SKEL_Tail2", "SKEL_Tail3", "SKEL_Tail4",
    *(f"SKEL_{s}_{b}" for s in "LR" for b in (
        "Thigh", "Calf", "Foot", "Toe0", "Toe1",
        "UpperArm", "Forearm", "Hand", "Finger00", "Finger01")),
    *(f"FACIAL_{s}_{b}" for s in "LR" for b in (
        "Ear0", "Ear1", "Eyeball", "EyelidUpper", "EyelidLower")),
}


def test_groups_match_source_mesh():
    assert len(DEFORM_GROUPS) == 45
    assert set(DEFORM_GROUPS) == SOURCE_GROUPS


def test_joints_are_groups_plus_root():
    assert JOINTS[0] == ROOT_BONE
    assert set(JOINTS) == SOURCE_GROUPS | {ROOT_BONE}
    assert len(JOINTS) == 46


def test_parents_come_before_children():
    seen = set()
    for bone, parent in HIERARCHY.items():
        assert parent is None or parent in seen, bone
        seen.add(bone)


def test_candidate_parents_include_default():
    for bone, cands in CANDIDATE_PARENTS.items():
        assert HIERARCHY[bone] in cands


def test_tail_child_is_a_real_child():
    for bone, child in TAIL_CHILD.items():
        assert HIERARCHY[child] == bone, (bone, child)


def test_special_pivots_name_real_groups():
    assert OWN_CENTROID <= SOURCE_GROUPS
    assert set(PIVOT_FROM) | set(PIVOT_FROM.values()) <= SOURCE_GROUPS


def test_legs():
    assert set(LEGS) == set(POLE_PARENT) == {"LH", "RH", "LF", "RF"}
    assert all(is_limb(b) for b in LEGS.values())
    assert not is_limb("SKEL_Spine2") and not is_limb("FACIAL_L_Ear0")


def test_mirror_name_pairs_exist():
    for b in JOINTS:
        m = mirror_name(b)
        assert m in JOINTS and mirror_name(m) == b
    assert mirror_name("SKEL_L_Foot") == "SKEL_R_Foot"
    assert mirror_name("SKEL_Head") == "SKEL_Head"
```

- [ ] **Step 3: Run it to verify it fails**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'names'`

- [ ] **Step 4: Write `names.py`**

`models/rat/pipeline/names.py`:

```python
"""Bone, vertex-group and leg names shared by the pipeline (pure Python, no bpy)."""

ROOT_BONE = "SKEL_ROOT"
SIDES = ("L", "R")

# Bone -> default parent. Insertion order puts every parent before its children.
HIERARCHY = {ROOT_BONE: None, "SKEL_Pelvis": ROOT_BONE}
for _i in range(4):
    HIERARCHY[f"SKEL_Spine{_i}"] = "SKEL_Pelvis" if _i == 0 else f"SKEL_Spine{_i - 1}"
HIERARCHY.update({
    "SKEL_Neck0": "SKEL_Spine3", "SKEL_Neck1": "SKEL_Neck0", "SKEL_Head": "SKEL_Neck1",
    "FACIAL_C_Jaw": "SKEL_Head", "FACIAL_Nose": "SKEL_Head",
})
for _s in SIDES:
    HIERARCHY.update({
        f"FACIAL_{_s}_Ear0": "SKEL_Head", f"FACIAL_{_s}_Ear1": f"FACIAL_{_s}_Ear0",
        f"FACIAL_{_s}_Eyeball": "SKEL_Head",
        f"FACIAL_{_s}_EyelidUpper": "SKEL_Head", f"FACIAL_{_s}_EyelidLower": "SKEL_Head",
        f"SKEL_{_s}_UpperArm": "SKEL_Spine3", f"SKEL_{_s}_Forearm": f"SKEL_{_s}_UpperArm",
        f"SKEL_{_s}_Hand": f"SKEL_{_s}_Forearm", f"SKEL_{_s}_Finger00": f"SKEL_{_s}_Hand",
        f"SKEL_{_s}_Finger01": f"SKEL_{_s}_Finger00",
        f"SKEL_{_s}_Thigh": "SKEL_Pelvis", f"SKEL_{_s}_Calf": f"SKEL_{_s}_Thigh",
        f"SKEL_{_s}_Foot": f"SKEL_{_s}_Calf", f"SKEL_{_s}_Toe0": f"SKEL_{_s}_Foot",
        f"SKEL_{_s}_Toe1": f"SKEL_{_s}_Toe0",
    })
for _i in range(5):
    HIERARCHY[f"SKEL_Tail{_i}"] = "SKEL_Pelvis" if _i == 0 else f"SKEL_Tail{_i - 1}"

DEFORM_GROUPS = [b for b in HIERARCHY if b != ROOT_BONE]  # the 45 weighted vertex groups
JOINTS = list(HIERARCHY)                                  # the 46 exported joints

# Bones whose parent is picked from the weights (most shared vertices wins).
CANDIDATE_PARENTS = {f"SKEL_{s}_UpperArm": ["SKEL_Spine3", "SKEL_Spine2"] for s in SIDES}

# Bone -> child whose head becomes this bone's tail. Bones not listed are leaves.
TAIL_CHILD = {"SKEL_Pelvis": "SKEL_Spine0", "SKEL_Spine3": "SKEL_Neck0",
              "SKEL_Neck0": "SKEL_Neck1", "SKEL_Neck1": "SKEL_Head"}
for _i in range(3):
    TAIL_CHILD[f"SKEL_Spine{_i}"] = f"SKEL_Spine{_i + 1}"
for _i in range(4):
    TAIL_CHILD[f"SKEL_Tail{_i}"] = f"SKEL_Tail{_i + 1}"
for _s in SIDES:
    for _chain in (["UpperArm", "Forearm", "Hand", "Finger00", "Finger01"],
                   ["Thigh", "Calf", "Foot", "Toe0", "Toe1"]):
        for _a, _b in zip(_chain, _chain[1:]):
            TAIL_CHILD[f"SKEL_{_s}_{_a}"] = f"SKEL_{_s}_{_b}"
    TAIL_CHILD[f"FACIAL_{_s}_Ear0"] = f"FACIAL_{_s}_Ear1"

# Bones that pivot at their own weighted centroid, and bones that pivot at another group's.
OWN_CENTROID = {"FACIAL_Nose", "FACIAL_L_Eyeball", "FACIAL_R_Eyeball"}
PIVOT_FROM = {f"FACIAL_{s}_Eyelid{p}": f"FACIAL_{s}_Eyeball" for s in SIDES for p in ("Upper", "Lower")}

# Leg -> IK tip bone (chain length 3: Foot/Calf/Thigh or Hand/Forearm/UpperArm).
LEGS = {"LH": "SKEL_L_Foot", "RH": "SKEL_R_Foot", "LF": "SKEL_L_Hand", "RF": "SKEL_R_Hand"}
# Leg -> bone the knee/elbow pole target hangs from, so poles follow the body.
POLE_PARENT = {"LH": "SKEL_Pelvis", "RH": "SKEL_Pelvis", "LF": "SKEL_Spine3", "RF": "SKEL_Spine3"}

_LIMB_PARTS = ("UpperArm", "Forearm", "Hand", "Finger", "Thigh", "Calf", "Foot", "Toe")


def is_limb(name):
    return any(p in name for p in _LIMB_PARTS)


def mirror_name(name):
    if "_L_" in name:
        return name.replace("_L_", "_R_")
    if "_R_" in name:
        return name.replace("_R_", "_L_")
    return name
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: 8 passed

- [ ] **Step 6: Write `common.py`**

`models/rat/pipeline/common.py`:

```python
"""Paths and Blender helpers shared by the stage scripts (requires bpy)."""
import os
import sys
import traceback

import bpy
import numpy as np

from names import DEFORM_GROUPS

PIPELINE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(PIPELINE)                      # models/rat
SRC_DIR = os.path.join(ROOT, "cgtrader")              # read-only
SRC_BLEND = os.path.join(SRC_DIR, "Rat.blend")
SRC_TEXTURE = os.path.join(SRC_DIR, "Rat.png")
BUILD = os.path.join(ROOT, "build")
PREVIEWS = os.path.join(BUILD, "previews")
DIST = os.path.join(ROOT, "dist")
RAT_BLEND = os.path.join(BUILD, "rat.blend")

SRC_MESH_OBJ = "sm_1_0_0"
MESH_OBJ = "RatMesh"
ARM_OBJ = "Rat"
TEX_SIZE = 1024  # shipped texture size; generated at the source's 2048


class PipelineError(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise PipelineError(msg)


def run(main):
    """Run a stage's main(); any failure prints PIPELINE ERROR and exits non-zero."""
    try:
        main()
    except PipelineError as e:
        print(f"\nPIPELINE ERROR: {e}\n", file=sys.stderr)
    except Exception:
        traceback.print_exc()
        print("\nPIPELINE ERROR: unexpected exception (traceback above)\n", file=sys.stderr)
    else:
        return
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(1)


def script_args():
    """Arguments after '--' on the Blender command line."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def save_blend(path):
    path = os.path.abspath(path)
    check(os.path.commonpath([path, SRC_DIR]) != SRC_DIR, f"refusing to write into the source folder: {path}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def _obj(name, kind):
    obj = bpy.data.objects.get(name)
    check(obj is not None and obj.type == kind, f"no {kind} object named {name!r} in {bpy.data.filepath}")
    return obj


def mesh_obj():
    return _obj(MESH_OBJ, "MESH")


def arm_obj():
    return _obj(ARM_OBJ, "ARMATURE")


def coords(obj):
    verts = obj.data.vertices
    co = np.empty(len(verts) * 3)
    verts.foreach_get("co", co)
    return co.reshape(-1, 3)


def weight_matrix(obj, names):
    """Dense (n_verts, len(names)) matrix of vertex-group weights."""
    col = {obj.vertex_groups[n].index: j for j, n in enumerate(names) if n in obj.vertex_groups}
    W = np.zeros((len(obj.data.vertices), len(names)))
    for v in obj.data.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    return W


def require_groups(obj):
    """Weight matrix over DEFORM_GROUPS; fails if any group is missing or has no weighted vertex."""
    missing = [n for n in DEFORM_GROUPS if n not in obj.vertex_groups]
    check(not missing, f"{obj.name}: missing vertex groups {missing}")
    W = weight_matrix(obj, DEFORM_GROUPS)
    empty = [n for j, n in enumerate(DEFORM_GROUPS) if not (W[:, j] > 0).any()]
    check(not empty, f"{obj.name}: vertex groups with no weighted vertices {empty}")
    return W


def group_centroid(co, W, name):
    w = W[:, DEFORM_GROUPS.index(name)]
    return (co * w[:, None]).sum(0) / w.sum()
```

- [ ] **Step 7: Write the failing prep check**

`models/rat/pipeline/verify/check_prep.py`:

```python
"""Checks build/01_prep.blend against the Stage 1 spec."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import common  # noqa: E402
from common import check  # noqa: E402

PAW_GROUPS = [f"SKEL_{s}_{b}" for s in "LR" for b in ("Foot", "Toe0", "Toe1", "Hand", "Finger00", "Finger01")]


def main():
    obj = common.mesh_obj()
    me = obj.data
    check([uv.name for uv in me.uv_layers] == ["UVMap"], f"UV layers: {[uv.name for uv in me.uv_layers]}")
    check(len(me.color_attributes) == 0, f"color attributes left: {[c.name for c in me.color_attributes]}")
    ident = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    check(all(abs(obj.matrix_world[i][j] - ident[i][j]) < 1e-9 for i in range(4) for j in range(4)),
          "object transform is not applied")
    W = common.require_groups(obj)
    co = common.coords(obj)
    paw = W[:, [common.DEFORM_GROUPS.index(n) for n in PAW_GROUPS]].max(1) > 0
    check(abs(co[paw, 2].min()) < 1e-4, f"lowest paw vertex at z={co[paw, 2].min():.5f}, expected 0")
    check(common.group_centroid(co, W, "FACIAL_Nose")[1] < -0.05, "rat must face -Y")
    check(common.group_centroid(co, W, "SKEL_L_Foot")[0] > 0, "left side must be +X")
    length = co[:, 1].max() - co[:, 1].min()
    check(0.40 < length < 0.55, f"rat length {length:.3f} m, expected ~0.47")
    check(all(not m.use_backface_culling for m in me.materials), "material must stay double-sided")
    for img in bpy.data.images:
        check(os.path.exists(bpy.path.abspath(img.filepath)), f"image {img.name} path broken: {img.filepath}")
    print("check_prep: OK")


common.run(main)
```

- [ ] **Step 8: Run the check against the untouched source to verify it fails**

Run: `"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --factory-startup -b models/rat/cgtrader/Rat.blend --python-exit-code 1 --python models/rat/pipeline/verify/check_prep.py; echo "exit=$?"`
Expected: `PIPELINE ERROR: no MESH object named 'RatMesh' ...` and `exit=1`

- [ ] **Step 9: Write `01_prep.py`**

`models/rat/pipeline/01_prep.py`:

```python
"""Stage 1: clean the source mesh, orient it to face -Y, put its paws on the ground."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

import common  # noqa: E402
from common import check  # noqa: E402

OUT = os.path.join(common.BUILD, "01_prep.blend")
MERGE_DIST = 1e-6
UV_EPS = 1e-5
MAX_MERGE_FRACTION = 0.1
PAW_GROUPS = [f"SKEL_{s}_{b}" for s in "LR" for b in ("Foot", "Toe0", "Toe1", "Hand", "Finger00", "Finger01")]


def clean_attributes(me):
    check("DiffuseUV" in me.uv_layers, "source mesh has no DiffuseUV layer")
    for name in [uv.name for uv in me.uv_layers if uv.name != "DiffuseUV"]:
        me.uv_layers.remove(me.uv_layers[name])
    me.uv_layers["DiffuseUV"].name = "UVMap"
    for name in [c.name for c in me.color_attributes]:
        me.color_attributes.remove(me.color_attributes[name])


def shares_uv(a, b, uv):
    ua = [loop[uv].uv for loop in a.link_loops]
    ub = [loop[uv].uv for loop in b.link_loops]
    return any((p - q).length < UV_EPS for p in ua for q in ub)


def merge_coincident(me):
    """Weld coincident vertices that also share a UV, so UV seams stay split. Returns merge count."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    kd = KDTree(len(bm.verts))
    for v in bm.verts:
        kd.insert(v.co, v.index)
    kd.balance()
    targetmap, targets = {}, set()
    for v in bm.verts:
        if v in targetmap:
            continue
        for _co, idx, _dist in kd.find_range(v.co, MERGE_DIST):
            other = bm.verts[idx]
            if idx <= v.index or other in targetmap or other in targets:
                continue
            if shares_uv(v, other, uv):
                targetmap[other] = v
                targets.add(v)
    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.to_mesh(me)
    bm.free()
    return len(targetmap)


def orient_and_ground(obj, W):
    co = common.coords(obj)
    d = common.group_centroid(co, W, "FACIAL_Nose") - common.group_centroid(co, W, "SKEL_Pelvis")
    check(abs(d[1]) > 2 * max(abs(d[0]), abs(d[2])), f"long axis is not Blender Y (nose - pelvis = {d})")
    if d[1] > 0:
        print("01_prep: rat faced +Y, rotating 180 degrees")
        obj.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        co = common.coords(obj)
    check(common.group_centroid(co, W, "SKEL_L_Foot")[0] > 0, "SKEL_L_* groups are on the rat's right (-X)")
    paw = W[:, [common.DEFORM_GROUPS.index(n) for n in PAW_GROUPS]].max(1) > 0
    feet = [common.group_centroid(co, W, f"SKEL_{s}_{b}") for s in "LR" for b in ("Foot", "Hand")]
    x = sum(f[0] for f in feet) / 4
    y = sum(f[1] for f in feet) / 4
    z = co[paw, 2].min()
    obj.data.transform(Matrix.Translation((-x, -y, -z)))
    print(f"01_prep: moved origin by ({-x:.4f}, {-y:.4f}, {-z:.4f})")


def main():
    obj = bpy.data.objects.get(common.SRC_MESH_OBJ)
    check(obj is not None, f"source has no object {common.SRC_MESH_OBJ!r}")
    obj.name = obj.data.name = common.MESH_OBJ
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)

    me = obj.data
    clean_attributes(me)
    n0 = len(me.vertices)
    merged = merge_coincident(me)
    print(f"01_prep: welded {merged} of {n0} vertices")
    check(merged <= MAX_MERGE_FRACTION * n0, f"weld removed {merged}/{n0} vertices; MERGE_DIST too loose?")

    W = common.require_groups(obj)
    orient_and_ground(obj, W)

    for mat in me.materials:
        mat.name = "Rat"
        mat.use_backface_culling = False
    for img in bpy.data.images:
        if os.path.basename(img.filepath) == "Rat.png":
            img.filepath = common.SRC_TEXTURE
    common.save_blend(OUT)


common.run(main)
```

- [ ] **Step 10: Write `build.sh` (prep stage only for now)**

`models/rat/pipeline/build.sh`:

```bash
#!/usr/bin/env bash
# Builds models/rat/dist/rat.glb from the read-only source in models/rat/cgtrader/.
# Usage: models/rat/pipeline/build.sh [first_stage]    stages: prep skeleton anims export
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAT="$(dirname "$HERE")"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
PYTHON="${PYTHON:-python}"
STAGES=(prep skeleton anims export)
START="${1:-prep}"
[[ " ${STAGES[*]} " == *" $START "* ]] || { echo "unknown stage '$START' (one of: ${STAGES[*]})" >&2; exit 2; }

bl() { "$BLENDER" --factory-startup -b "$1" --python-exit-code 1 --python "$HERE/$2" -- "${@:3}"; }
src_hash() { sha256sum "$RAT"/cgtrader/* | sha256sum; }
BEFORE="$(src_hash)"
trap '[ "$(src_hash)" = "$BEFORE" ] || { echo "PIPELINE ERROR: files in cgtrader/ changed" >&2; exit 1; }' EXIT

running=false
stage() { [ "$1" = "$START" ] && running=true; $running; }

"$PYTHON" -m pytest "$HERE/tests" -q

if stage prep; then
  bl "$RAT/cgtrader/Rat.blend" 01_prep.py
  bl "$RAT/build/01_prep.blend" verify/check_prep.py
fi

echo "build.sh: OK"
```

- [ ] **Step 11: Run the build and verify the check passes**

Run: `bash models/rat/pipeline/build.sh`
Expected: `8 passed`, `01_prep: welded N of 4646 vertices` (N small), `check_prep: OK`, `build.sh: OK`, exit 0, and no `files in cgtrader/ changed` error from the hash guard.

- [ ] **Step 12: Commit**

```bash
git add .gitignore models/rat/pipeline
git commit -m "Add rat pipeline prep stage and shared names/helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bone placement maths

**Files:**
- Create: `models/rat/pipeline/rig_math.py`
- Test: `models/rat/pipeline/tests/test_rig_math.py`

**Interfaces:**
- Consumes: `names.HIERARCHY, CANDIDATE_PARENTS, TAIL_CHILD, OWN_CENTROID, PIVOT_FROM, ROOT_BONE, DEFORM_GROUPS`.
- Produces: `MIN_LEN = 0.002`; `centroid(co, w) -> ndarray(3)`; `joint_position(co, w_bone, w_parent) -> ndarray(3) | None`; `shared_count(w_a, w_b) -> int`; `choose_parent(candidates, counts) -> str`; `principal_axis(co, w) -> ndarray(3)` (unit); `resolve_parents(W, names, log=print) -> dict[str, str|None]`; `compute_bones(co, W, names, log=print) -> (parents, {bone: (head, tail)})` with numpy 3-vectors in mesh space; `limit_influences(W, k=4) -> ndarray` (rows renormalised; raises `ValueError` if any row has no weight).

- [ ] **Step 1: Write the failing tests**

`models/rat/pipeline/tests/test_rig_math.py`:

```python
import numpy as np
import pytest

from names import CANDIDATE_PARENTS, DEFORM_GROUPS, HIERARCHY, OWN_CENTROID, PIVOT_FROM, ROOT_BONE, TAIL_CHILD
from rig_math import (MIN_LEN, centroid, choose_parent, compute_bones, joint_position, limit_influences,
                      principal_axis, shared_count)


def synthetic(arm_parent="SKEL_Spine3"):
    """A fake mesh: one 50/50 joint vertex per bone at its designed head, plus 3 own vertices."""
    col = {n: j for j, n in enumerate(DEFORM_GROUPS)}
    pos = {ROOT_BONE: np.zeros(3)}
    for i, (b, p) in enumerate(HIERARCHY.items()):
        if b != ROOT_BONE:
            pos[b] = pos[p] + np.array([0.01 * ((i % 3) - 1), -0.02, 0.005 * (i % 2)])
    co, rows = [], []

    def add(pt, weights):
        co.append(pt)
        r = np.zeros(len(DEFORM_GROUPS))
        for n, w in weights.items():
            r[col[n]] = w
        rows.append(r)

    for b, p in HIERARCHY.items():
        if b == ROOT_BONE:
            continue
        parent = arm_parent if b in CANDIDATE_PARENTS else p
        if parent != ROOT_BONE:
            add(pos[b], {b: 0.5, parent: 0.5})
        for k in range(3):
            add(pos[b] + np.array([0.003 * k, -0.004, 0.002 * (k - 1)]), {b: 1.0})
    return np.array(co), np.array(rows), pos


def test_centroid_is_weighted():
    co = np.array([[0.0, 0, 0], [1.0, 0, 0]])
    assert centroid(co, np.array([1.0, 3.0])) == pytest.approx([0.75, 0, 0])


def test_joint_position_uses_shared_vertices_only():
    co = np.array([[0.0, 0, 0], [1.0, 0, 0], [2.0, 0, 0]])
    a = np.array([1.0, 0.5, 0.0])
    b = np.array([0.0, 0.5, 1.0])
    assert joint_position(co, a, b) == pytest.approx([1.0, 0, 0])
    assert joint_position(co, np.array([1.0, 0, 0]), np.array([0, 0, 1.0])) is None


def test_choose_parent_most_shared_then_first():
    assert choose_parent(["A", "B"], {"A": 3, "B": 7}) == "B"
    assert choose_parent(["A", "B"], {"A": 5, "B": 5}) == "A"
    assert shared_count(np.array([1.0, 0.2, 0]), np.array([0.0, 0.5, 0.5])) == 1


def test_principal_axis_follows_points():
    co = np.array([[x, 0.001 * (x % 2), 0.0] for x in range(10)], dtype=float)
    ax = principal_axis(co, np.ones(10))
    assert abs(ax @ [1, 0, 0]) == pytest.approx(1.0, abs=1e-3)


def test_heads_sit_on_shared_vertices():
    co, W, pos = synthetic()
    parents, bones = compute_bones(co, W, DEFORM_GROUPS, log=lambda *_: None)
    for b, p in parents.items():
        if b == ROOT_BONE or p == ROOT_BONE or b in OWN_CENTROID or b in PIVOT_FROM:
            continue
        assert bones[b][0] == pytest.approx(pos[b], abs=1e-9), b
    assert bones[ROOT_BONE][0] == pytest.approx([0, 0, 0])


def test_chain_tail_is_child_head_and_leaves_have_length():
    co, W, _ = synthetic()
    _, bones = compute_bones(co, W, DEFORM_GROUPS, log=lambda *_: None)
    for b, (head, tail) in bones.items():
        assert np.linalg.norm(tail - head) >= MIN_LEN * 0.999, b
        if b in TAIL_CHILD:
            assert tail == pytest.approx(bones[TAIL_CHILD[b]][0]), b


def test_eyelids_pivot_at_eyeball():
    co, W, _ = synthetic()
    _, bones = compute_bones(co, W, DEFORM_GROUPS, log=lambda *_: None)
    eye = W[:, DEFORM_GROUPS.index("FACIAL_L_Eyeball")]
    assert bones["FACIAL_L_EyelidUpper"][0] == pytest.approx(centroid(co, eye))


def test_arm_parent_follows_weights():
    co, W, _ = synthetic(arm_parent="SKEL_Spine2")
    parents, _ = compute_bones(co, W, DEFORM_GROUPS, log=lambda *_: None)
    assert parents["SKEL_L_UpperArm"] == "SKEL_Spine2"
    co, W, _ = synthetic()
    parents, _ = compute_bones(co, W, DEFORM_GROUPS, log=lambda *_: None)
    assert parents["SKEL_L_UpperArm"] == "SKEL_Spine3"


def test_limit_influences_keeps_top_k_and_normalises():
    W = np.array([[0.3, 0.25, 0.2, 0.12, 0.08, 0.05], [0.0, 0.0, 2.0, 0.0, 0.0, 0.0]])
    out = limit_influences(W, 4)
    assert (np.count_nonzero(out, axis=1) <= 4).all()
    assert out.sum(1) == pytest.approx([1.0, 1.0])
    assert out[0, :4] == pytest.approx(np.array([0.3, 0.25, 0.2, 0.12]) / 0.87)


def test_limit_influences_rejects_unweighted_vertex():
    with pytest.raises(ValueError, match="1 vertices"):
        limit_influences(np.array([[0.5, 0.5], [0.0, 0.0]]), 4)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest models/rat/pipeline/tests/test_rig_math.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'rig_math'`

- [ ] **Step 3: Write `rig_math.py`**

`models/rat/pipeline/rig_math.py`:

```python
"""Skeleton placement from vertex-group weights (pure numpy, no bpy)."""
import numpy as np

from names import CANDIDATE_PARENTS, HIERARCHY, OWN_CENTROID, PIVOT_FROM, ROOT_BONE, TAIL_CHILD

MIN_LEN = 0.002                        # m; shortest bone we create
ROOT_TAIL = np.array([0.0, -0.05, 0.0])  # SKEL_ROOT points forward, 5 cm


def centroid(co, w):
    s = w.sum()
    if s <= 0:
        raise ValueError("centroid of an empty weight set")
    return (co * w[:, None]).sum(0) / s


def joint_position(co, w_bone, w_parent):
    """Weighted centroid of the vertices weighted to both bones, or None if they share none."""
    w = w_bone * w_parent
    return None if w.sum() <= 0 else centroid(co, w)


def shared_count(w_a, w_b):
    return int(np.count_nonzero((w_a > 0) & (w_b > 0)))


def choose_parent(candidates, counts):
    """The candidate sharing the most vertices; ties go to the earliest candidate."""
    return max(candidates, key=lambda c: (counts[c], -candidates.index(c)))


def principal_axis(co, w):
    mask = w > 0
    d = co[mask] - centroid(co, w)
    ww = w[mask]
    cov = (d * ww[:, None]).T @ d / ww.sum()
    vals, vecs = np.linalg.eigh(cov)
    return vecs[:, np.argmax(vals)]


def resolve_parents(W, names, log=print):
    col = {n: j for j, n in enumerate(names)}
    parents = dict(HIERARCHY)
    for bone, cands in CANDIDATE_PARENTS.items():
        counts = {c: shared_count(W[:, col[bone]], W[:, col[c]]) for c in cands}
        parents[bone] = choose_parent(cands, counts)
        log(f"rig_math: parent of {bone} = {parents[bone]} (shared vertices {counts})")
    return parents


def _leaf_vector(co, w, head, parent_head, length):
    axis = principal_axis(co, w)
    c = centroid(co, w)
    ref = c - head if np.linalg.norm(c - head) >= MIN_LEN else head - parent_head
    if axis @ ref < 0:
        axis = -axis
    extent = max(np.linalg.norm(co[w > 0] - head, axis=1).max(), MIN_LEN)
    return axis * float(np.clip(length, MIN_LEN, extent))


def compute_bones(co, W, names, log=print):
    """Returns (parents, {bone: (head, tail)}) for every bone in HIERARCHY, in mesh space."""
    col = {n: j for j, n in enumerate(names)}

    def w(b):
        return W[:, col[b]]

    parents = resolve_parents(W, names, log)
    heads = {ROOT_BONE: np.zeros(3)}
    for bone, parent in parents.items():
        if bone == ROOT_BONE:
            continue
        if bone in PIVOT_FROM:
            heads[bone] = centroid(co, w(PIVOT_FROM[bone]))
        elif bone in OWN_CENTROID or parent == ROOT_BONE:
            heads[bone] = centroid(co, w(bone))
        else:
            j = joint_position(co, w(bone), w(parent))
            if j is None:
                log(f"rig_math: {bone} shares no vertices with {parent}; using its own centroid")
                j = centroid(co, w(bone))
            heads[bone] = j

    bones = {ROOT_BONE: (heads[ROOT_BONE], ROOT_TAIL.copy())}
    for bone, parent in parents.items():
        if bone == ROOT_BONE:
            continue
        head = heads[bone]
        child = TAIL_CHILD.get(bone)
        if child is not None and np.linalg.norm(heads[child] - head) >= MIN_LEN:
            tail = heads[child]
        else:
            ph, pt = bones[parent]
            tail = head + _leaf_vector(co, w(bone), head, heads[parent], 0.5 * np.linalg.norm(pt - ph))
        bones[bone] = (head, tail)
    return parents, bones


def limit_influences(W, k=4):
    """Keep each vertex's k largest weights and renormalise them to sum to 1."""
    drop = np.argsort(-W, axis=1)[:, k:]
    out = W.copy()
    np.put_along_axis(out, drop, 0.0, axis=1)
    s = out.sum(1, keepdims=True)
    empty = int((s[:, 0] <= 0).sum())
    if empty:
        raise ValueError(f"{empty} vertices have no weights")
    return out / s
```

- [ ] **Step 4: Run them to verify they pass**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: 18 passed

- [ ] **Step 5: Commit**

```bash
git add models/rat/pipeline/rig_math.py models/rat/pipeline/tests/test_rig_math.py
git commit -m "Add bone placement and weight limiting maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Skeleton stage, pose adapter and test-pose renders

**Files:**
- Modify: `models/rat/pipeline/common.py` (append preview helpers)
- Create: `models/rat/pipeline/rigpose.py`
- Create: `models/rat/pipeline/verify/check_skeleton.py`
- Create: `models/rat/pipeline/02_skeleton.py`
- Create: `models/rat/pipeline/verify/render_poses.py`
- Modify: `models/rat/pipeline/build.sh`

**Interfaces:**
- Consumes: `rig_math.compute_bones, limit_influences, MIN_LEN`; `common.*`; `names.*`.
- Produces (`rigpose.py`): `world_rotation(rx, ry, rz) -> Matrix(3x3)`; `reset(arm)`; `apply_pose(arm, pose: dict[str, float])` (channel semantics in the `clips.py` docstring, Task 5: `<bone>.rx/.ry/.rz` world-axis rotations at the bone head, `.x/.y/.z` world offsets only for children of `SKEL_ROOT`, `IK_<leg>.fk` sets constraint `"IK"` on `LEGS[leg]` to influence `1 - fk`; unknown bone or channel raises `KeyError`); `basis_from_pose(pb) -> Matrix(4x4)` (the `matrix_basis` that reproduces the current visual pose without constraints).
- Produces (`common.py` additions): `VIEWS: dict[str, tuple]` (`"side"`, `"q34"`, `"top"`), `setup_preview(res=(480, 360)) -> camera`, `render_view(cam, view, path)`.
- Produces: `build/02_skeleton.blend` with armature object `Rat` (46 deform bones named as `JOINTS`, `SKEL_ROOT` at origin with `use_deform=True`), `RatMesh` parented to it with an Armature modifier pointing at it, ≤ 4 normalised weights per vertex.

- [ ] **Step 1: Write the failing skeleton check**

`models/rat/pipeline/verify/check_skeleton.py`:

```python
"""Checks build/02_skeleton.blend against the Stage 2 spec."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import common  # noqa: E402
from common import check  # noqa: E402
from names import CANDIDATE_PARENTS, HIERARCHY, JOINTS, ROOT_BONE, mirror_name  # noqa: E402
from rig_math import MIN_LEN  # noqa: E402

SYMMETRY_TOL = 0.002  # m


def main():
    arm, mesh = common.arm_obj(), common.mesh_obj()
    bones = arm.data.bones
    check(sorted(b.name for b in bones) == sorted(JOINTS), f"bones differ from JOINTS: {sorted(b.name for b in bones)}")
    for b in bones:
        parent = b.parent.name if b.parent else None
        allowed = CANDIDATE_PARENTS.get(b.name, [HIERARCHY[b.name]])
        check(parent in allowed, f"{b.name}: parent {parent}, expected one of {allowed}")
        check(b.use_deform, f"{b.name}: must be a deform bone")
        check(b.length >= MIN_LEN * 0.999, f"{b.name}: length {b.length:.5f} m")
    check(bones[ROOT_BONE].head_local.length < 1e-9, "SKEL_ROOT must sit at the origin")
    for b in bones:
        m = bones[mirror_name(b.name)]
        mirrored = m.head_local.copy()
        mirrored.x = -mirrored.x
        check((b.head_local - mirrored).length < SYMMETRY_TOL,
              f"{b.name} and {m.name} heads are not mirror images ({(b.head_local - mirrored).length * 1000:.1f} mm)")
    common.require_groups(mesh)
    for v in mesh.data.vertices:
        ws = [g.weight for g in v.groups if g.weight > 0]
        check(1 <= len(ws) <= 4, f"vertex {v.index} has {len(ws)} influences")
        check(abs(sum(ws) - 1) < 1e-4, f"vertex {v.index} weights sum to {sum(ws)}")
    check(mesh.parent == arm, "RatMesh must be parented to the armature")
    mods = [m for m in mesh.modifiers if m.type == "ARMATURE"]
    check(len(mods) == 1 and mods[0].object == arm, "RatMesh needs exactly one Armature modifier using Rat")
    for s in "LR":
        z = bones[f"SKEL_{s}_Foot"].tail_local.z
        check(z < 0.02, f"SKEL_{s}_Foot tail at z={z:.3f}; feet should be near the ground")
    print("check_skeleton: OK")


common.run(main)
```

- [ ] **Step 2: Run it against the prep output to verify it fails**

Run: `"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --factory-startup -b models/rat/build/01_prep.blend --python-exit-code 1 --python models/rat/pipeline/verify/check_skeleton.py; echo "exit=$?"`
Expected: `PIPELINE ERROR: no ARMATURE object named 'Rat' ...`, `exit=1`

- [ ] **Step 3: Write `02_skeleton.py`**

`models/rat/pipeline/02_skeleton.py`:

```python
"""Stage 2: rebuild the armature from the vertex-group weights and bind the mesh to it."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402
from names import DEFORM_GROUPS, is_limb  # noqa: E402
from rig_math import compute_bones, limit_influences  # noqa: E402

OUT = os.path.join(common.BUILD, "02_skeleton.blend")
MAX_INFLUENCES = 4
UP = Vector((0, 0, 1))
FORWARD = Vector((0, -1, 0))


def roll_toward(eb, v):
    """Point the bone's local Z at v (falls back when v is nearly along the bone)."""
    d = (eb.tail - eb.head).normalized()
    if abs(d.dot(v)) > 0.95:
        v = FORWARD if v == UP else UP
    eb.align_roll(v)


def build_armature(parents, bones):
    arm = bpy.data.objects.new(common.ARM_OBJ, bpy.data.armatures.new(common.ARM_OBJ))
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for name in parents:
        b = eb.new(name)
        b.head, b.tail = Vector(bones[name][0]), Vector(bones[name][1])
        b.use_deform = True  # SKEL_ROOT too: it has no weights but must be exported as a joint
    for name, parent in parents.items():
        if parent is not None:
            eb[name].parent = eb[parent]
            eb[name].use_connect = False
    for b in eb:
        # Limbs: local Z forward, so knees and elbows bend about local X. Everything else: Z up.
        roll_toward(b, FORWARD if is_limb(b.name) else UP)
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind(mesh, arm, W):
    Wl = limit_influences(W, MAX_INFLUENCES)
    for j, name in enumerate(DEFORM_GROUPS):
        vg = mesh.vertex_groups[name]
        drop = np.nonzero((W[:, j] > 0) & (Wl[:, j] == 0))[0]
        if len(drop):
            vg.remove(drop.tolist())
        for i in np.nonzero(Wl[:, j] > 0)[0]:
            vg.add([int(i)], float(Wl[i, j]), "REPLACE")
    mesh.parent = arm
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    mods = [m for m in mesh.modifiers if m.type == "ARMATURE"]
    for m in mods[1:]:
        mesh.modifiers.remove(m)
    mod = mods[0] if mods else mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    mod.use_deform_preserve_volume = False


def main():
    mesh = common.mesh_obj()
    W = common.require_groups(mesh)
    parents, bones = compute_bones(common.coords(mesh), W, DEFORM_GROUPS)
    arm = build_armature(parents, bones)
    bind(mesh, arm, W)
    common.save_blend(OUT)


common.run(main)
```

- [ ] **Step 4: Run stage 2 and the check**

Run:
```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --factory-startup -b models/rat/build/01_prep.blend --python-exit-code 1 --python models/rat/pipeline/02_skeleton.py && \
"$B" --factory-startup -b models/rat/build/02_skeleton.blend --python-exit-code 1 --python models/rat/pipeline/verify/check_skeleton.py
```
Expected: two `rig_math: parent of SKEL_*_UpperArm = ...` log lines, then `check_skeleton: OK`. If the symmetry check fails, the source weights are asymmetric: print both heads, and if the gap is under 5 mm raise `SYMMETRY_TOL` to 0.005 with a comment naming the bones; otherwise stop and report to the user.

- [ ] **Step 5: Write the pose adapter**

`models/rat/pipeline/rigpose.py`:

```python
"""Applies a clips.py pose dict to the armature's pose bones (requires bpy)."""
from collections import defaultdict

from mathutils import Matrix, Vector

from names import LEGS, ROOT_BONE

ROT = ("rx", "ry", "rz")
LOC = ("x", "y", "z")


def world_rotation(rx, ry, rz):
    return Matrix.Rotation(rz, 3, "Z") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rx, 3, "X")


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    for tip in LEGS.values():
        con = arm.pose.bones[tip].constraints.get("IK")
        if con is not None:
            con.influence = 1.0


def apply_pose(arm, pose):
    """Reset to rest, then apply every channel of pose (see the clips.py docstring)."""
    reset(arm)
    chans = defaultdict(dict)
    for key, value in pose.items():
        bone, ch = key.rsplit(".", 1)
        chans[bone][ch] = value
    for bone, ch in chans.items():
        unknown = set(ch) - set(ROT) - set(LOC) - {"fk"}
        if unknown:
            raise KeyError(f"{bone}: unknown channels {sorted(unknown)}")
        pb = arm.pose.bones.get(bone)
        if pb is None:
            raise KeyError(f"pose names unknown bone {bone!r}")
        if "fk" in ch:
            arm.pose.bones[LEGS[bone[len("IK_"):]]].constraints["IK"].influence = 1.0 - ch["fk"]
        B = pb.bone.matrix_local.to_3x3()
        Binv = B.inverted()
        if any(c in ch for c in ROT):
            R = world_rotation(ch.get("rx", 0.0), ch.get("ry", 0.0), ch.get("rz", 0.0))
            pb.rotation_quaternion = (Binv @ R @ B).to_quaternion()
        if any(c in ch for c in LOC):
            parent = pb.parent.name if pb.parent else None
            if parent not in (None, ROOT_BONE):
                raise KeyError(f"{bone}: location channels are only allowed on children of {ROOT_BONE}")
            pb.location = Binv @ Vector((ch.get("x", 0.0), ch.get("y", 0.0), ch.get("z", 0.0)))


def basis_from_pose(pb):
    """The matrix_basis that reproduces pb's current visual pose with constraints removed."""
    rest = pb.bone.matrix_local
    if pb.parent is None:
        return rest.inverted() @ pb.matrix
    rest_rel = pb.parent.bone.matrix_local.inverted() @ rest
    return rest_rel.inverted() @ pb.parent.matrix.inverted() @ pb.matrix
```

- [ ] **Step 6: Append preview helpers to `common.py`**

Append to `models/rat/pipeline/common.py`:

```python


# --- preview rendering -------------------------------------------------------

VIEWS = {"side": (0.75, 0.0, 0.10), "q34": (0.5, -0.5, 0.3), "top": (0.0, 0.25, 0.9)}
PREVIEW_TARGET = (0.0, 0.05, 0.05)


def setup_preview(res=(480, 360)):
    """Workbench scene with a ground plane and a camera aimed at the rat; returns the camera."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, 0))
    target = bpy.data.objects.new("PreviewTarget", None)
    scene.collection.objects.link(target)
    target.location = PREVIEW_TARGET
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
    cam.data.lens = 50
    cam.data.clip_start = 0.01
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam
    return cam


def render_view(cam, view, path):
    cam.location = VIEWS[view]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
```

- [ ] **Step 7: Write the test-pose renderer**

`models/rat/pipeline/verify/render_poses.py`:

```python
"""Renders the Stage 2 test poses to build/previews/skeleton_<pose>_<view>.png (never saves the .blend)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import common  # noqa: E402
import rigpose  # noqa: E402

SPINE = [f"SKEL_Spine{i}" for i in range(4)]
NECK_HEAD = ["SKEL_Neck0", "SKEL_Neck1", "SKEL_Head"]
TAIL = [f"SKEL_Tail{i}" for i in range(5)]

POSES = {
    "rest": {},
    # Ry turns a downward leg toward -X, so the left (+X) leg spreads with a negative angle.
    "legs_spread": {"SKEL_L_Thigh.ry": -0.5, "SKEL_R_Thigh.ry": 0.5,
                    "SKEL_L_UpperArm.ry": -0.5, "SKEL_R_UpperArm.ry": 0.5},
    "spine_bent": {f"{b}.rz": 0.5236 / 4 for b in SPINE},         # 30 degrees to the left
    "head_turned": {f"{b}.rz": 0.7854 / 3 for b in NECK_HEAD},    # 45 degrees to the left
    "tail_curled": {f"{b}.rz": 0.45 for b in TAIL},
}


def main():
    arm = common.arm_obj()
    cam = common.setup_preview()
    for name, pose in POSES.items():
        rigpose.apply_pose(arm, pose)
        bpy.context.view_layer.update()
        for view in ("q34", "top"):
            common.render_view(cam, view, os.path.join(common.PREVIEWS, f"skeleton_{name}_{view}.png"))
    print("render_poses: OK")


common.run(main)
```

- [ ] **Step 8: Add the skeleton stage to `build.sh`**

In `models/rat/pipeline/build.sh`, insert before the line `echo "build.sh: OK"`:

```bash
if stage skeleton; then
  bl "$RAT/build/01_prep.blend" 02_skeleton.py
  bl "$RAT/build/02_skeleton.blend" verify/check_skeleton.py
  bl "$RAT/build/02_skeleton.blend" verify/render_poses.py
fi

```

- [ ] **Step 9: Run the skeleton stage**

Run: `bash models/rat/pipeline/build.sh skeleton`
Expected: `check_skeleton: OK`, `render_poses: OK`, `build.sh: OK`; 10 PNGs in `models/rat/build/previews/skeleton_*`.

- [ ] **Step 10: Review the test poses with the user (checkpoint)**

Open the 10 `skeleton_*` PNGs (Read tool shows images). Check: rest pose matches `models/rat/rat.png`; legs spread outward at the hips/shoulders without the body tearing; spine bends left smoothly; head turns left about the neck; tail curls without collapsing. Fix placement problems in `rig_math.py`/`names.py` (add a test for each fix), rerun from `skeleton`. **Show the images to the user and wait for approval before Task 4.**

- [ ] **Step 11: Commit**

```bash
git add models/rat/pipeline
git commit -m "Add skeleton stage, pose adapter and test-pose renders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gait engine

**Files:**
- Create: `models/rat/pipeline/gait.py`
- Test: `models/rat/pipeline/tests/test_gait.py`

**Interfaces:**
- Produces: `smoothstep(s) -> float` (clamped to [0,1]); `GaitParams(length, cycles, speed, duty, step_height, phases)` frozen dataclass with properties `period` and `reach`; `foot_offset(g, leg, t) -> (dx, dy, dz)` IK-target offset from rest in armature space (forward = −Y); `in_stance(g, leg, t) -> bool`. `phases[leg]` is the leg's lift-off time as a fraction of the cycle.

- [ ] **Step 1: Write the failing tests**

`models/rat/pipeline/tests/test_gait.py`:

```python
import pytest

from gait import GaitParams, foot_offset, in_stance, smoothstep

WALK = GaitParams(length=1.0, cycles=3, speed=0.25, duty=0.65, step_height=0.012,
                  phases={"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75})
DT = 1e-5


def grid(g, n=3000):
    return [g.length * i / n for i in range(n)]


def test_smoothstep_clamps():
    assert smoothstep(-1) == 0 and smoothstep(2) == 1 and smoothstep(0.5) == 0.5


def test_planted_foot_moves_back_at_ground_speed():
    for leg in WALK.phases:
        for t in grid(WALK):
            if in_stance(WALK, leg, t) and in_stance(WALK, leg, t + DT):
                y0 = foot_offset(WALK, leg, t)[1]
                y1 = foot_offset(WALK, leg, t + DT)[1]
                assert (y1 - y0) / DT == pytest.approx(WALK.speed, rel=1e-6)
                assert foot_offset(WALK, leg, t)[2] == 0.0


def test_reach():
    assert WALK.period == pytest.approx(1 / 3)
    assert WALK.reach == pytest.approx(0.25 * 0.65 / 3)


def test_path_is_continuous():
    for leg in WALK.phases:
        for t in grid(WALK):
            a, b = foot_offset(WALK, leg, t), foot_offset(WALK, leg, t + DT)
            assert max(abs(p - q) for p, q in zip(a, b)) < 1e-4


def test_clip_loops():
    for leg in WALK.phases:
        assert foot_offset(WALK, leg, 0.0) == pytest.approx(foot_offset(WALK, leg, WALK.length), abs=1e-9)


def test_swing_peaks_at_step_height():
    peak = max(foot_offset(WALK, "LH", t)[2] for t in grid(WALK, 30000))
    assert peak == pytest.approx(WALK.step_height, abs=1e-6)


def test_walk_lifts_legs_in_lateral_sequence():
    ts = grid(WALK, 6000)
    lift = {leg: next(t for t in ts if in_stance(WALK, leg, t - DT) and not in_stance(WALK, leg, t))
            for leg in WALK.phases}
    assert sorted(lift, key=lift.get) == ["LH", "LF", "RH", "RF"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest models/rat/pipeline/tests/test_gait.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gait'`

- [ ] **Step 3: Write `gait.py`**

`models/rat/pipeline/gait.py`:

```python
"""Gait engine: periodic IK-target paths that keep each foot planted during stance (no bpy).

Armature space: X = rat's left, Y = backward, Z = up. The game moves the rat toward -Y
(glTF +Z) at `speed`, so a planted foot must slide toward +Y at exactly `speed`.
"""
import math
from dataclasses import dataclass


def smoothstep(s):
    s = min(max(s, 0.0), 1.0)
    return s * s * (3.0 - 2.0 * s)


@dataclass(frozen=True)
class GaitParams:
    length: float       # clip length, s
    cycles: int         # whole stride cycles per clip, so the clip loops
    speed: float        # m/s the game moves the rat forward
    duty: float         # fraction of a cycle each foot is on the ground
    step_height: float  # m, peak lift during swing
    phases: dict        # leg -> lift-off time as a fraction of the cycle

    @property
    def period(self):
        return self.length / self.cycles

    @property
    def reach(self):
        """How far a planted foot travels backward relative to the body during one stance."""
        return self.speed * self.duty * self.period


def _phase(g, leg, t):
    return (g.cycles * t / g.length - g.phases[leg]) % 1.0


def in_stance(g, leg, t):
    return _phase(g, leg, t) >= 1.0 - g.duty


def foot_offset(g, leg, t):
    """(dx, dy, dz) of the leg's IK target from its rest position at time t."""
    u = _phase(g, leg, t)
    swing = 1.0 - g.duty
    r = g.reach
    if u < swing:  # lifted, moving forward from +r/2 to -r/2
        s = u / swing
        return (0.0, r / 2 - r * smoothstep(s), g.step_height * math.sin(math.pi * s))
    s = (u - swing) / g.duty  # planted, sliding back from -r/2 to +r/2 at `speed`
    return (0.0, -r / 2 + r * s, 0.0)
```

- [ ] **Step 4: Run them to verify they pass**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: 25 passed

- [ ] **Step 5: Commit**

```bash
git add models/rat/pipeline/gait.py models/rat/pipeline/tests/test_gait.py
git commit -m "Add gait engine with planted-foot guarantee

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Clip library

**Files:**
- Create: `models/rat/pipeline/clips.py`
- Create: `models/rat/pipeline/write_expected.py`
- Test: `models/rat/pipeline/tests/test_clips.py`

**Interfaces:**
- Consumes: `gait.GaitParams, foot_offset, smoothstep`; `names.LEGS, JOINTS`.
- Produces: `FPS = 30`; `PARAMS: dict`; `Rig(pelvis_head: tuple, targets: dict[leg, tuple])`; `Clip(name, length, loop, fn)` with property `frames` (last frame index, `ceil(length*FPS)`); `CLIPS: dict[str, Clip]` in spec order; `CLIP_SPEEDS = {"Walk": 0.25, "Run": 0.8}`; `times(clip) -> list[float]` (sample time per frame `0..frames`, clamped to `length`); `sample(name, t, rig) -> dict[str, float]`; `rotz_offset(p, angle) -> (dx, dy)`.
- Produces (`write_expected.py`): prints JSON `{"joints": [...46], "clips": {name: {"duration": frames/FPS, "loop": bool}}, "clipSpeeds": {...}}` to stdout.

- [ ] **Step 1: Write the failing tests**

`models/rat/pipeline/tests/test_clips.py`:

```python
import json
import math
import os
import subprocess
import sys

import pytest

import clips
from clips import CLIP_SPEEDS, CLIPS, FPS, Rig, rotz_offset, sample, times
from names import JOINTS, LEGS

RIG = Rig(pelvis_head=(0.0, 0.077, 0.073),
          targets={"LH": (0.03, 0.06, 0.0), "RH": (-0.03, 0.06, 0.0),
                   "LF": (0.022, -0.06, 0.0), "RF": (-0.022, -0.06, 0.0)})

SPEC = [("Idle", True, 4.0), ("Sniff", True, 4.0), ("Walk", True, 1.0), ("Run", True, 0.4),
        ("Jump_Start", False, 0.3), ("Jump_Air", True, 0.5), ("Jump_Land", False, 0.35),
        ("Turn_L", False, 0.6), ("Turn_R", False, 0.6), ("Rear_Start", False, 0.5),
        ("Rear_Loop", True, 3.0), ("Rear_End", False, 0.5), ("Eat", True, 2.0), ("Death", False, 1.5)]
IK_BONES = {f"IK_{leg}" for leg in LEGS}


def close(a, b, tol=1e-6):
    return all(abs(a.get(k, 0.0) - b.get(k, 0.0)) <= tol for k in set(a) | set(b))


def test_clip_table_matches_spec():
    assert [(c.name, c.loop, c.length) for c in CLIPS.values()] == SPEC


def test_loops_have_whole_frame_counts():
    for c in CLIPS.values():
        if c.loop:
            assert c.length * FPS == pytest.approx(round(c.length * FPS))
    assert CLIPS["Jump_Land"].frames == 11
    assert times(CLIPS["Jump_Land"])[-1] == pytest.approx(0.35)
    assert len(times(CLIPS["Idle"])) == 121


def test_speeds():
    assert CLIP_SPEEDS == {"Walk": 0.25, "Run": 0.8}


@pytest.mark.parametrize("name", [n for n, loop, _ in SPEC if loop])
def test_loops_close(name):
    c = CLIPS[name]
    assert close(sample(name, 0.0, RIG), sample(name, c.length, RIG))


@pytest.mark.parametrize("name", [n for n, _, _ in SPEC])
def test_channels_are_valid(name):
    for t in times(CLIPS[name]):
        for key, v in sample(name, t, RIG).items():
            bone, ch = key.rsplit(".", 1)
            assert bone in JOINTS or bone in IK_BONES, key
            assert math.isfinite(v), key
            if ch in ("rx", "ry", "rz"):
                assert abs(v) <= math.pi, key
            elif ch in ("x", "y", "z"):
                assert bone == "SKEL_Pelvis" or bone in IK_BONES, key
                assert abs(v) < 0.1, key
            elif ch == "fk":
                assert bone in IK_BONES and 0.0 <= v <= 1.0, key
            else:
                pytest.fail(f"unknown channel {key}")


@pytest.mark.parametrize("name,sign", [("Turn_L", 1), ("Turn_R", -1)])
def test_turn_ends_in_rotated_neutral(name, sign):
    end = sample(name, CLIPS[name].length, RIG)
    angle = sign * math.pi / 2
    assert end["SKEL_Pelvis.rz"] == pytest.approx(angle)
    px, py = rotz_offset(RIG.pelvis_head, angle)
    assert (end["SKEL_Pelvis.x"], end["SKEL_Pelvis.y"]) == pytest.approx((px, py))
    for leg, q in RIG.targets.items():
        dx, dy = rotz_offset(q, angle)
        assert end[f"IK_{leg}.x"] == pytest.approx(dx) and end[f"IK_{leg}.y"] == pytest.approx(dy)
        assert end[f"IK_{leg}.z"] == pytest.approx(0.0, abs=1e-12)
    others = {k: v for k, v in end.items() if not k.startswith(("SKEL_Pelvis.", "IK_"))}
    assert close(others, {}, 1e-9)


def test_rotz_offset():
    assert rotz_offset((0.0, -1.0, 0.0), math.pi / 2) == pytest.approx((1.0, 1.0))


def test_death_holds_last_pose():
    L = CLIPS["Death"].length
    assert close(sample("Death", L, RIG), sample("Death", L - 0.1, RIG))


@pytest.mark.parametrize("first,second", [("Rear_Start", "Rear_Loop"), ("Rear_Loop", "Rear_End"),
                                          ("Jump_Air", "Jump_Land")])
def test_chained_clips_meet(first, second):
    end = CLIPS[first].length if not CLIPS[first].loop else 0.0
    assert close(sample(first, end, RIG), sample(second, 0.0, RIG))


def test_walk_feet_follow_gait():
    g = clips.PARAMS["Walk"]["gait"]
    for t in times(CLIPS["Walk"]):
        p = sample("Walk", t, RIG)
        for leg in LEGS:
            assert (p[f"IK_{leg}.x"], p[f"IK_{leg}.y"], p[f"IK_{leg}.z"]) == pytest.approx(
                clips.foot_offset(g, leg, t))


def test_write_expected_prints_spec():
    script = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "write_expected.py")
    out = json.loads(subprocess.run([sys.executable, script], capture_output=True, text=True, check=True).stdout)
    assert out["joints"] == JOINTS
    assert list(out["clips"]) == [n for n, _, _ in SPEC]
    assert out["clips"]["Jump_Land"]["duration"] == pytest.approx(11 / 30)
    assert out["clipSpeeds"] == CLIP_SPEEDS
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest models/rat/pipeline/tests/test_clips.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'clips'`

- [ ] **Step 3: Write `clips.py`**

`models/rat/pipeline/clips.py`:

```python
"""Clip library: each clip is a pure function (t, rig) -> pose (no bpy).

A pose maps "<bone>.<channel>" to a float; channels missing from a pose are 0 (rest):
  rx ry rz  rotation in radians about the armature's X/Y/Z axes (X = rat's left, Y = backward,
            Z = up), pivoting at the bone's head and carried along by its children.
            Forward-pointing bones (pelvis, spine, neck, head, jaw): rx > 0 tips the nose down,
            rz > 0 turns it to the rat's left. Tail: rx > 0 lifts the tip.
            Downward-pointing legs: rx < 0 swings the paw forward; ry < 0 swings a left leg out.
  x y z     head offset in metres, armature axes; only on SKEL_Pelvis and the IK_<leg> targets.
  fk        on IK_<leg>: 0 = IK keeps the paw on its target, 1 = the leg follows its FK channels.
All numbers below are starting values: tune them against the contact sheets, then rerun
`build.sh anims`.
"""
import math
from dataclasses import dataclass
from functools import partial
from typing import Callable

from gait import GaitParams, foot_offset, smoothstep
from names import LEGS

FPS = 30

PARAMS = {
    "Idle": dict(length=4.0, breath_cycles=6, breath_amp=0.015, tail_cycles=2, tail_amp=0.12,
                 look_amp=0.1, ear_at=1.1, ear_amp=0.3, blink_at=2.6),
    "Sniff": dict(length=4.0, look_up=-0.25, look_side=0.35, nose_cycles=24, nose_amp=0.08,
                  jaw_cycles=12, jaw_amp=0.04, breath_cycles=12),
    # Walk/Run play several gait cycles per clip so each stride fits the legs (see plan).
    "Walk": dict(gait=GaitParams(length=1.0, cycles=3, speed=0.25, duty=0.65, step_height=0.012,
                                 phases={"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75}),
                 bob=0.002, sway=0.04, tail_amp=0.15),
    "Run": dict(gait=GaitParams(length=0.4, cycles=2, speed=0.8, duty=0.3, step_height=0.02,
                                phases={"LH": 0.0, "RH": 0.05, "LF": 0.5, "RF": 0.6}),
                flex=0.12, bob=0.004, pitch=0.08, tail_amp=0.1),
    "Jump_Start": dict(length=0.3, crouch_at=0.18),
    "Jump_Air": dict(length=0.5, paddle=0.004, tail_amp=0.05),
    "Jump_Land": dict(length=0.35, absorb_at=0.12),
    "Turn": dict(length=0.6, angle=math.pi / 2, step_height=0.012, step_len=0.5,
                 starts={"LF": 0.0, "RH": 0.15, "RF": 0.35, "LH": 0.5}, spine_lead=0.25, neck_lead=0.3),
    "Rear_Start": dict(length=0.5),
    "Rear_Loop": dict(length=3.0, look_amp=0.3, nod_amp=0.1, nose_cycles=18, nose_amp=0.08,
                      breath_cycles=9),
    "Rear_End": dict(length=0.5),
    "Eat": dict(length=2.0, chew_cycles=8, jaw_amp=0.15, paw_amp=0.05),
    "Death": dict(length=1.5, stagger_at=0.3, down_at=0.8, twitch_at=1.05, twitch_len=0.3),
}

SPINE = [f"SKEL_Spine{i}" for i in range(4)]
TAIL = [f"SKEL_Tail{i}" for i in range(5)]


# --- layers --------------------------------------------------------------------

def osc(t, length, cycles, phase=0.0):
    """Sine with a whole number of cycles per clip, so loops close."""
    return math.sin(2 * math.pi * (cycles * t / length + phase))


def bump(t, start, dur):
    """0 outside [start, start+dur], smooth sin^2 hump inside."""
    if t <= start or t >= start + dur:
        return 0.0
    return math.sin(math.pi * (t - start) / dur) ** 2


def add(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = out.get(k, 0.0) + v
    return out


def each(bones, ch, total):
    """Spread a total rotation evenly over a chain."""
    return {f"{b}.{ch}": total / len(bones) for b in bones}


def both(fmt, value):
    return {fmt.format(s): value for s in ("L", "R")}


def keyposes(t, keys):
    """Smoothstep between (time, pose) keys; holds the first/last key outside their range."""
    if t <= keys[0][0]:
        return dict(keys[0][1])
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t <= t1:
            s = smoothstep((t - t0) / (t1 - t0))
            return {k: p0.get(k, 0.0) + (p1.get(k, 0.0) - p0.get(k, 0.0)) * s for k in set(p0) | set(p1)}
    return dict(keys[-1][1])


def breathing(t, length, cycles, amp):
    return {"SKEL_Spine1.rx": amp * osc(t, length, cycles), "SKEL_Spine2.rx": amp * osc(t, length, cycles)}


def tail_wave(t, length, cycles, amp, ch="rz", lag=0.6, decay=0.8):
    """Travelling wave down the tail: each segment lags and shrinks."""
    return {f"{b}.{ch}": amp * decay ** i * math.sin(2 * math.pi * cycles * t / length - lag * i)
            for i, b in enumerate(TAIL)}


def blink(t, start, dur=0.18, close=0.6):
    b = bump(t, start, dur) * close
    return {"FACIAL_L_EyelidUpper.ry": b, "FACIAL_L_EyelidLower.ry": -0.6 * b,
            "FACIAL_R_EyelidUpper.ry": -b, "FACIAL_R_EyelidLower.ry": 0.6 * b}


def stabilize_head(pose, k):
    """Counter-rotate the neck by k times the body's pitch and yaw."""
    out = dict(pose)
    for ch in ("rx", "rz"):
        body = sum(pose.get(f"{b}.{ch}", 0.0) for b in ["SKEL_Pelvis", *SPINE])
        out[f"SKEL_Neck0.{ch}"] = out.get(f"SKEL_Neck0.{ch}", 0.0) - k * body
    return out


def gait_legs(g, t):
    out = {}
    for leg in LEGS:
        dx, dy, dz = foot_offset(g, leg, t)
        out.update({f"IK_{leg}.x": dx, f"IK_{leg}.y": dy, f"IK_{leg}.z": dz})
    return out


def rotz_offset(p, angle):
    """Offset that carries point p to its rotation by angle about the vertical axis through the origin."""
    c, s = math.cos(angle), math.sin(angle)
    x, y = p[0], p[1]
    return (x * c - y * s - x, x * s + y * c - y)


# --- poses -----------------------------------------------------------------------

CROUCH = {"SKEL_Pelvis.z": -0.012, "SKEL_Spine1.rx": 0.08, "SKEL_Spine2.rx": 0.08, "SKEL_Neck0.rx": -0.1}
PUSH = {"SKEL_Pelvis.z": 0.008, "SKEL_Pelvis.rx": -0.15, "IK_LH.y": 0.02, "IK_RH.y": 0.02,
        "IK_LF.y": -0.01, "IK_RF.y": -0.01, "IK_LF.z": 0.015, "IK_RF.z": 0.015}
TUCK = {"IK_LH.y": 0.008, "IK_RH.y": 0.008, "IK_LH.z": 0.02, "IK_RH.z": 0.02,
        "IK_LF.y": -0.006, "IK_RF.y": -0.006, "IK_LF.z": 0.022, "IK_RF.z": 0.022,
        "SKEL_Tail0.rx": 0.1, "SKEL_Tail1.rx": 0.05}
ABSORB = {"SKEL_Pelvis.z": -0.014, "SKEL_Spine1.rx": 0.08, "SKEL_Spine2.rx": 0.08, "SKEL_Neck0.rx": -0.12}
REAR = {"SKEL_Pelvis.rx": -0.9, "SKEL_Pelvis.z": 0.01, **each(SPINE, "rx", -0.3),
        "SKEL_Neck0.rx": 0.45, "SKEL_Head.rx": 0.35, "SKEL_Tail0.rx": 0.8,
        "IK_LF.fk": 1.0, "IK_RF.fk": 1.0,
        **both("SKEL_{}_UpperArm.rx", 0.5), **both("SKEL_{}_Forearm.rx", -1.0)}
SIT = {"SKEL_Pelvis.rx": -0.6, "SKEL_Pelvis.z": 0.004, **each(SPINE, "rx", -0.2),
       "SKEL_Neck0.rx": 0.35, "SKEL_Head.rx": 0.45, "SKEL_Tail0.rx": 0.55,
       "IK_LF.fk": 1.0, "IK_RF.fk": 1.0,
       **both("SKEL_{}_UpperArm.rx", -0.6), **both("SKEL_{}_Forearm.rx", -1.2), **both("SKEL_{}_Hand.rx", -0.4)}
STAGGER = {"SKEL_Pelvis.ry": 0.2, "SKEL_Pelvis.rz": 0.15, "SKEL_Neck0.rx": 0.3,
           "IK_RF.y": -0.01, "IK_RF.z": 0.006}
# Ry > 0 rolls the back toward +X, so the rat lies on its right side.
ON_SIDE = {"SKEL_Pelvis.ry": 1.45, "SKEL_Pelvis.z": -0.04, "SKEL_Pelvis.x": -0.025,
           "SKEL_Neck0.rx": 0.2, "SKEL_Neck0.ry": 0.15, **{f"IK_{leg}.fk": 1.0 for leg in LEGS},
           "SKEL_L_Thigh.rx": 0.3, "SKEL_R_Thigh.rx": 0.2, "SKEL_L_UpperArm.rx": -0.3, "SKEL_R_UpperArm.rx": -0.2,
           "SKEL_Tail0.rz": 0.3, "SKEL_Tail1.rz": 0.2, "FACIAL_C_Jaw.rx": 0.08,
           "FACIAL_L_EyelidUpper.ry": 0.3, "FACIAL_R_EyelidUpper.ry": -0.3}


# --- clips -----------------------------------------------------------------------

def idle(t, rig):
    P = PARAMS["Idle"]
    L = P["length"]
    return add(breathing(t, L, P["breath_cycles"], P["breath_amp"]),
               tail_wave(t, L, P["tail_cycles"], P["tail_amp"]),
               {"SKEL_Head.rz": P["look_amp"] * osc(t, L, 1),
                "FACIAL_L_Ear0.ry": P["ear_amp"] * bump(t, P["ear_at"], 0.25)},
               blink(t, P["blink_at"]))


def sniff(t, rig):
    P = PARAMS["Sniff"]
    L, up, side = P["length"], P["look_up"], P["look_side"]
    lifted = {"SKEL_Neck0.rx": up, "SKEL_Head.rx": 0.6 * up}
    look = keyposes(t, [(0.0, {}), (0.8, lifted), (1.6, {**lifted, "SKEL_Neck1.rz": side}),
                        (2.4, {**lifted, "SKEL_Neck1.rz": -side}), (3.2, lifted), (L, {})])
    return add(look,
               {"FACIAL_Nose.rx": P["nose_amp"] * osc(t, L, P["nose_cycles"]),
                "FACIAL_C_Jaw.rx": P["jaw_amp"] * max(0.0, osc(t, L, P["jaw_cycles"]))},
               breathing(t, L, P["breath_cycles"], 0.01),
               tail_wave(t, L, 2, 0.08))


def walk(t, rig):
    P = PARAMS["Walk"]
    g = P["gait"]
    L, n = g.length, g.cycles
    sway = P["sway"] * osc(t, L, n)
    body = {"SKEL_Pelvis.z": -P["bob"] * math.cos(2 * math.pi * 2 * n * t / L),
            "SKEL_Pelvis.rz": sway, "SKEL_Spine1.rz": -0.5 * sway, "SKEL_Spine3.rz": -0.5 * sway}
    return add(stabilize_head(body, 0.5), gait_legs(g, t), tail_wave(t, L, n, P["tail_amp"], lag=0.7))


def run(t, rig):
    P = PARAMS["Run"]
    g = P["gait"]
    L, n = g.length, g.cycles
    flex = osc(t, L, n)
    body = {"SKEL_Pelvis.z": P["bob"] * osc(t, L, 2 * n, 0.25),
            "SKEL_Pelvis.rx": P["pitch"] * osc(t, L, n, 0.25),
            **each(SPINE, "rx", 4 * P["flex"] * flex)}
    return add(stabilize_head(body, 0.7), gait_legs(g, t),
               {"SKEL_Tail0.rx": -0.1 * flex}, tail_wave(t, L, n, P["tail_amp"], ch="rx"))


def jump_start(t, rig):
    P = PARAMS["Jump_Start"]
    return keyposes(t, [(0.0, {}), (P["crouch_at"], CROUCH), (P["length"], PUSH)])


def jump_air(t, rig):
    P = PARAMS["Jump_Air"]
    L = P["length"]
    paddle = P["paddle"] * osc(t, L, 1)
    return add(TUCK, {"IK_LH.y": paddle, "IK_RH.y": paddle, "IK_LF.y": -paddle, "IK_RF.y": -paddle,
                      "SKEL_Tail2.rx": P["tail_amp"] * osc(t, L, 1)})


def jump_land(t, rig):
    P = PARAMS["Jump_Land"]
    return keyposes(t, [(0.0, TUCK), (P["absorb_at"], ABSORB), (P["length"], {})])


def turn(t, rig, sign):
    P = PARAMS["Turn"]
    L = P["length"]
    total = sign * P["angle"]
    body = total * smoothstep(t / L)
    px, py = rotz_offset(rig.pelvis_head, body)
    lead = math.sin(math.pi * min(t / L, 1.0)) ** 2  # 0 at both ends
    pose = {"SKEL_Pelvis.rz": body, "SKEL_Pelvis.x": px, "SKEL_Pelvis.y": py,
            **each(SPINE, "rz", sign * P["spine_lead"] * lead),
            "SKEL_Neck1.rz": sign * P["neck_lead"] * lead}
    for leg, start in P["starts"].items():
        s = min(max((t / L - start) / P["step_len"], 0.0), 1.0)
        dx, dy = rotz_offset(rig.targets[leg], total * smoothstep(s))
        pose.update({f"IK_{leg}.x": dx, f"IK_{leg}.y": dy,
                     f"IK_{leg}.z": P["step_height"] * math.sin(math.pi * s)})
    return pose


def rear_start(t, rig):
    return keyposes(t, [(0.0, {}), (PARAMS["Rear_Start"]["length"], REAR)])


def rear_loop(t, rig):
    P = PARAMS["Rear_Loop"]
    L = P["length"]
    return add(REAR, {"SKEL_Head.rz": P["look_amp"] * osc(t, L, 1),
                      "SKEL_Neck1.rx": P["nod_amp"] * osc(t, L, 2),
                      "FACIAL_Nose.rx": P["nose_amp"] * osc(t, L, P["nose_cycles"])},
               breathing(t, L, P["breath_cycles"], 0.01))


def rear_end(t, rig):
    return keyposes(t, [(0.0, REAR), (PARAMS["Rear_End"]["length"], {})])


def eat(t, rig):
    P = PARAMS["Eat"]
    L, n = P["length"], P["chew_cycles"]
    chew = 0.5 + 0.5 * osc(t, L, n)
    return add(SIT, {"FACIAL_C_Jaw.rx": P["jaw_amp"] * chew,
                     **both("SKEL_{}_Forearm.rx", P["paw_amp"] * osc(t, L, n)),
                     "SKEL_Head.rx": 0.03 * osc(t, L, n, 0.25)})


def death(t, rig):
    P = PARAMS["Death"]
    base = keyposes(t, [(0.0, {}), (P["stagger_at"], STAGGER), (P["down_at"], ON_SIDE), (P["length"], ON_SIDE)])
    twitch = bump(t, P["twitch_at"], P["twitch_len"])
    return add(base, {"SKEL_L_Thigh.rx": 0.25 * twitch, "SKEL_L_Calf.rx": -0.2 * twitch})


# --- registry ----------------------------------------------------------------------

@dataclass(frozen=True)
class Rig:
    pelvis_head: tuple  # rest head of SKEL_Pelvis, armature space
    targets: dict       # leg -> rest position of its IK target


@dataclass(frozen=True)
class Clip:
    name: str
    length: float
    loop: bool
    fn: Callable

    @property
    def frames(self):
        """Index of the last frame; the clip has frames + 1 samples."""
        return math.ceil(self.length * FPS - 1e-9)


def _clip(name, loop, fn, params=None):
    P = PARAMS[params or name]
    return Clip(name, P["gait"].length if "gait" in P else P["length"], loop, fn)


CLIPS = {c.name: c for c in [
    _clip("Idle", True, idle), _clip("Sniff", True, sniff), _clip("Walk", True, walk), _clip("Run", True, run),
    _clip("Jump_Start", False, jump_start), _clip("Jump_Air", True, jump_air), _clip("Jump_Land", False, jump_land),
    _clip("Turn_L", False, partial(turn, sign=1), "Turn"), _clip("Turn_R", False, partial(turn, sign=-1), "Turn"),
    _clip("Rear_Start", False, rear_start), _clip("Rear_Loop", True, rear_loop), _clip("Rear_End", False, rear_end),
    _clip("Eat", True, eat), _clip("Death", False, death),
]}
CLIP_SPEEDS = {"Walk": PARAMS["Walk"]["gait"].speed, "Run": PARAMS["Run"]["gait"].speed}


def times(clip):
    return [min(f / FPS, clip.length) for f in range(clip.frames + 1)]


def sample(name, t, rig):
    return CLIPS[name].fn(t, rig)
```

`models/rat/pipeline/write_expected.py`:

```python
"""Prints the expected GLB contents (joints, clips, speeds) as JSON for verify/check_glb.mjs."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from clips import CLIP_SPEEDS, CLIPS, FPS  # noqa: E402
from names import JOINTS  # noqa: E402

print(json.dumps({"joints": JOINTS,
                  "clips": {n: {"duration": c.frames / FPS, "loop": c.loop} for n, c in CLIPS.items()},
                  "clipSpeeds": CLIP_SPEEDS}, indent=2))
```

- [ ] **Step 4: Run them to verify they pass**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: all pass (≈ 60 tests). If `test_chained_clips_meet` fails, a layer in the second clip is non-zero at t = 0 — use `osc` (sine, 0 at t = 0) rather than `tail_wave` there.

- [ ] **Step 5: Commit**

```bash
git add models/rat/pipeline/clips.py models/rat/pipeline/write_expected.py models/rat/pipeline/tests/test_clips.py
git commit -m "Add procedural clip library for all 14 rat animations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Animation stage — control rig, bake, locked clips

**Files:**
- Modify: `models/rat/pipeline/common.py` (append `action_fcurves`)
- Create: `models/rat/pipeline/verify/check_anims.py`
- Create: `models/rat/pipeline/03_anims.py`
- Create: `models/rat/pipeline/verify/mark_locked.py`
- Modify: `models/rat/pipeline/build.sh`

**Interfaces:**
- Consumes: `clips.CLIPS, CLIP_SPEEDS, FPS, Rig, sample, times`; `rigpose.apply_pose, basis_from_pose`; `names.LEGS, POLE_PARENT, ROOT_BONE, JOINTS`.
- Produces (`common.py`): `action_fcurves(action)` generator over all F-curves (Blender 5 layered actions).
- Produces: `build/rat.blend` = skeleton + non-deform bones `IK_<leg>` (children of `SKEL_ROOT`) and `POLE_<leg>` (children of `POLE_PARENT[leg]`), an IK constraint named `"IK"` (chain 3, **muted**) on each `LEGS[leg]` bone, 14 actions named as the clips (fake user, keys on location + rotation_quaternion of the 46 deform bones only, frames `0..clip.frames`), one **muted** NLA track per clip with the same name, `scene["clipSpeeds"]`, scene fps 30. An action with custom property `locked=True` in an existing `build/rat.blend` is carried over unchanged.

- [ ] **Step 1: Append `action_fcurves` to `common.py`**

```python


def action_fcurves(action):
    """All F-curves of a (Blender 5 layered) action."""
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves
```

- [ ] **Step 2: Write the failing animation check**

`models/rat/pipeline/verify/check_anims.py`:

```python
"""Checks build/rat.blend against the Stage 3 spec. Option: -- --expect-locked <Clip>."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
from common import check  # noqa: E402
from names import JOINTS, LEGS  # noqa: E402


def channels(action):
    by_bone = defaultdict(dict)
    for fc in common.action_fcurves(action):
        bone = fc.data_path.split('"')[1]
        by_bone[bone][(fc.data_path.rsplit(".", 1)[1], fc.array_index)] = fc
    return by_bone


def transform_at(fcs, frame):
    loc = Vector([fcs[("location", i)].evaluate(frame) for i in range(3)])
    rot = Quaternion([fcs[("rotation_quaternion", i)].evaluate(frame) for i in range(4)])
    return loc, rot


def main():
    args = common.script_args()
    expect_locked = args[args.index("--expect-locked") + 1] if "--expect-locked" in args else None
    arm = common.arm_obj()
    ad = arm.animation_data
    check(ad is not None and ad.action is None, "armature must have no active action")
    tracks = {t.name: t for t in ad.nla_tracks}
    check(set(tracks) == set(clips.CLIPS), f"NLA tracks {sorted(tracks)} != clips")
    for name, clip in clips.CLIPS.items():
        action = bpy.data.actions.get(name)
        check(action is not None and action.use_fake_user, f"{name}: action missing or without fake user")
        check(tracks[name].mute and tracks[name].strips[0].action == action, f"{name}: NLA track wrong or unmuted")
        check(tuple(action.frame_range) == (0.0, float(clip.frames)),
              f"{name}: frame range {tuple(action.frame_range)}, expected (0, {clip.frames})")
        by_bone = channels(action)
        check(set(by_bone) == set(JOINTS), f"{name}: keyed bones differ from JOINTS: {sorted(set(by_bone) ^ set(JOINTS))}")
        if clip.loop:
            for bone, fcs in by_bone.items():
                l0, q0 = transform_at(fcs, 0)
                l1, q1 = transform_at(fcs, clip.frames)
                check((l0 - l1).length < 1e-4 and q0.rotation_difference(q1).angle < 1e-3,
                      f"{name}: {bone} first and last frames differ")
    for tip in LEGS.values():
        check(arm.pose.bones[tip].constraints["IK"].mute, f"{tip}: IK constraint must be saved muted")
    check(bpy.context.scene.render.fps == clips.FPS, "scene fps must be 30")
    check(bpy.context.scene["clipSpeeds"].to_dict() == clips.CLIP_SPEEDS, "scene clipSpeeds wrong")
    if expect_locked:
        check(bpy.data.actions[expect_locked].get("sentinel") == 123,
              f"locked clip {expect_locked} was regenerated (sentinel lost)")
    print("check_anims: OK")


common.run(main)
```

- [ ] **Step 3: Run it against the skeleton output to verify it fails**

Run: `"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --factory-startup -b models/rat/build/02_skeleton.blend --python-exit-code 1 --python models/rat/pipeline/verify/check_anims.py; echo "exit=$?"`
Expected: `PIPELINE ERROR: armature must have no active action` (no animation data yet), `exit=1`

- [ ] **Step 4: Write `03_anims.py`**

`models/rat/pipeline/03_anims.py`:

```python
"""Stage 3: control rig, sample every clip, bake to deform-bone actions, push to NLA."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
import rigpose  # noqa: E402
from common import PipelineError, check  # noqa: E402
from names import LEGS, POLE_PARENT, ROOT_BONE  # noqa: E402

REACH_TOL = 0.002  # m; max gap between a paw and its IK target
LOOP_TOL = 1e-4
POLE_OFFSET = {"H": Vector((0, -0.05, 0)), "F": Vector((0, 0.05, 0))}  # knees point forward, elbows back


def build_controls(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for leg, tip in LEGS.items():
        target = eb.new(f"IK_{leg}")
        target.head = eb[tip].tail.copy()
        target.tail = target.head + Vector((0, 0, 0.01))
        target.parent = eb[ROOT_BONE]
        target.use_deform = False
        pole = eb.new(f"POLE_{leg}")
        pole.head = eb[tip].parent.head + POLE_OFFSET[leg[1]]  # Calf/Forearm head = knee/elbow
        pole.tail = pole.head + Vector((0, 0, 0.01))
        pole.parent = eb[POLE_PARENT[leg]]
        pole.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for leg, tip in LEGS.items():
        con = arm.pose.bones[tip].constraints.new("IK")
        con.name = "IK"
        con.target, con.subtarget = arm, f"IK_{leg}"
        con.pole_target, con.pole_subtarget = arm, f"POLE_{leg}"
        con.chain_count = 3
        con.pole_angle = best_pole_angle(arm, tip, con)


def best_pole_angle(arm, tip, con):
    """The pole angle for which IK reproduces the rest pose (targets sit at the rest paws)."""
    chain = [arm.pose.bones[tip]]
    while len(chain) < 3:
        chain.append(chain[-1].parent)
    scores = {}
    for angle in (0.0, math.pi / 2, -math.pi / 2, math.pi):
        con.pole_angle = angle
        rigpose.apply_pose(arm, {})
        bpy.context.view_layer.update()
        scores[angle] = sum(abs(a - b) for pb in chain
                            for ra, rb in zip(pb.matrix, pb.bone.matrix_local) for a, b in zip(ra, rb))
    best = min(scores, key=scores.get)
    check(scores[best] < 1e-3, f"{tip}: no pole angle reproduces the rest pose (errors {scores})")
    print(f"03_anims: {tip} pole angle {math.degrees(best):.0f} deg")
    return best


def set_constraints(arm, mute):
    for tip in LEGS.values():
        arm.pose.bones[tip].constraints["IK"].mute = mute


def rig_info(arm):
    bones = arm.data.bones
    return clips.Rig(pelvis_head=tuple(bones["SKEL_Pelvis"].head_local),
                     targets={leg: tuple(bones[f"IK_{leg}"].head_local) for leg in LEGS})


def load_locked():
    """Hand-polished actions (custom property locked=True) from the previous build/rat.blend."""
    if not os.path.exists(common.RAT_BLEND):
        return {}
    with bpy.data.libraries.load(common.RAT_BLEND, link=False) as (src, dst):
        dst.actions = [n for n in src.actions if n in clips.CLIPS]
    locked = {}
    for action in dst.actions:
        if action is None:
            continue
        if action.get("locked"):
            action.use_fake_user = True
            locked[action.name] = action
        else:
            bpy.data.actions.remove(action)
    return locked


def sample_clip(arm, clip, rig):
    """Visual local transforms of every deform bone, one dict per frame; checks IK reach."""
    deform = [pb for pb in arm.pose.bones if pb.bone.use_deform]
    frames, worst = [], {}
    for f, t in enumerate(clips.times(clip)):
        pose = clips.sample(clip.name, t, rig)
        rigpose.apply_pose(arm, pose)
        bpy.context.view_layer.update()
        for leg, tip in LEGS.items():
            if pose.get(f"IK_{leg}.fk", 0.0) == 0.0:
                gap = (arm.pose.bones[tip].tail - arm.pose.bones[f"IK_{leg}"].head).length
                if gap > worst.get(leg, (0.0, 0))[0]:
                    worst[leg] = (gap, f)
        frames.append({pb.name: rigpose.basis_from_pose(pb) for pb in deform})
    bad = {leg: v for leg, v in worst.items() if v[0] > REACH_TOL}
    if bad:
        raise PipelineError(
            f"{clip.name}: IK target out of reach: "
            + ", ".join(f"{leg} by {g * 1000:.1f} mm at frame {f}" for leg, (g, f) in bad.items())
            + ". Shorten the stride (raise gait cycles or lower duty) or move the target in clips.PARAMS/poses.")
    if clip.loop:
        for name, m0 in frames[0].items():
            m1 = frames[-1][name]
            diff = max(abs(a - b) for ra, rb in zip(m0, m1) for a, b in zip(ra, rb))
            check(diff < LOOP_TOL, f"{clip.name}: {name} first/last frame differ by {diff:.2e}")
    return frames


def bake(arm, clip, rig):
    set_constraints(arm, mute=False)
    frames = sample_clip(arm, clip, rig)
    set_constraints(arm, mute=True)
    rigpose.reset(arm)
    action = bpy.data.actions.new(clip.name)
    action.use_fake_user = True
    arm.animation_data.action = action
    prev = {}
    for f, mats in enumerate(frames):
        for name, m in mats.items():
            pb = arm.pose.bones[name]
            loc, rot, _scale = m.decompose()
            if name in prev and prev[name].dot(rot) < 0:
                rot.negate()  # keep quaternions continuous so interpolation takes the short way
            prev[name] = rot
            pb.location, pb.rotation_quaternion = loc, rot
            pb.keyframe_insert("location", frame=f, group=name)
            pb.keyframe_insert("rotation_quaternion", frame=f, group=name)
    arm.animation_data.action = None
    return action


def push_nla(arm, actions):
    ad = arm.animation_data
    for track in list(ad.nla_tracks):
        ad.nla_tracks.remove(track)
    for name in clips.CLIPS:
        track = ad.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, actions[name])
        track.mute = True  # 04_export unmutes them; muted here so a single action can be previewed
    ad.action = None


def main():
    arm = common.arm_obj()
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = clips.FPS, 1.0
    arm.animation_data_create()
    arm.animation_data.action = None
    build_controls(arm)
    rig = rig_info(arm)
    actions = load_locked()
    for name, clip in clips.CLIPS.items():
        if name in actions:
            print(f"03_anims: keeping locked clip {name}")
            continue
        print(f"03_anims: baking {name} ({clip.frames + 1} frames)")
        actions[name] = bake(arm, clip, rig)
    push_nla(arm, actions)
    scene["clipSpeeds"] = dict(clips.CLIP_SPEEDS)
    set_constraints(arm, mute=True)
    rigpose.reset(arm)
    common.save_blend(common.RAT_BLEND)


common.run(main)
```

- [ ] **Step 5: Run stage 3 and the check**

Run:
```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --factory-startup -b models/rat/build/02_skeleton.blend --python-exit-code 1 --python models/rat/pipeline/03_anims.py && \
"$B" --factory-startup -b models/rat/build/rat.blend --python-exit-code 1 --python models/rat/pipeline/verify/check_anims.py
```
Expected: four `pole angle` lines, 14 `baking` lines, `check_anims: OK`.
If it fails with `IK target out of reach`, follow the message: for Walk/Run raise `cycles` in `clips.PARAMS` (Walk 3 → 4, Run 2 → 3; the clip length stays the same) or lower `duty`; for posed clips reduce the offending `IK_<leg>` offset. Rerun `python -m pytest models/rat/pipeline/tests -q` after any `clips.py` change. If `best_pole_angle` fails, the limb roll in `02_skeleton.py` puts the pole outside the knee plane — report the printed scores rather than widening the tolerance.

- [ ] **Step 6: Write the locked-clip round-trip helper**

`models/rat/pipeline/verify/mark_locked.py`:

```python
"""Marks the Idle clip in build/rat.blend locked with a sentinel (or unlocks it with -- --unlock)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import common  # noqa: E402


def main():
    action = bpy.data.actions["Idle"]
    if "--unlock" in common.script_args():
        action["locked"] = False
        action.pop("sentinel", None)
    else:
        action["locked"] = True
        action["sentinel"] = 123
    common.save_blend(common.RAT_BLEND)


common.run(main)
```

- [ ] **Step 7: Verify a locked clip survives a rebuild**

Run:
```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
run() { "$B" --factory-startup -b "$1" --python-exit-code 1 --python "models/rat/pipeline/$2" -- "${@:3}"; }
run models/rat/build/rat.blend verify/mark_locked.py && \
run models/rat/build/02_skeleton.blend 03_anims.py && \
run models/rat/build/rat.blend verify/check_anims.py --expect-locked Idle && \
run models/rat/build/rat.blend verify/mark_locked.py --unlock && \
run models/rat/build/02_skeleton.blend 03_anims.py && \
run models/rat/build/rat.blend verify/check_anims.py
```
Expected: `keeping locked clip Idle` on the second step, `check_anims: OK` twice, and the last `03_anims` run bakes all 14 clips again (Idle regenerated after unlocking).

- [ ] **Step 8: Add the animation stage to `build.sh`**

In `models/rat/pipeline/build.sh`, insert before `echo "build.sh: OK"`:

```bash
if stage anims; then
  bl "$RAT/build/02_skeleton.blend" 03_anims.py
  bl "$RAT/build/rat.blend" verify/check_anims.py
fi

```

- [ ] **Step 9: Run it through `build.sh`**

Run: `bash models/rat/pipeline/build.sh anims`
Expected: `check_anims: OK`, `build.sh: OK`

- [ ] **Step 10: Commit**

```bash
git add models/rat/pipeline
git commit -m "Add animation stage: IK control rig, baking, locked clips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Clip contact sheets

**Files:**
- Create: `models/rat/pipeline/imgutil.py`
- Test: `models/rat/pipeline/tests/test_imgutil.py`
- Modify: `models/rat/pipeline/common.py` (append pixel I/O)
- Create: `models/rat/pipeline/verify/render_clips.py`
- Modify: `models/rat/pipeline/build.sh`

**Interfaces:**
- Produces (`imgutil.py`): `tile(images: list[ndarray HxWxC], cols: int, pad=4, bg=1.0) -> ndarray` (row-major, top-down; raises `ValueError` on mixed sizes or empty list).
- Produces (`common.py`): `load_pixels(path) -> ndarray HxWx4` float32, row 0 = top; `save_pixels(arr, path, colorspace="sRGB")` (accepts HxWx3 or HxWx4, row 0 = top, writes 8-bit PNG).
- Produces: `build/previews/clips/<Clip>.png` — 2 rows (side, 3/4) × 6 evenly spaced frames.

- [ ] **Step 1: Write the failing test**

`models/rat/pipeline/tests/test_imgutil.py`:

```python
import numpy as np
import pytest

from imgutil import tile


def test_tile_places_images_row_major():
    imgs = [np.full((2, 3, 1), float(i)) for i in range(5)]
    out = tile(imgs, cols=3, pad=1, bg=-1.0)
    assert out.shape == (2 * 2 + 3 * 1, 3 * 3 + 4 * 1, 1)
    assert out[1, 1, 0] == 0.0          # first image, top-left
    assert out[1, 1 + 3 + 1, 0] == 1.0  # second image, same row
    assert out[1 + 2 + 1, 1, 0] == 3.0  # fourth image, second row
    assert out[-2, -2, 0] == -1.0       # empty sixth slot stays background


def test_tile_rejects_mixed_sizes():
    with pytest.raises(ValueError):
        tile([np.zeros((2, 2, 3)), np.zeros((3, 2, 3))], cols=2)
    with pytest.raises(ValueError):
        tile([], cols=2)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest models/rat/pipeline/tests/test_imgutil.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'imgutil'`

- [ ] **Step 3: Write `imgutil.py`**

`models/rat/pipeline/imgutil.py`:

```python
"""Image helpers for preview sheets (pure numpy, no bpy)."""
import math

import numpy as np


def tile(images, cols, pad=4, bg=1.0):
    """Grid of equally sized HxWxC images, row-major, row 0 at the top."""
    if not images:
        raise ValueError("no images to tile")
    h, w, c = images[0].shape
    if any(img.shape != (h, w, c) for img in images):
        raise ValueError("images must all have the same shape")
    rows = math.ceil(len(images) / cols)
    out = np.full((rows * h + (rows + 1) * pad, cols * w + (cols + 1) * pad, c), bg, dtype=images[0].dtype)
    for i, img in enumerate(images):
        r, k = divmod(i, cols)
        y, x = pad + r * (h + pad), pad + k * (w + pad)
        out[y:y + h, x:x + w] = img
    return out
```

- [ ] **Step 4: Run it to verify it passes**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: all pass

- [ ] **Step 5: Append pixel I/O to `common.py`**

```python


def load_pixels(path):
    """Image file -> float32 HxWx4 array, row 0 at the top."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return np.flipud(px.reshape(h, w, 4))


def save_pixels(arr, path, colorspace="sRGB"):
    """HxWx3 or HxWx4 array (row 0 at the top, values 0..1) -> 8-bit PNG."""
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :arr.shape[2]] = arr[..., :4]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.flipud(rgba).ravel())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
```

- [ ] **Step 6: Write the contact-sheet renderer**

`models/rat/pipeline/verify/render_clips.py`:

```python
"""Renders build/previews/clips/<Clip>.png contact sheets from build/rat.blend.

Usage: blender -b build/rat.blend --python render_clips.py [-- Clip ...]  (default: all clips)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
from imgutil import tile  # noqa: E402

FRAMES_PER_SHEET = 6


def main():
    names = common.script_args() or list(clips.CLIPS)
    arm = common.arm_obj()
    cam = common.setup_preview(res=(320, 240))
    scene = bpy.context.scene
    tmp = tempfile.mkdtemp(prefix="rat_frames_")
    for name in names:
        clip = clips.CLIPS[name]
        arm.animation_data.action = bpy.data.actions[name]
        shots = []
        for view in ("side", "q34"):
            for i in range(FRAMES_PER_SHEET):
                scene.frame_set(round(i * clip.frames / (FRAMES_PER_SHEET - 1)))
                path = os.path.join(tmp, f"{name}_{view}_{i}.png")
                common.render_view(cam, view, path)
                shots.append(common.load_pixels(path))
        common.save_pixels(tile(shots, FRAMES_PER_SHEET), os.path.join(common.PREVIEWS, "clips", f"{name}.png"))
        print(f"render_clips: {name}")
    arm.animation_data.action = None
    print("render_clips: OK")


common.run(main)
```

- [ ] **Step 7: Add the renderer to the anims stage in `build.sh`**

In `models/rat/pipeline/build.sh`, change the anims block to:

```bash
if stage anims; then
  bl "$RAT/build/02_skeleton.blend" 03_anims.py
  bl "$RAT/build/rat.blend" verify/check_anims.py
  bl "$RAT/build/rat.blend" verify/render_clips.py
fi
```

- [ ] **Step 8: Render the sheets**

Run: `bash models/rat/pipeline/build.sh anims`
Expected: 14 `render_clips: <Clip>` lines, `render_clips: OK`; 14 PNGs in `models/rat/build/previews/clips/`.

- [ ] **Step 9: Review every clip with the user (checkpoint)**

Read each sheet. Check per clip: feet on (not through) the ground in stance; legs never hyper-extended or inverted; Turn ends facing 90° left/right; Rear and Eat stand on the hind legs with forepaws near chest/mouth; Death ends lying on the right side above the ground; loops look like their first frame at the end. Tune values in `clips.PARAMS` and the pose constants (rotation signs are in the `clips.py` docstring), rerun pytest and `build.sh anims` (or `render_clips.py -- <Clip>` for one sheet). **Show the sheets to the user and wait for approval before Task 8.**

- [ ] **Step 10: Commit**

```bash
git add models/rat/pipeline
git commit -m "Add clip contact-sheet renders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Texture generation maths

**Files:**
- Create: `models/rat/pipeline/textures.py`
- Test: `models/rat/pipeline/tests/test_textures.py`

**Interfaces:**
- Produces: `luminance(rgb) -> HxW`; `box_blur(img, r) -> HxW` (edge-clamped); `normal_map(lum, strength=3.0, radius=8) -> HxWx3` in 0..1 (glTF/OpenGL convention, rows top-down); `roughness_map(lum, lo=0.6, hi=0.9) -> HxW` (brighter → smoother); `metal_rough(rough) -> HxWx3` (R=1, G=roughness, B=metallic 0); `downsample2(img) -> half-size` (2×2 average; raises `ValueError` on odd sizes).

- [ ] **Step 1: Write the failing tests**

`models/rat/pipeline/tests/test_textures.py`:

```python
import numpy as np
import pytest

from textures import box_blur, downsample2, luminance, metal_rough, normal_map, roughness_map


def test_luminance_weights():
    rgb = np.zeros((1, 3, 3))
    rgb[0, 0, 0] = rgb[0, 1, 1] = rgb[0, 2, 2] = 1.0
    assert luminance(rgb)[0] == pytest.approx([0.2126, 0.7152, 0.0722])


def test_box_blur_keeps_constants_and_mass():
    assert box_blur(np.full((9, 7), 0.4), 2) == pytest.approx(np.full((9, 7), 0.4))
    img = np.zeros((21, 21))
    img[10, 10] = 1.0
    out = box_blur(img, 3)
    assert out.shape == img.shape and out.sum() == pytest.approx(1.0)
    assert out[10, 10] == pytest.approx(1 / 49)


def test_flat_height_gives_straight_up_normals():
    assert normal_map(np.full((16, 16), 0.5)) == pytest.approx(np.broadcast_to([0.5, 0.5, 1.0], (16, 16, 3)))


def test_normals_tilt_away_from_a_ridge():
    lum = np.zeros((32, 32))
    lum[:, 16] = 1.0  # bright vertical ridge
    n = normal_map(lum, radius=4) * 2 - 1
    assert n[16, 15, 0] < 0 < n[16, 17, 0]  # left of the ridge faces -U, right faces +U
    assert np.linalg.norm(n, axis=-1) == pytest.approx(np.ones((32, 32)))


def test_roughness_range_and_direction():
    lum = np.linspace(0, 1, 100).reshape(10, 10)
    r = roughness_map(lum)
    assert r.min() >= 0.6 - 1e-9 and r.max() <= 0.9 + 1e-9
    assert r[0, 0] > r[-1, -1]
    mr = metal_rough(r)
    assert mr.shape == (10, 10, 3)
    assert (mr[..., 0] == 1).all() and (mr[..., 1] == r).all() and (mr[..., 2] == 0).all()


def test_downsample2():
    img = np.arange(16, dtype=float).reshape(4, 4)
    assert downsample2(img) == pytest.approx([[2.5, 4.5], [10.5, 12.5]])
    assert downsample2(np.zeros((4, 4, 3))).shape == (2, 2, 3)
    with pytest.raises(ValueError):
        downsample2(np.zeros((3, 4)))
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest models/rat/pipeline/tests/test_textures.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'textures'`

- [ ] **Step 3: Write `textures.py`**

`models/rat/pipeline/textures.py`:

```python
"""Normal and roughness maps generated from the base color (pure numpy, no bpy).

Images are arrays with row 0 at the top (V decreases down the rows), values 0..1.
"""
import numpy as np


def luminance(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def box_blur(img, r):
    """Separable (2r+1)^2 box blur with edge clamping."""
    if r <= 0:
        return img.copy()
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(img, pad, mode="edge"), axis=axis)
        hi, lo = [slice(None)] * 2, [slice(None)] * 2
        hi[axis], lo[axis] = slice(k, None), slice(0, -k)
        img = (c[tuple(hi)] - c[tuple(lo)]) / k
    return img


def normal_map(lum, strength=3.0, radius=8):
    """Tangent-space normal map (glTF: +X = +U, +Y = +V) from the high-passed luminance."""
    h = lum - box_blur(lum, radius)
    d_rows, d_u = np.gradient(h)
    d_v = -d_rows  # rows run top to bottom, V runs bottom to top
    n = np.stack([-d_u * strength, -d_v * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def roughness_map(lum, lo=0.6, hi=0.9):
    """Inverted, levelled luminance: brighter fur reads slightly smoother."""
    p2, p98 = np.percentile(lum, [2, 98])
    n = np.clip((lum - p2) / max(p98 - p2, 1e-8), 0.0, 1.0)
    return hi - n * (hi - lo)


def metal_rough(rough):
    """glTF metallicRoughness texture: roughness in G, metallic (0) in B."""
    return np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], axis=-1)


def downsample2(img):
    h, w = img.shape[:2]
    if h % 2 or w % 2:
        raise ValueError(f"cannot halve an image of size {w}x{h}")
    return img.reshape(h // 2, 2, w // 2, 2, *img.shape[2:]).mean(axis=(1, 3))
```

- [ ] **Step 4: Run them to verify they pass**

Run: `python -m pytest models/rat/pipeline/tests -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add models/rat/pipeline/textures.py models/rat/pipeline/tests/test_textures.py
git commit -m "Add normal and roughness map generation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Export, optimise and GLB checks

**Files:**
- Create: `models/rat/package.json` (+ generated `package-lock.json`)
- Create: `models/rat/pipeline/verify/check_glb.mjs`
- Create: `models/rat/pipeline/04_export.py`
- Create: `models/rat/pipeline/optimize.sh`
- Modify: `models/rat/pipeline/build.sh`
- Create: `models/rat/dist/rat.glb` (build output, committed)

**Interfaces:**
- Consumes: `build/rat.blend` (Task 6); `textures.*` (Task 8); `common.load_pixels, save_pixels, TEX_SIZE`; `write_expected.py` output.
- Produces: `build/rat_raw.glb` (exporter output), `dist/rat.glb` (optimised), `node pipeline/verify/check_glb.mjs <glb> <expected.json>` exits 0 only if the GLB meets the spec.

- [ ] **Step 1: Add Node dev dependencies**

`models/rat/package.json`:

```json
{
  "name": "rat-asset-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "viewer": "serve . -l 5173"
  },
  "devDependencies": {
    "@gltf-transform/cli": "4.5.1",
    "@gltf-transform/core": "4.5.1",
    "@gltf-transform/extensions": "4.5.1",
    "@gltf-transform/functions": "4.5.1",
    "gltf-validator": "2.0.0-dev.3.10",
    "serve": "14.2.4"
  }
}
```

Run: `cd models/rat && npm install`
Expected: installs without errors; `models/rat/node_modules/` (git-ignored) and `package-lock.json` created.

- [ ] **Step 2: Write the failing GLB check**

`models/rat/pipeline/verify/check_glb.mjs`:

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
cd models/rat && python pipeline/write_expected.py > build/expected.json && node pipeline/verify/check_glb.mjs dist/rat.glb build/expected.json; echo "exit=$?"
```
Expected: `ENOENT ... dist/rat.glb`, non-zero exit.

- [ ] **Step 4: Write `04_export.py`**

`models/rat/pipeline/04_export.py`:

```python
"""Stage 4: generate textures, strip the control rig, export build/rat_raw.glb (never saves the .blend)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import common  # noqa: E402
import textures  # noqa: E402
from common import check  # noqa: E402
from names import JOINTS  # noqa: E402

OUT = os.path.join(common.BUILD, "rat_raw.glb")
TEX_DIR = os.path.join(common.BUILD, "textures")


def shrink(img):
    while img.shape[0] > common.TEX_SIZE:
        img = textures.downsample2(img)
    return img


def make_textures():
    base = common.load_pixels(common.SRC_TEXTURE)[..., :3]
    lum = textures.luminance(base)
    maps = {"base": (base, "sRGB"),
            "normal": (textures.normal_map(lum), "Non-Color"),
            "metal_rough": (textures.metal_rough(textures.roughness_map(lum)), "Non-Color")}
    images = {}
    for name, (pixels, colorspace) in maps.items():
        path = os.path.join(TEX_DIR, f"{name}.png")
        common.save_pixels(shrink(pixels), path, colorspace)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = colorspace
        images[name] = img
    return images


def wire_material(mesh, images):
    mat = mesh.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    base_links = bsdf.inputs["Base Color"].links
    check(base_links and base_links[0].from_node.type == "TEX_IMAGE", "base color is not an image texture")
    base_links[0].from_node.image = images["base"]

    normal_tex = nt.nodes.new("ShaderNodeTexImage")
    normal_tex.image = images["normal"]
    normal_map = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    nt.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    rough_tex = nt.nodes.new("ShaderNodeTexImage")
    rough_tex.image = images["metal_rough"]
    split = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(rough_tex.outputs["Color"], split.inputs["Color"])
    nt.links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    mat.use_backface_culling = False


def strip_controls(arm):
    for pb in arm.pose.bones:
        for con in list(pb.constraints):
            pb.constraints.remove(con)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in [b for b in arm.data.edit_bones if not b.use_deform]:
        arm.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    check(sorted(b.name for b in arm.data.bones) == sorted(JOINTS), "bones left after stripping controls != JOINTS")
    for track in arm.animation_data.nla_tracks:
        track.mute = False
    arm.animation_data.action = None


def export():
    kwargs = dict(
        filepath=OUT, export_format="GLB", use_selection=False, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color="NONE",
        export_materials="EXPORT", export_image_format="AUTO",
        export_skins=True, export_def_bones=True, export_all_influences=False, export_influence_nb=4,
        export_morph=False, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
        export_extras=True, export_cameras=False, export_lights=False,
        export_draco_mesh_compression_enable=False)
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    unknown = sorted(set(kwargs) - valid)
    check(not unknown, f"glTF exporter has no options {unknown}; pick the renamed ones from {sorted(valid)}")
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    arm, mesh = common.arm_obj(), common.mesh_obj()
    wire_material(mesh, make_textures())
    strip_controls(arm)
    export()
    print(f"04_export: wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KiB)")


common.run(main)
```

- [ ] **Step 5: Write `optimize.sh`**

`models/rat/pipeline/optimize.sh`:

```bash
#!/usr/bin/env bash
# gltf-transform pass: build/rat_raw.glb -> dist/rat.glb (dedup, prune, resample, webp; no Draco/meshopt).
set -euo pipefail
RAT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAT"
mkdir -p dist
gt() { npx --no-install gltf-transform "$@"; }
gt dedup build/rat_raw.glb build/opt_1.glb
gt prune build/opt_1.glb build/opt_2.glb
gt resample build/opt_2.glb build/opt_3.glb
gt webp build/opt_3.glb dist/rat.glb
```

- [ ] **Step 6: Add the export stage to `build.sh`**

In `models/rat/pipeline/build.sh`, insert before `echo "build.sh: OK"`:

```bash
if stage export; then
  bl "$RAT/build/rat.blend" 04_export.py
  bash "$HERE/optimize.sh"
  "$PYTHON" "$HERE/write_expected.py" > "$RAT/build/expected.json"
  (cd "$RAT" && node pipeline/verify/check_glb.mjs dist/rat.glb build/expected.json)
fi

```

- [ ] **Step 7: Run the export stage and verify the check passes**

Run: `bash models/rat/pipeline/build.sh export`
Expected: `04_export: wrote .../rat_raw.glb (...)`, `check_glb: OK (~1000 KiB, 14 clips)`, `build.sh: OK`.
If the size check fails: confirm the textures are 1024² WebP first; then lower WebP quality via `gt webp ... --quality 80`. If the duration check fails for one-shots, check that `export_anim_slide_to_zero` kept frame 0 at t = 0. If clips are missing, list `[a.name for a in bpy.data.actions]` and the NLA track names in `rat.blend`; they must match.

- [ ] **Step 8: Run the whole build from scratch**

Run: `rm -rf models/rat/build && bash models/rat/pipeline/build.sh`
Expected: every stage passes; `build.sh: OK`; no `files in cgtrader/ changed` error.

- [ ] **Step 9: Commit**

```bash
git add models/rat/package.json models/rat/package-lock.json models/rat/pipeline models/rat/dist/rat.glb
git commit -m "Add GLB export, gltf-transform pass and GLB checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: three.js viewer and runtime verification

**Files:**
- Create: `models/rat/viewer/index.html`

**Interfaces:**
- Consumes: `dist/rat.glb` (14 animations, `gltf.scene.userData.clipSpeeds`).
- Produces: a page served by `npm run viewer` (in `models/rat`) at `http://localhost:5173/viewer/`; exposes `window.ratViewer = { play, actions, mixer, rat }` for scripted checks.

- [ ] **Step 1: Write the viewer**

`models/rat/viewer/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rat viewer</title>
<style>
  body { margin: 0; overflow: hidden; background: #1d2126; color: #e8e8e8; font: 13px system-ui, sans-serif; }
  #ui { position: absolute; top: 8px; left: 8px; max-width: 320px; padding: 8px 10px; border-radius: 6px; background: #000a; }
  #ui button { margin: 2px; padding: 3px 6px; }
  #ui button.active { background: #4a8; color: #fff; }
  #ui label { display: block; margin-top: 6px; }
  #status { margin-top: 8px; opacity: 0.8; }
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
</head>
<body>
<div id="ui">
  <div id="clips"></div>
  <label>Crossfade <input id="fade" type="range" min="0" max="1" step="0.05" value="0.25"> <span id="fadeVal"></span> s</label>
  <label>Playback speed <input id="speed" type="range" min="0.1" max="2" step="0.05" value="1"> <span id="speedVal"></span>×</label>
  <label><input id="skeleton" type="checkbox"> Skeleton</label>
  <label><input id="wireframe" type="checkbox"> Wireframe</label>
  <label><input id="move" type="checkbox"> Move at clip speed (check foot sliding)</label>
  <div id="status"></div>
</div>
<script type="module">
// Reference for game code:
//  - Clips are in place. Move the rat yourself at gltf.scene.userData.clipSpeeds[clip] m/s
//    along its local +Z (Walk 0.25, Run 0.8) so the feet don't slide.
//  - One-shots play once and hold their last frame (LoopOnce + clampWhenFinished).
//  - Turn_L/Turn_R end rotated ±90° relative to the root: when they finish, add the
//    rotation to the object (rotation.y += ±PI/2) and switch to Idle with no crossfade.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ONE_SHOTS = new Set(['Jump_Start', 'Jump_Land', 'Turn_L', 'Turn_R', 'Rear_Start', 'Rear_End', 'Death']);
const TURNS = { Turn_L: Math.PI / 2, Turn_R: -Math.PI / 2 };
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2126);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0.45, 0.3, 0.55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.05, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(0.6, 1.2, 0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 3 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a4048 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(4, 80, 0x66707a, 0x4a525a); // 5 cm cells
grid.position.y = 0.0005;
scene.add(grid);

const gltf = await new GLTFLoader().loadAsync('../dist/rat.glb');
const rat = gltf.scene;
rat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(rat);
const speeds = rat.userData.clipSpeeds ?? {};

const skeleton = new THREE.SkeletonHelper(rat);
skeleton.visible = false;
scene.add(skeleton);

const mixer = new THREE.AnimationMixer(rat);
const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
for (const [name, action] of Object.entries(actions)) {
  if (ONE_SHOTS.has(name)) { action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; }
}

let current = null;
function play(name, fade = Number($('fade').value)) {
  const next = actions[name];
  next.reset().setEffectiveWeight(1).play();
  if (current && current !== next) {
    if (fade > 0) current.crossFadeTo(next, fade, false); else current.stop();
  }
  current = next;
  for (const b of $('clips').children) b.classList.toggle('active', b.textContent === name);
  const speed = speeds[name];
  $('status').textContent = `${name}${speed ? ` · ${speed} m/s` : ''} · ${gltf.animations.length} clips · ${skeleton.bones.length} joints`;
}

mixer.addEventListener('finished', (e) => {
  const name = e.action.getClip().name;
  if (name in TURNS) {
    rat.rotation.y += TURNS[name];
    play('Idle', 0);
  }
});

for (const clip of gltf.animations) {
  const b = document.createElement('button');
  b.textContent = clip.name;
  b.onclick = () => play(clip.name);
  $('clips').appendChild(b);
}

const syncLabels = () => {
  $('fadeVal').textContent = Number($('fade').value).toFixed(2);
  $('speedVal').textContent = Number($('speed').value).toFixed(2);
  mixer.timeScale = Number($('speed').value);
};
$('fade').oninput = $('speed').oninput = syncLabels;
syncLabels();
$('skeleton').onchange = (e) => { skeleton.visible = e.target.checked; };
$('wireframe').onchange = (e) => rat.traverse((o) => { if (o.isMesh) o.material.wireframe = e.target.checked; });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const before = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  mixer.update(dt);
  const name = current?.getClip().name;
  if ($('move').checked && speeds[name]) {
    before.copy(rat.position);
    rat.translateZ(speeds[name] * dt * mixer.timeScale);
    if (rat.position.length() > 1.5) rat.position.set(0, 0, 0);
    const delta = rat.position.clone().sub(before);
    camera.position.add(delta);
    controls.target.add(delta);
  }
  controls.update();
  renderer.render(scene, camera);
});

play('Idle');
window.ratViewer = { play, actions, mixer, rat };
</script>
</body>
</html>
```

- [ ] **Step 2: Serve and open the viewer**

Run (background): `cd models/rat && npm run viewer`
Open `http://localhost:5173/viewer/` in a browser (use a browser tool if one is available in the session, otherwise ask the user to open it).
Expected: the rat stands on the grid playing `Idle`; 14 clip buttons; status reads `Idle · 14 clips · 46 joints`.

- [ ] **Step 3: Exercise every clip**

In the page, click each of the 14 buttons in turn (or run in the console: `for (const n of Object.keys(ratViewer.actions)) { ratViewer.play(n); await new Promise(r => setTimeout(r, 1500)); }`). Then: enable "Move at clip speed" with `Walk` and `Run` and watch the feet against the grid — planted feet must not slide; press `Turn_L` and `Turn_R` — the rat must end rotated 90° with no pop when it switches to Idle; toggle Skeleton and Wireframe.
Expected: no errors or warnings in the browser console; no visible pops at crossfades.

- [ ] **Step 4: Check texture resolution**

Zoom onto the head. If the fur looks visibly blurrier than `models/rat/rat.png`, set `TEX_SIZE = 2048` in `common.py`, run `bash models/rat/pipeline/build.sh export`, and confirm `check_glb` still passes the 1.5 MB budget; otherwise keep 1024.

- [ ] **Step 5: Screenshot**

Save a screenshot of the viewer playing `Walk` to `models/rat/build/previews/viewer.png` and show it to the user.

- [ ] **Step 6: Commit**

```bash
git add models/rat/viewer/index.html models/rat/pipeline/common.py models/rat/dist/rat.glb
git commit -m "Add three.js viewer for the rat GLB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(`common.py` and `rat.glb` are only staged if Step 4 changed them.)
