import numpy as np
import pytest

from textures import box_blur, downsample2, luminance, metal_rough, normal_map, roughness_map


def test_luminance_weights():
    rgb = np.zeros((1, 3, 3))
    rgb[0, 0, 0] = rgb[0, 1, 1] = rgb[0, 2, 2] = 1.0
    assert luminance(rgb)[0] == pytest.approx([0.2126, 0.7152, 0.0722])


def test_box_blur_keeps_constants_and_mass():
    assert box_blur(np.full((9, 7), 0.4), 2) == pytest.approx(np.full((9, 7), 0.4))
    img = np.zeros((21, 21))
    img[10, 10] = 1.0
    out = box_blur(img, 3)
    assert out.shape == img.shape and out.sum() == pytest.approx(1.0)
    assert out[10, 10] == pytest.approx(1 / 49)


def test_flat_height_gives_straight_up_normals():
    assert normal_map(np.full((16, 16), 0.5)) == pytest.approx(np.broadcast_to([0.5, 0.5, 1.0], (16, 16, 3)))


def test_normals_tilt_away_from_a_ridge():
    lum = np.zeros((32, 32))
    lum[:, 16] = 1.0  # bright vertical ridge
    n = normal_map(lum, radius=4) * 2 - 1
    assert n[16, 15, 0] < 0 < n[16, 17, 0]  # left of the ridge faces -U, right faces +U
    assert np.linalg.norm(n, axis=-1) == pytest.approx(np.ones((32, 32)))


def test_roughness_range_and_direction():
    lum = np.linspace(0, 1, 100).reshape(10, 10)
    r = roughness_map(lum)
    assert r.min() >= 0.6 - 1e-9 and r.max() <= 0.9 + 1e-9
    assert r[0, 0] > r[-1, -1]
    mr = metal_rough(r)
    assert mr.shape == (10, 10, 3)
    assert (mr[..., 0] == 1).all() and (mr[..., 1] == r).all() and (mr[..., 2] == 0).all()


def test_downsample2():
    img = np.arange(16, dtype=float).reshape(4, 4)
    assert downsample2(img) == pytest.approx(np.array([[2.5, 4.5], [10.5, 12.5]]))
    assert downsample2(np.zeros((4, 4, 3))).shape == (2, 2, 3)
    with pytest.raises(ValueError):
        downsample2(np.zeros((3, 4)))
