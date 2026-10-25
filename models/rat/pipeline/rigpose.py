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
