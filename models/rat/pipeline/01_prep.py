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
# The source mesh is split along ~50% of its vertices, so this only catches a runaway threshold.
MAX_MERGE_FRACTION = 0.6
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
    keep = me.attributes.new("_keep_normal", "FLOAT_VECTOR", "CORNER")
    keep.data.foreach_set("vector", [c for n in me.corner_normals for c in n.vector])
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
    # Keep the shading exactly as it was: restore the per-corner normals through the weld.
    keep = me.attributes["_keep_normal"]
    normals = [tuple(d.vector) for d in keep.data]
    me.attributes.remove(keep)
    me.normals_split_custom_set(normals)
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
    # The source stores every triangle twice with opposite winding (a baked back layer). The weld
    # collapses each pair into one outward layer (6800 -> 3400 triangles); the material stays double-sided.
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
