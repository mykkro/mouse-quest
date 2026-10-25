"""Image helpers for preview sheets (pure numpy, no bpy)."""
import math

import numpy as np


def tile(images, cols, pad=4, bg=1.0):
    """Grid of equally sized HxWxC images, row-major, row 0 at the top."""
    if not images:
        raise ValueError("no images to tile")
    h, w, c = images[0].shape
    if any(img.shape != (h, w, c) for img in images):
        raise ValueError("images must all have the same shape")
    rows = math.ceil(len(images) / cols)
    out = np.full((rows * h + (rows + 1) * pad, cols * w + (cols + 1) * pad, c), bg, dtype=images[0].dtype)
    for i, img in enumerate(images):
        r, k = divmod(i, cols)
        y, x = pad + r * (h + pad), pad + k * (w + pad)
        out[y:y + h, x:x + w] = img
    return out
