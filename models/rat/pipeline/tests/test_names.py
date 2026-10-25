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
