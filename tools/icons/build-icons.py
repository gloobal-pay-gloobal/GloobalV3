"""Redraw the Gloobal app icons with a larger mark. See build-icons.mjs."""
import sys, os
from PIL import Image
import numpy as np

ICONS = sys.argv[1]
SOURCE = os.path.join(ICONS, "icon-512.png")

# The two ends of the brand gradient (T.gradButton, 135deg), read back from
# the corners of the icon this project already ships.
START = (79, 70, 229)
END = (124, 58, 237)

# Canvas fraction the MARK's width should take. "any" icons are shown as
# drawn; maskable ones are cropped to the platform's shape, so the mark stays
# inside the middle 80% with room to spare.
TARGETS = [
    ("icon-512.png", 512, 0.62),
    ("icon-192.png", 192, 0.62),
    ("apple-touch-icon.png", 180, 0.60),
    ("favicon-32.png", 32, 0.70),
    ("favicon-16.png", 16, 0.74),
    ("icon-maskable-512.png", 512, 0.50),
    ("icon-maskable-192.png", 192, 0.50),
]


def ground(size):
    """The 135-degree gradient, as a float array."""
    y, x = np.mgrid[0:size, 0:size]
    t = ((x + y) / (2 * (size - 1))).astype(float)
    out = np.zeros((size, size, 3))
    for c in range(3):
        out[:, :, c] = START[c] + (END[c] - START[c]) * t
    return out


def extract_mark():
    """The white mark, as an alpha layer, lifted off its known ground."""
    src = np.array(Image.open(SOURCE).convert("RGB")).astype(float)
    g = ground(src.shape[0])
    # Coverage: 0 where the pixel is the ground, 1 where it is white.
    alpha = np.clip(((src - g) / (255.0 - g)).mean(axis=2), 0, 1)
    ys, xs = np.nonzero(alpha > 0.5)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    layer = Image.fromarray((alpha * 255).astype(np.uint8), mode="L").crop(box)
    return layer


def build(mark, name, size, fraction):
    canvas = Image.fromarray(ground(size).round().astype(np.uint8), mode="RGB").convert("RGBA")
    width = max(1, round(size * fraction))
    height = max(1, round(width * mark.height / mark.width))
    scaled = mark.resize((width, height), Image.LANCZOS)
    white = Image.new("RGBA", scaled.size, (255, 255, 255, 255))
    white.putalpha(scaled)
    canvas.alpha_composite(white, ((size - width) // 2, (size - height) // 2))
    canvas.convert("RGB").save(os.path.join(ICONS, name), "PNG", optimize=True)
    print(f"  {name}: mark {width}px of {size}px ({round(fraction * 100)}%)")


def main():
    mark = extract_mark()
    print(f"mark lifted from icon-512.png at {mark.width}x{mark.height}")
    for name, size, fraction in TARGETS:
        build(mark, name, size, fraction)
    # favicon.ico carries the three sizes a browser may ask for.
    ico = Image.open(os.path.join(ICONS, "favicon-32.png")).convert("RGBA")
    ico.save(os.path.join(ICONS, "..", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico: 16, 32, 48")


main()
