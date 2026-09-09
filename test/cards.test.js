import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// cards.js imports dom.js, which reads window.location inside its functions.
globalThis.window = { location: { href: "https://wpasch.github.io/ToolMatch/" } };

const { categoriesPresent, shareLink, displayPricing } = await import("../js/cards.js");

const data = JSON.parse(
  await readFile(new URL("../data/tools.json", import.meta.url), "utf8")
);

test("pricing keeps annual billing, limits, and parenthetical qualifications visible", () => {
  for (const note of [
    "Free for students, with limits; Pro $15/mo, billed yearly",
    "Free (limited; watermarked); Pro $12/mo",
    "Pro $20/mo ($17/mo annual)",
  ]) assert.equal(displayPricing({ note }), note);
  for (const tool of data.tools) assert.equal(displayPricing(tool.pricing), tool.pricing.note);
});

test("an editorial summary is used only when explicitly supplied", () => {
  assert.equal(displayPricing({ summary: "$120/year ($10/month equivalent)", note: "All tiers" }), "$120/year ($10/month equivalent)");
  assert.equal(displayPricing({ note: "Completely free" }), "Completely free");
  assert.equal(displayPricing(), "");
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
