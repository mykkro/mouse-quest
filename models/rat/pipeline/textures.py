"""Normal and roughness maps generated from the base color (pure numpy, no bpy).

Images are arrays with row 0 at the top (V decreases down the rows), values 0..1.
"""
import numpy as np


def luminance(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def box_blur(img, r):
    """Separable (2r+1)^2 box blur with edge clamping."""
    if r <= 0:
        return img.copy()
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(img, pad, mode="edge"), axis=axis)
        hi, lo = [slice(None)] * 2, [slice(None)] * 2
        hi[axis], lo[axis] = slice(k, None), slice(0, -k)
        img = (c[tuple(hi)] - c[tuple(lo)]) / k
    return img


def normal_map(lum, strength=3.0, radius=8):
    """Tangent-space normal map (glTF: +X = +U, +Y = +V) from the high-passed luminance."""
    h = lum - box_blur(lum, radius)
    d_rows, d_u = np.gradient(h)
    d_v = -d_rows  # rows run top to bottom, V runs bottom to top
    n = np.stack([-d_u * strength, -d_v * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def roughness_map(lum, lo=0.6, hi=0.9):
    """Inverted, levelled luminance: brighter fur reads slightly smoother."""
    p2, p98 = np.percentile(lum, [2, 98])
    n = np.clip((lum - p2) / max(p98 - p2, 1e-8), 0.0, 1.0)
    return hi - n * (hi - lo)


def metal_rough(rough):
    """glTF metallicRoughness texture: roughness in G, metallic (0) in B."""
    return np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], axis=-1)


def downsample2(img):
    h, w = img.shape[:2]
    if h % 2 or w % 2:
        raise ValueError(f"cannot halve an image of size {w}x{h}")
    return img.reshape(h // 2, 2, w // 2, 2, *img.shape[2:]).mean(axis=(1, 3))
