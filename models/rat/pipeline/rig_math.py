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
