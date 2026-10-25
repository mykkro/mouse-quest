import numpy as np
import pytest

from imgutil import tile


def test_tile_places_images_row_major():
    imgs = [np.full((2, 3, 1), float(i)) for i in range(5)]
    out = tile(imgs, cols=3, pad=1, bg=-1.0)
    assert out.shape == (2 * 2 + 3 * 1, 3 * 3 + 4 * 1, 1)
    assert out[1, 1, 0] == 0.0          # first image, top-left
    assert out[1, 1 + 3 + 1, 0] == 1.0  # second image, same row
    assert out[1 + 2 + 1, 1, 0] == 3.0  # fourth image, second row
    assert out[-2, -2, 0] == -1.0       # empty sixth slot stays background


def test_tile_rejects_mixed_sizes():
    with pytest.raises(ValueError):
        tile([np.zeros((2, 2, 3)), np.zeros((3, 2, 3))], cols=2)
    with pytest.raises(ValueError):
        tile([], cols=2)
