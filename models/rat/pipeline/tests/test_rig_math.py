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
