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
