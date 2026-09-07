// The hero's moving parts: the drifting logo strip at its foot, the
// floating chips over the Categories heading, and the sky's scroll lag.

import { el, logoUrl, safeUrl } from "./dom.js";

// ---------- Hero logo strip ----------
// The strip is texture under the search, not a second thing to read, so it
// shows a short spread of logos rather than everything at hand.
//
// Four identical runs sit side by side and the CSS translates the track by
// -25%, which advances exactly one run and lands on an identical frame. The
// extra runs are what keep the band unbroken on a wide display now that
// there are fewer distinct chips in each one.
const MARQUEE_PICKS = 14;
const MARQUEE_RUNS = 4;

export function renderMarquee(tools) {
  const track = document.getElementById("hero-marquee");
  if (!track) return;

  function chip(tool, size) {
    const span = el("span", "marquee__chip");
    const src = safeUrl(logoUrl(tool));
    if (src) {
      const img = el("img");
      img.src = src;
      img.alt = "";
      img.width = size;
      img.height = size;
      img.loading = "lazy";
      span.append(img);
    }
    return span;
  }

  // Spaced across the catalog rather than taken off the top, which would
  // have shown fourteen chat assistants.
  const step = Math.max(1, Math.floor(tools.length / MARQUEE_PICKS));
  const picks = [];
  for (let i = 0; i < MARQUEE_PICKS && i * step < tools.length; i++) {
    picks.push(tools[i * step]);
  }

  track.replaceChildren();
  for (let pass = 0; pass < MARQUEE_RUNS; pass++) {
    for (const tool of picks) track.appendChild(chip(tool, 24));
  }
}

// ---------- Category cluster ----------
// Fixed positions rather than random ones, so the scatter reads as composed.
// All of them sit in the band above the heading; the tops alternate high and
// low so the row never reads as a straight line.
// Chips over the centre column stay high, clear of the heading; the ones
// that hang lower are pushed out to the margins where no type reaches.
const CLUSTER_POSITIONS = [
  [2, 52], [9, 16], [17, 60], [25, 10], [34, 4], [43, 14],
  [57, 8], [66, 2], [74, 54], [82, 12], [90, 58], [97, 26],
];

// Drift values per chip. Derived from the index rather than Math.random so
// the layout is identical on every load, but the numbers are coprime enough
// that no two chips share a rhythm. The delays are negative on purpose:
// that starts each chip partway through its cycle instead of having the
// whole cluster lurch into motion together on load.
function driftStyle(i) {
  const duration = 6.5 + ((i * 1.7) % 5.5);
  const delay = -((i * 2.3) % 7).toFixed(2);
  const dy = -(11 + ((i * 5) % 13));
  const dx = ((i % 3) - 1) * 7;
  const rotate = ((i % 5) - 2) * 3;
  return `--t:${duration.toFixed(2)}s;--d:${delay}s;--dy:${dy}px;--dx:${dx}px;--r:${rotate}deg`;
}

// How far back a chip sits, taken from how low it hangs. The ones nearest
// the heading are the far ones: smaller and fainter, so the band reads as
// depth instead of scatter. Applied per chip because fading the layer
// instead cut individual chips in half — see .cluster__chip in the CSS.
const CLUSTER_LOW = 60;

// Depth leans on size more than on fade. Pushing the opacity much below
// this turns a light chip face over the dark theme's ground into a flat
// grey disc, which loses the logo — the thing the chip is there to show.
function depthStyle(top) {
  const depth = Math.min(top, CLUSTER_LOW) / CLUSTER_LOW;
  const opacity = 1 - depth * 0.38;
  const scale = 1 - depth * 0.26;
  return `--o:${opacity.toFixed(2)};--s:${scale.toFixed(3)}`;
}

export function renderCluster(tools) {
  const cluster = document.getElementById("logo-cluster");
  if (!cluster) return;

  // Spread the picks across the catalog so the cluster shows variety
  // rather than the first dozen chat assistants.
  const step = Math.floor(tools.length / CLUSTER_POSITIONS.length) || 1;

  cluster.replaceChildren();
  CLUSTER_POSITIONS.forEach(([left, top], i) => {
    const tool = tools[(i * step) % tools.length];
    const span = el("span", "cluster__chip");
    // Numbers only — nothing from the catalog reaches the style attribute.
    span.style.cssText = `left:${left}%;top:${top}%;${driftStyle(i)};${depthStyle(top)}`;

    const src = safeUrl(logoUrl(tool));
    if (src) {
      const img = el("img");
      img.src = src;
      img.alt = "";
      img.width = 29;
      img.height = 29;
      img.loading = "lazy";
      span.append(img);
    }
    cluster.appendChild(span);
  });
}

// ---------- Sky parallax ----------
// The cloud bands drift sideways on their own (CSS); this only makes them
// lag the scroll vertically, which is what sells the depth between them.
// Writes a single custom property and lets CSS decide how far each layer
// moves.
export function initSkyParallax() {
  const sky = document.querySelector(".hero__sky");
  const hero = document.querySelector(".hero");
  if (!sky || !hero) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;

  function update() {
    // Past the hero there is nothing left to parallax, so stop moving.
    const limit = hero.offsetHeight;
    const shift = Math.min(window.scrollY, limit) * 0.22;
    sky.style.setProperty("--sky-shift", `${shift}px`);
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  update();
}
