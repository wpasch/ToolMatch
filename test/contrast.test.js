// Does the palette stay readable in both themes?
//
// Every colour on the site is a light-dark() token in css/base.css, so the
// pairs that actually meet on screen are knowable without a browser. This
// parses them out of the stylesheet rather than restating them, because a
// contrast test with its own private copy of the palette passes forever
// while the real colours drift underneath it.
//
// WCAG AA: 4.5:1 for body text. Only text pairs are asserted — see the note
// by PAIRS for why the hairline token is left out.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../css/base.css", import.meta.url), "utf8");

// --name: light-dark(#aaa, #bbb);
const tokens = { light: {}, dark: {} };
for (const [, name, light, dark] of css.matchAll(
  /(--[\w-]+):\s*light-dark\(\s*(#[0-9a-f]{3,8})\s*,\s*(#[0-9a-f]{3,8})\s*\)/gi
)) {
  tokens.light[name] = light;
  tokens.dark[name] = dark;
}

function channels(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Foreground, background, and the ratio it has to clear. Only pairs the site
// actually puts together — a token pair that never meets on screen would be
// a test inventing its own requirement.
const PAIRS = [
  ["body text on the page", "--ink", "--paper", 4.5],
  ["body text on a card", "--ink", "--surface", 4.5],
  ["secondary text on the page", "--muted", "--paper", 4.5],
  ["secondary text on a card", "--muted", "--surface", 4.5],
  ["secondary text on the inset surface", "--muted", "--surface-2", 4.5],
  ["a link on the page", "--link", "--paper", 4.5],
  ["a link on a card", "--link", "--surface", 4.5],
  // Badges: the wash is the background the label sits on.
  ["the free-tier badge", "--green", "--green-wash", 4.5],
  ["the paid-only badge", "--coral-ink", "--coral-wash", 4.5],
];

// --line is deliberately not in that list. It draws dividers between cards
// and around chips, and WCAG exempts decoration: a card is identified by its
// contents, not by the rule beside it. It comes to about 1.2:1 against both
// surfaces, which is the soft look the site is going for and not a defect to
// assert against. The judgement call worth revisiting is the filter chips,
// where --surface on --paper is 1.06:1 and the border really is the only
// thing drawing the control's edge.

test("the palette parses out of base.css", () => {
  // If the stylesheet stops matching, every assertion below would pass on an
  // empty set. This is the guard that keeps the rest honest.
  assert.ok(Object.keys(tokens.light).length >= 12, "found too few light-dark() tokens");
  assert.deepEqual(Object.keys(tokens.light), Object.keys(tokens.dark));
  for (const [, fg, bg] of PAIRS) {
    assert.ok(tokens.light[fg], `${fg} is not a light-dark() token`);
    assert.ok(tokens.light[bg], `${bg} is not a light-dark() token`);
  }
});

for (const theme of ["light", "dark"]) {
  test(`${theme} theme meets WCAG AA where the palette meets itself`, () => {
    const failures = [];
    for (const [what, fg, bg, need] of PAIRS) {
      const ratio = contrast(tokens[theme][fg], tokens[theme][bg]);
      if (ratio < need) {
        failures.push(
          `${what}: ${tokens[theme][fg]} on ${tokens[theme][bg]} ` +
            `is ${ratio.toFixed(2)}:1, needs ${need}:1`
        );
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
  });
}

test("the contrast maths agrees with the two ends of the scale", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#123456", "#123456"), 1);
});
