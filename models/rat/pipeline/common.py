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
