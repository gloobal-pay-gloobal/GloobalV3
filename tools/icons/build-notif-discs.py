"""Draw the eight notification discs. See build-notif-discs.mjs."""
import sys, os
from PIL import Image, ImageDraw
import numpy as np

ICONS = sys.argv[1]
OUT = os.path.join(ICONS, "notif")
SOURCE = os.path.join(ICONS, "icon-512.png")

# LOGO_FLIP_COLORS, frontend/constants/theme.js, in that order. The index a
# notification lands on is its position in THIS list, so the order is part of
# the contract and a colour may not be reordered or removed without the discs
# and the card disagreeing about what colour a given notification is.
COLORS = ["#7C3AED", "#DB2777", "#2563EB", "#059669", "#EA580C", "#0891B2", "#DC2626", "#9333EA"]

# The two ends of the brand gradient (T.gradButton, 135deg) that icon-512.png
# is drawn on — the ground the mark is lifted off below.
START = (79, 70, 229)
END = (124, 58, 237)

# Android draws the large icon at roughly 64dp and crops it to a circle of its
# own; drawing at 192 means it is never upscaled, and drawing our own circle
# means it still reads as a disc on the platforms that do not crop.
SIZE = 192
# Canvas fraction the mark's width takes. Lower than the app icon's 0.62: this
# disc has no square corners to fill, and a mark that touches the rim of a
# circle reads as cramped where the same mark in a square reads as generous.
MARK = 0.52
# 4x, then down. A circle drawn straight at 192 has a stepped edge, and the
# edge is the whole shape here.
SS = 4


def ground(size):
    y, x = np.mgrid[0:size, 0:size]
    t = ((x + y) / (2 * (size - 1))).astype(float)
    out = np.zeros((size, size, 3))
    for c in range(3):
        out[:, :, c] = START[c] + (END[c] - START[c]) * t
    return out


def extract_mark():
    """The white mark, as an alpha layer, lifted off its known ground.

    The same lift build-icons.py does, and for the same reason: the mark the
    app ships is the only mark, and tracing a second copy of it by hand is how
    two logos start to drift apart.
    """
    src = np.array(Image.open(SOURCE).convert("RGB")).astype(float)
    g = ground(src.shape[0])
    alpha = np.clip(((src - g) / (255.0 - g)).mean(axis=2), 0, 1)
    ys, xs = np.nonzero(alpha > 0.5)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return Image.fromarray((alpha * 255).astype(np.uint8), mode="L").crop(box)


def build(mark, index, hex_colour):
    big = SIZE * SS
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, big - 1, big - 1), fill=hex_colour)
    width = max(1, round(big * MARK))
    height = max(1, round(width * mark.height / mark.width))
    scaled = mark.resize((width, height), Image.LANCZOS)
    white = Image.new("RGBA", scaled.size, (255, 255, 255, 255))
    white.putalpha(scaled)
    canvas.alpha_composite(white, ((big - width) // 2, (big - height) // 2))
    disc = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    name = f"disc-{index}.png"
    disc.save(os.path.join(OUT, name), "PNG", optimize=True)
    print(f"  {name}: {hex_colour} at {SIZE}px, mark {round(width / SS)}px")


def main():
    os.makedirs(OUT, exist_ok=True)
    mark = extract_mark()
    print(f"mark lifted from icon-512.png at {mark.width}x{mark.height}")
    for index, colour in enumerate(COLORS):
        build(mark, index, colour)


main()
