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
