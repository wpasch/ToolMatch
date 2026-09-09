// shortPricing, the one piece of real parsing on the card.
//
// Publishers write out every tier they sell. A card being skimmed needs the
// shape of the price, not the price list, so this cuts it down — and the
// rules for doing that (two clauses, each trimmed at its first comma,
// parentheticals removed before the split) are exactly the kind of thing
// that quietly stops working. The untouched note is still on the card,
// behind the Details toggle, so a bad trim loses nothing but legibility.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// cards.js imports dom.js, which reads window.location inside its functions.
globalThis.window = { location: { href: "https://wpasch.github.io/ToolMatch/" } };

const { categoriesPresent, shareLink, shortPricing } = await import("../js/cards.js");

const data = JSON.parse(
  await readFile(new URL("../data/tools.json", import.meta.url), "utf8")
);

test("keeps the first two clauses and drops the rest of the tier list", () => {
  assert.equal(
    shortPricing("Free tier; Pro $20/mo ($17/mo annual); Max $100-200/mo"),
    "Free tier · Pro $20/mo"
  );
  assert.equal(shortPricing("Free plan; Plus ~$8-9/mo"), "Free plan · Plus ~$8-9/mo");
});

test("cuts each clause at its first comma", () => {
  assert.equal(
    shortPricing("Free for students, with limits; Pro $15/mo, billed yearly"),
    "Free for students · Pro $15/mo"
  );
});

test("removes parentheticals before splitting, not after", () => {
  // The order matters. A semicolon inside parentheses would otherwise split
  // the note in half and leave two fragments that no longer read as an aside.
  assert.equal(
    shortPricing("Free (limited; watermarked); Pro $12/mo"),
    "Free · Pro $12/mo"
  );
  assert.equal(shortPricing("Pro $20/mo ($17/mo annual)"), "Pro $20/mo");
});

test("a single clause is left alone", () => {
  assert.equal(shortPricing("Completely free"), "Completely free");
});

test("an absent note produces an empty string rather than 'undefined'", () => {
  for (const missing of ["", null, undefined]) {
    assert.equal(shortPricing(missing), "");
  }
  assert.equal(shortPricing("   ;  ; "), "");
});

test("every pricing note in the catalog survives the trim", async () => {
  // The real corpus, not invented strings. A note that trims to nothing would
  // leave a blank line where the price belongs, and a trim that keeps the
  // whole note has not done its job.
  const data = JSON.parse(
    await readFile(new URL("../data/tools.json", import.meta.url), "utf8")
  );

  for (const tool of data.tools) {
    const short = shortPricing(tool.pricing.note);
    assert.notEqual(short, "", `${tool.id} trims to nothing: ${tool.pricing.note}`);
    // Not a length comparison — "; " becomes " · ", so a two-clause note
    // legitimately comes out one character longer. What the trim promises is
    // a bounded number of clauses, so that is what is checked.
    assert.ok(
      short.split(" · ").length <= 2,
      `${tool.id} kept more than two clauses: ${short}`
    );
    assert.ok(!short.includes(";"), `${tool.id} kept a semicolon: ${short}`);
    assert.ok(!/\($/.test(short.trim()), `${tool.id} left a dangling bracket: ${short}`);
  }
});

// The directory groups itself under category headings only when what's on
// screen spans more than one category. Filtered to a single category the
// headings would repeat the pressed chip, so the rule is worth pinning: it
// decides both the layout and whether card names are h3 or h4.
test("categories present follow catalog order and skip the empty ones", () => {
  const categories = [
    { id: "writing", label: "Writing" },
    { id: "coding", label: "Coding" },
    { id: "image", label: "Image" },
  ];
  const tools = [
    { id: "a", category: "image" },
    { id: "b", category: "writing" },
    { id: "c", category: "image" },
  ];

  // Catalog order, not first-seen order — "image" appears first in the tools.
  assert.deepEqual(
    categoriesPresent(tools, categories).map(({ id }) => id),
    ["writing", "image"]
  );
});

test("one category and none at all both mean an ungrouped list", () => {
  const categories = [
    { id: "writing", label: "Writing" },
    { id: "coding", label: "Coding" },
  ];

  assert.equal(categoriesPresent([{ id: "a", category: "coding" }], categories).length, 1);
  assert.equal(categoriesPresent([], categories).length, 0);
});

test("every category in the real catalog is reachable as a group", () => {
  const present = categoriesPresent(data.tools, data.categories);
  assert.equal(present.length, data.categories.length, "a category has no tools in it");
});

// The copy-link button on each card. What it must not do is bake the filters
// that happened to be on into a link meant to point at one tool — that is the
// combination that used to render the directory and silently ignore the id.
test("a shared link carries the tool and nothing else", () => {
  assert.equal(
    shareLink("https://wpasch.github.io/ToolMatch/?category=research&price=free", "perplexity"),
    "https://wpasch.github.io/ToolMatch/?tool=perplexity"
  );
});

test("a shared link drops a previous tool, a query and a fragment", () => {
  assert.equal(
    shareLink("https://wpasch.github.io/ToolMatch/?q=cite+sources&tool=elicit#directory", "gamma"),
    "https://wpasch.github.io/ToolMatch/?tool=gamma"
  );
});

test("a shared link keeps the origin and path it was built from", () => {
  // The site is served from a project subpath on Pages and from the root
  // locally; neither may be assumed away.
  assert.equal(shareLink("http://localhost:8000/", "claude"), "http://localhost:8000/?tool=claude");
  assert.equal(
    shareLink("https://example.com/tools/index.html", "claude"),
    "https://example.com/tools/index.html?tool=claude"
  );
});

test("an id with URL-significant characters is encoded, not interpolated", () => {
  const link = shareLink("https://wpasch.github.io/ToolMatch/", "a&b=c d");
  assert.equal(link, "https://wpasch.github.io/ToolMatch/?tool=a%26b%3Dc+d");
  assert.equal(new URL(link).searchParams.get("tool"), "a&b=c d");
});

test("every id in the catalog survives a round trip through a shared link", () => {
  for (const { id } of data.tools) {
    const link = shareLink("https://wpasch.github.io/ToolMatch/", id);
    assert.equal(new URL(link).searchParams.get("tool"), id);
  }
});
