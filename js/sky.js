// The hero's cumulus banks.
//
// The shapes are plain overlapping circles; the turbulence filter displaces
// their edges into irregular puffs, which is what separates a cloud from a
// blurred ellipse. Two banks drift at different speeds for parallax.
//
// This is geometry, not content — three lists of numbers and two noise
// filters — so it lives here as data rather than as a hundred and sixty
// lines of hand-written <circle> tags in index.html. It has to be built
// into the document rather than loaded as an external .svg file: the
// gradient stops are themed from CSS (.cloud-body-1 and friends in
// hero.css), and an <img> or background-image can't see the page's
// stylesheet.

const SVG_NS = "http://www.w3.org/2000/svg";

function node(tag, attrs, children = []) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  element.append(...children);
  return element;
}

// Tall mass left, open sky through the middle, a second rise on the right:
// the uneven skyline is what stops it reading as fog. Each band is 2880
// units wide — the same 1440-unit bank drawn twice — so translating its
// wrapper by -50% lands exactly one bank along and the loop is seamless.
// The last two circles are wrap partners of the first and second-to-last,
// 1440 apart, so the bank tiles; shapes crossing x=0 have a partner at
// x=1440 for the same reason.
const BANK = [
  [40, 500, 145], [150, 448, 135], [250, 392, 112], [330, 338, 84],
  [398, 302, 56], [395, 425, 120], [490, 478, 105],

  [610, 512, 95], [720, 500, 88], [820, 508, 100],

  [940, 458, 118], [1040, 402, 92], [1120, 440, 110],

  [1250, 420, 132], [1362, 358, 94], [1444, 430, 140],

  [1480, 500, 145], [4, 430, 140],
];
const BANK_FLOOR = [-40, 498, 1560, 110];

// A flatter, lower bank for the distance. Also tiles at 1440; the pair at
// x=-40 / x=1400 are the wrap.
const BANK_FAR = [
  [-40, 470, 130], [120, 440, 115], [300, 408, 128], [470, 452, 112],
  [640, 416, 135], [820, 446, 118], [1000, 406, 130], [1180, 450, 120],
  [1340, 420, 126], [1400, 470, 130],
];
const BANK_FAR_FLOOR = [-40, 466, 1560, 140];

// Only the upper lobes, pulled up and in. Because these don't merge into
// the same silhouette as the body, the mid-tone survives in the gaps
// between them — which is where the sense of separate billows comes from.
const CAPS = [
  [44, 478, 116], [152, 426, 108], [250, 372, 89], [330, 320, 66],
  [398, 286, 43], [396, 406, 95], [490, 458, 83],

  [610, 494, 75], [720, 482, 69], [820, 490, 79],

  [940, 438, 94], [1040, 384, 73], [1120, 422, 87],

  [1250, 400, 105], [1362, 340, 75], [1444, 410, 111],

  [1484, 478, 116], [4, 410, 111],
];

// The noise that chews the circle edges into puffs. The near bank gets
// finer, less violent displacement than the far one, so the closer clouds
// hold more detail.
function puff({ id, baseFrequency, numOctaves, seed, scale, blur }) {
  return node("filter", { id, x: "-15%", y: "-30%", width: "130%", height: "160%" }, [
    node("feTurbulence", {
      type: "fractalNoise",
      baseFrequency,
      numOctaves,
      seed,
      result: "n",
    }),
    node("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "n",
      scale,
      xChannelSelector: "R",
      yChannelSelector: "G",
    }),
    node("feGaussianBlur", { stdDeviation: blur }),
  ]);
}

// Stop colours come from CSS so both themes can move them; only the class
// and the offset are set here.
function gradient(id, stops) {
  return node(
    "linearGradient",
    { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    stops.map(([className, offset]) => node("stop", { class: className, offset }))
  );
}

function shapes(id, circles, floor) {
  const children = circles.map(([cx, cy, r]) => node("circle", { cx, cy, r }));
  if (floor) {
    const [x, y, width, height] = floor;
    children.push(node("rect", { x, y, width, height }));
  }
  return node("g", { id }, children);
}

// One tile of each band: body plus sunlit caps. The filter sits *inside*
// each tile rather than on the band, so both copies of the tile are
// displaced by identical noise and the seam doesn't show.
function tile(id, layers) {
  return node(
    "g",
    { id },
    layers.map(([filter, fill, href]) =>
      node("g", { filter: `url(#${filter})`, fill: `url(#${fill})` }, [
        node("use", { href: `#${href}` }),
      ])
    )
  );
}

export function renderSky() {
  const host = document.querySelector(".sky__defs");
  if (!host) return;

  host.replaceChildren(
    node("defs", {}, [
      puff({ id: "puff-far", baseFrequency: 0.008, numOctaves: 4, seed: 11, scale: 88, blur: 10 }),
      puff({ id: "puff-near", baseFrequency: 0.014, numOctaves: 5, seed: 4, scale: 54, blur: 2.5 }),

      // The bank's own mid-tone. Clouds are not white all through; only the
      // tops that face the sun are.
      gradient("cloud-body", [
        ["cloud-body-1", 0],
        ["cloud-body-2", 0.55],
        ["cloud-body-3", 1],
      ]),
      // Sunlit caps.
      gradient("cloud-lit", [
        ["cloud-lit-1", 0],
        ["cloud-lit-2", 1],
      ]),

      shapes("bank", BANK, BANK_FLOOR),
      shapes("bank-far", BANK_FAR, BANK_FAR_FLOOR),
      shapes("caps", CAPS),

      tile("tile-near", [
        ["puff-near", "cloud-body", "bank"],
        ["puff-near", "cloud-lit", "caps"],
      ]),
      tile("tile-far", [["puff-far", "cloud-body", "bank-far"]]),
    ])
  );
}
