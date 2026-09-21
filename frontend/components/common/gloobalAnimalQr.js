// src/components/common/gloobalAnimalQr.js
//
// ── Animal QR: a picture inside the code, every module still readable ─────
//
// A scanner does not look at a whole module. It samples each module near its
// CENTRE and decides dark or light. So the rest of each module is free to
// paint a picture, as long as every centre still says what the data says.
// That is the whole trick, and these are its rules:
//
//   - Finder, timing and alignment patterns stay solid black squares. They
//     are how a phone finds the code at all; nothing is drawn over them.
//   - Outside the animal, a dark module is a black dot (90% of the module).
//   - Inside the animal, every module is filled with the animal's colour, and
//     a LIGHT module gets a white dot (70%) in its centre. The colour is dark
//     enough to read as "dark" to a scanner (luminance <= 80, the same floor
//     gloobalQrDiscInk uses), so a dark module stays dark and a light one
//     stays light at the one point that counts.
//
// Measured before this was built, with three different users' pay links at
// six sizes and four blur levels: every animal reads on jsQR within a scan or
// two of a plain QR with no picture, and 36/36 on WeChat's decoder and zbar.
// tests/gloobal-animal-qr.test.mjs decodes every animal again on every run.
//
// The code is always version 6 with error correction H, so every pay link
// lands in the same 41-module grid the pictures were fitted to. A payload that
// does not fit returns null, and the card falls back to the plain QR.
//
// The pictures are ours — drawn from simple shapes and reduced to modules —
// each 41x41 cover mask stored as rows of '#' (animal) and '.' (not), placed
// at (x, y) in the grid.

var GLOOBAL_ANIMAL_QR_VERSION = 6;
var GLOOBAL_ANIMAL_QR_SIZE = 41;
var GLOOBAL_ANIMAL_QR_QUIET = 4;
var GLOOBAL_ANIMAL_QR_OUT_DOT = 0.9;
var GLOOBAL_ANIMAL_QR_IN_DOT = 0.7;
var GLOOBAL_ANIMAL_QR_MAX_LUM = 80;
// Stored on this device only: which picture this person likes. Not part of
// the account and not part of the code — every choice carries the same link.
var GLOOBAL_ANIMAL_QR_STORAGE_KEY = "gloobal.qrStyle";
var GLOOBAL_ANIMAL_QR_DEFAULT = "elephant";

