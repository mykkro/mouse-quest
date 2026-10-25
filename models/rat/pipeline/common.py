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
