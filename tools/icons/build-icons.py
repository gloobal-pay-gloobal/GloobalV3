"""Redraw the Gloobal app icons with a larger mark. See build-icons.mjs."""
import sys, os
from PIL import Image
import numpy as np

ICONS = sys.argv[1]
SOURCE = os.path.join(ICONS, "icon-512.png")
# The mark, lifted once and kept — see extract_mark.
MASTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mark-alpha.png")

# The two ends of the brand gradient (T.gradButton, 135deg), read back from
# the corners of the icon this project already ships.
START = (79, 70, 229)
END = (124, 58, 237)

# Canvas fraction the MARK's width should take. "any" icons are shown as
# drawn; maskable ones are cropped to the platform's shape, so the mark stays
# inside the middle 80% with room to spare.
#
# Up again, from 0.62 / 0.60 / 0.70 / 0.74 / 0.50. An app icon is read at
# about 12mm on a home screen, next to other icons whose marks fill them —
# ours was being drawn as a logo on a card, with the margin a logo on a card
# needs, and at that size the margin is most of what you see.
#
# The maskable pair is the one with a real ceiling, and it is arithmetic
# rather than taste. The platform crops to its own shape, guaranteeing only
# the middle 80%; the mark is 317x263, so its height is 0.83 of its width,
# and the corner of its bounding box sits at sqrt(w^2 + (0.83w)^2) = 1.30w
# from the centre. At 0.56 that is 0.727 — inside 0.8 with room. At 0.62 it
# would be 0.805, which is outside, and the crop would clip the mark on
# exactly the devices that crop hardest.
TARGETS = [
    ("icon-512.png", 512, 0.72),
    ("icon-192.png", 192, 0.72),
    ("apple-touch-icon.png", 180, 0.70),
    ("favicon-32.png", 32, 0.80),
    ("favicon-16.png", 16, 0.84),
    ("icon-maskable-512.png", 512, 0.56),
    ("icon-maskable-192.png", 192, 0.56),
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
    """The white mark, as an alpha layer.

    From mark-alpha.png, which is the mark lifted out of the icon ONCE and
    committed beside this script. It used to be lifted out of icon-512.png
    on every run — the same file this script then overwrites, which makes
    each run's output the next run's input. That is fine while the sizes
    never change and quietly lossy the moment they do: raising the fraction
    upscales the mark, the next run extracts the upscaled copy, and every
    later run resamples a resample. The icon has now been resized twice on
    request, so it will be resized again.

    With a master there is exactly one resample between the artwork and any
    icon, however many times the sizes move. If the master is ever lost the
    old path still works, and writes one, so this is not a file anybody has
    to know about to run the script — only to keep the result sharp.
    """
    if os.path.exists(MASTER):
        return Image.open(MASTER).convert("L")
    src = np.array(Image.open(SOURCE).convert("RGB")).astype(float)
    g = ground(src.shape[0])
    # Coverage: 0 where the pixel is the ground, 1 where it is white.
    alpha = np.clip(((src - g) / (255.0 - g)).mean(axis=2), 0, 1)
    ys, xs = np.nonzero(alpha > 0.5)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    layer = Image.fromarray((alpha * 255).astype(np.uint8), mode="L").crop(box)
    layer.save(MASTER, "PNG", optimize=True)
    print(f"mark-alpha.png written from icon-512.png at {layer.width}x{layer.height}")
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
    print(f"mark from {os.path.basename(MASTER)} at {mark.width}x{mark.height}")
    for name, size, fraction in TARGETS:
        build(mark, name, size, fraction)
    # favicon.ico carries the three sizes a browser may ask for.
    ico = Image.open(os.path.join(ICONS, "favicon-32.png")).convert("RGBA")
    ico.save(os.path.join(ICONS, "..", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico: 16, 32, 48")


main()