var GLOOBAL_QR_ANIMALS = [
  {
    key: "elephant",
    label: "Elephant",
    color: "#5B21B6",
    x: 3,
    y: 7,
    rows: [
      "..........................###......",
      "........................#######....",
      ".......................#########...",
      "..............##......###########..",
      "..........##########..###########..",
      "........#####################.###..",
      "......###########################..",
      ".....############################..",
      "...##############################..",
      "..###############################..",
      "..###############################..",
      ".################################..",
      ".#.##############################..",
      ".#.#######################...####..",
      "#...######################...####..",
      "#...#####################....#####.",
      ".....######################...####.",
      "....#######################...####.",
      "....#######################....###.",
      "....#####.#######.#########....###.",
      "....#####.####....#########....###.",
      "....#####.####....#########.....###",
      "....#####.####....#########.....###",
      "....#####.####....#########......##",
      "....#####.####....#########........",
      "....#####.####....#########........"
    ]
  },
  {
    key: "whale",
    label: "Whale",
    color: "#1D4ED8",
    x: 3,
    y: 10,
    rows: [
      "..............................##...",
      "............................##..#..",
      "............................##..##.",
      "...................................",
      "...................................",
      ".............##############........",
      ".##.......#####################....",
      ".###....########################...",
      ".####..###########################.",
      "..################################.",
      "..############################.####",
      "..############################.####",
      "..#################################",
      ".####.############################.",
      ".###...##########################..",
      ".##......#######################...",
      "...........##################......",
      "................#########..........",
      "...................###.............",
      "....................##.............",
      ".....................#............."
    ]
  },
  {
    key: "cat",
    label: "Cat",
    color: "#BE185D",
    x: 10,
    y: 6,
    rows: [
      "...#......#.........",
      "...##.....##........",
      "...##....###........",
      "...#########........",
      "...#########........",
      "...#########........",
      "..##########........",
      "..##.###..##........",
      "..##########........",
      "...#########........",
      "...########.........",
      "....######..........",
      "...########.........",
      "..##########........",
      "..###########.......",
      ".############.......",
      ".#############...##.",
      "##############...##.",
      "##############...##.",
      "##############...###",
      "##############....##",
      "##############....##",
      "##############...###",
      ".############....##.",
      ".############....##.",
      "..##########..####..",
      "...########..#####..",
      "....######...##....."
    ]
  },
  {
    key: "rabbit",
    label: "Rabbit",
    color: "#7C3AED",
    x: 11,
    y: 6,
    rows: [
      "............#......",
      "............##.##..",
      "...........###.##..",
      "...........######..",
      "...........######..",
      "...........######..",
      "...........######..",
      "...........###.##..",
      "............#####..",
      "...........#######.",
      "..........#########",
      "..........#########",
      "..........#########",
      "..........#########",
      "......############.",
      "....#############..",
      "...#############...",
      "...#############...",
      "..###############..",
      ".################..",
      "#################..",
      "#################..",
      "#################..",
      "..##############...",
      "...#############...",
      "....##############.",
      ".....##############",
      "........###...####."
    ]
  },
  {
    key: "owl",
    label: "Owl",
    color: "#78350F",
    x: 11,
    y: 6,
    rows: [
      "...................",
      "..##...........##..",
      "..##...........##..",
      "..###.........###..",
      "..####..###..####..",
      "..###############..",
      "..################.",
      "...#############...",
      "..###############..",
      "..##....###....##..",
      ".##......#......##.",
      ".##......#......##.",
      "###......#......###",
      "####....###.....###",
      "####...#####...####",
      "#########.#########",
      "#########.#########",
      "###################",
      "###################",
      "###################",
      ".##################",
      ".#################.",
      "..################.",
      "..###############..",
      "...#############...",
      "....###########....",
      ".....#########.....",
      "......#######......"
    ]
  },
  {
    key: "penguin",
    label: "Penguin",
    color: "#3730A3",
    x: 10,
    y: 6,
    rows: [
      ".........#####......",
      "........#######.....",
      ".......#########....",
      "......###########...",
      ".....####.########..",
      ".....#############..",
      "....###############.",
      "....###############.",
      "...#################",
      "...######.....######",
      "...#####.......#####",
      "...#####.......#####",
      "..#####........#####",
      "..#####.........####",
      ".######.........####",
      ".######.........####",
      ".######.........####",
      ".######.........####",
      ".#..###.........###.",
      "....###.........###.",
      "....###.........###.",
      ".....###.......###..",
      ".....###.......###..",
      "......###.....###...",
      ".......###...###....",
      "......###########...",
      ".....######.######..",
      "......####...####..."
    ]
  },
  {
    key: "fish",
    label: "Fish",
    color: "#0E7490",
    x: 3,
    y: 7,
    rows: [
      "......................##...........",
      ".....................####..........",
      "....................#####..........",
      "...................#######.........",
      "..................########.........",
      "#..............#############.......",
      "##..........##################.....",
      ".##........####################....",
      ".###.....########################..",
      ".#####...########################..",
      "..#####.####################..####.",
      "..##########################...####",
      "..##########################..#####",
      "..#################################",
      "..#################################",
      "..#################################",
      "..####..##########################.",
      ".####....########################..",
      ".###.....#######################...",
      ".##........####################....",
      "##...........#################.....",
      "#..............############........",
      "...................######..........",
      ".....................####..........",
      "......................##...........",
      ".......................#..........."
    ]
  },
  {
    key: "bird",
    label: "Bird",
    color: "#C2410C",
    x: 3,
    y: 10,
    rows: [
      "..........................###......",
      "........................######.....",
      ".......................########....",
      ".......................####.####...",
      "................##....############.",
      "............######################.",
      "..........#####################....",
      "##.......#####################.....",
      "#####...#####################......",
      "###########################........",
      "###########################........",
      ".##########################........",
      ".##########################........",
      ".#########################.........",
      ".........################..........",
      "...........#############...........",
      "..............#######..............",
      "................##..#..............",
      "................#...#..............",
      "................#...#..............",
      "................#..##.............."
    ]
  },
  {
    key: "turtle",
    label: "Turtle",
    color: "#15803D",
    x: 3,
    y: 12,
    rows: [
      ".............#######...............",
      "..........############.............",
      "........################...........",
      ".......##################..........",
      "......####################.........",
      ".....######################........",
      ".....######################..####..",
      ".....#############################.",
      "....############################.##",
      "....###############################",
      "..################################.",
      ".############################.###..",
      "...##########################......",
      "......#####..........#####.........",
      "......#####..........#####.........",
      "......#####..........#####.........",
      ".......##..............##.........."
    ]
  },
  {
    key: "giraffe",
    label: "Giraffe",
    color: "#B45309",
    x: 11,
    y: 6,
    rows: [
      "............#.....",
      "............#.....",
      "............#####.",
      "............######",
      "............######",
      "............#####.",
      "............###...",
      "............##....",
      "............##....",
      "...........###....",
      "...........###....",
      "...........###....",
      "...........###....",
      ".....#####.###....",
      "...###########....",
      "..############....",
      ".#############....",
      ".#############....",
      "..###########.....",
      "#.###########.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "..##.##..##.#.....",
      "...#.##..##.#....."
    ]
  }
];

