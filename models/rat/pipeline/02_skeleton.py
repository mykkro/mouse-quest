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