function gloobalAnimalQrFind(key) {
  return GLOOBAL_QR_ANIMALS.find((a) => a.key === key) || null;
}

// The animal's colour, darkened until a scanner reads it as dark. Scaled
// rather than mixed with black, so the hue survives.
function gloobalAnimalQrInk(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return "#3B0764";
  let r = parseInt(raw.slice(0, 2), 16);
  let g = parseInt(raw.slice(2, 4), 16);
  let b = parseInt(raw.slice(4, 6), 16);
  const lum = () => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let guard = 0;
  while (lum() > GLOOBAL_ANIMAL_QR_MAX_LUM && guard < 40) {
    r = Math.round(r * 0.92);
    g = Math.round(g * 0.92);
    b = Math.round(b * 0.92);
    guard += 1;
  }
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

// Everything needed to draw one animal code, in module units (quiet zone
// included), so the SVG and the PNG are drawn from the same list and cannot
// disagree about what the code is.
//
//   squares:   solid black function-pattern modules
//   dots:      black data dots outside the animal
//   fill:      modules painted in the animal's colour
//   holes:     white dots on light modules inside the animal
//
// Returns null when the payload does not fit version 6 at H, or the animal is
// unknown — the caller then draws the plain QR instead.
function gloobalAnimalQrLayout(text, animalKey) {
  const animal = gloobalAnimalQrFind(animalKey);
  if (!animal || typeof uqrEncode !== "function") return null;
  let qr;
  try {
    qr = uqrEncode(text, {
      ecc: "H",
      border: 0,
      minVersion: GLOOBAL_ANIMAL_QR_VERSION,
      maxVersion: GLOOBAL_ANIMAL_QR_VERSION
    });
  } catch {
    return null;
  }
  if (!qr || qr.size !== GLOOBAL_ANIMAL_QR_SIZE || !qr.types) return null;
  const q = GLOOBAL_ANIMAL_QR_QUIET;
  const inAnimal = (x, y) => {
    const row = animal.rows[y - animal.y];
    return !!row && row[x - animal.x] === "#";
  };
  const squares = [];
  const dots = [];
  const fill = [];
  const holes = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      const dark = !!qr.data[y][x];
      // types: 0 is a data/ecc module; anything else is a function pattern.
      if (qr.types[y][x] !== 0) {
        if (dark) squares.push([x + q, y + q]);
        continue;
      }
      if (inAnimal(x, y)) {
        fill.push([x + q, y + q]);
        if (!dark) holes.push([x + q, y + q]);
      } else if (dark) {
        dots.push([x + q, y + q]);
      }
    }
  }
  return {
    total: qr.size + q * 2,
    color: gloobalAnimalQrInk(animal.color),
    squares,
    dots,
    fill,
    holes
  };
}

// The person's saved choice: an animal key or "classic". Storage can be
// missing or throw (private windows); the default is simply used then.
function gloobalAnimalQrLoadChoice() {
  try {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(GLOOBAL_ANIMAL_QR_STORAGE_KEY) : null;
    if (saved === "classic" || gloobalAnimalQrFind(saved)) return saved;
  } catch {
  }
  return GLOOBAL_ANIMAL_QR_DEFAULT;
}

function gloobalAnimalQrSaveChoice(choice) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(GLOOBAL_ANIMAL_QR_STORAGE_KEY, choice);
  } catch {
  }
}

// Paints a layout onto a 2D canvas context at `scale` pixels per module.
// Integer scales keep module edges on pixel edges, so nothing blurs.
function gloobalAnimalQrPaint(ctx, layout, scale) {
  const s = scale;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, layout.total * s, layout.total * s);
  ctx.fillStyle = "#000000";
  for (const [x, y] of layout.squares) ctx.fillRect(x * s, y * s, s, s);
  ctx.fillStyle = layout.color;
  for (const [x, y] of layout.fill) ctx.fillRect(x * s, y * s, s, s);
  const dot = (list, d, color) => {
    ctx.fillStyle = color;
    for (const [x, y] of list) {
      ctx.beginPath();
      ctx.arc((x + 0.5) * s, (y + 0.5) * s, (d * s) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  dot(layout.dots, GLOOBAL_ANIMAL_QR_OUT_DOT, "#000000");
  dot(layout.holes, GLOOBAL_ANIMAL_QR_IN_DOT, "#FFFFFF");
}
