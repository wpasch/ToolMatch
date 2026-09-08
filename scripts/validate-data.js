import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SITE_URL } from "./site.js";
import {
  buildRobots,
  buildSitemap,
  renderJsonLdBlock,
  JSONLD_OPEN,
  JSONLD_CLOSE,
} from "./build-meta.js";

const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/tools.json", root), "utf8"));
const html = await readFile(new URL("index.html", root), "utf8");

assert.ok(!html.includes('href="/"'), "root-relative home links break subpath hosting");
assert.ok(!html.includes("fonts.googleapis.com"), "fonts must be served locally");
assert.ok(!html.includes("fonts.gstatic.com"), "fonts must be served locally");
const documentIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(documentIds).size, documentIds.length, "index.html contains duplicate IDs");

assert.equal(typeof data.meta?.version, "number", "meta.version must be numeric");
assert.match(data.meta?.updated ?? "", /^\d{4}-\d{2}-\d{2}$/, "invalid meta.updated");
assert.ok(Array.isArray(data.categories), "categories must be an array");
assert.ok(Array.isArray(data.tags), "tags must be an array");
assert.ok(Array.isArray(data.tools), "tools must be an array");

const categoryIds = new Set(data.categories.map(({ id }) => id));
const allowedTags = new Set(data.tags);
const ids = new Set();
const validPricing = new Set(["free", "freemium", "paid"]);
const validSkills = new Set(["beginner", "intermediate", "advanced"]);
const maxPricingAgeDays = 120;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

for (const tool of data.tools) {
  assert.match(tool.id ?? "", /^[a-z0-9][a-z0-9-]*$/, `invalid id: ${tool.id}`);
  assert.ok(!ids.has(tool.id), `duplicate tool id: ${tool.id}`);
  ids.add(tool.id);

  for (const field of ["name", "url", "tagline", "description"]) {
    assert.equal(typeof tool[field], "string", `${tool.id}.${field} must be a string`);
    assert.ok(tool[field].trim(), `${tool.id}.${field} must not be empty`);
  }

  const url = new URL(tool.url);
  assert.ok(["http:", "https:"].includes(url.protocol), `${tool.id} has an unsafe URL`);
  assert.ok(categoryIds.has(tool.category), `${tool.id} has an unknown category`);
  assert.ok(Array.isArray(tool.tags) && tool.tags.length, `${tool.id} needs tags`);
  assert.ok(Array.isArray(tool.useCases) && tool.useCases.length, `${tool.id} needs use cases`);
  assert.ok(tool.tags.every((tag) => allowedTags.has(tag)), `${tool.id} has an unknown tag`);
  assert.ok(validPricing.has(tool.pricing?.model), `${tool.id} has invalid pricing`);
  assert.ok(tool.pricing?.note?.trim(), `${tool.id} needs a pricing note`);
  assert.ok(validSkills.has(tool.skillLevel), `${tool.id} has invalid skill level`);
  assert.match(tool.pricingChecked ?? "", /^\d{4}-\d{2}-\d{2}$/, `${tool.id} has an invalid pricing date`);
  const checkedDate = new Date(`${tool.pricingChecked}T00:00:00Z`);
  assert.equal(
    checkedDate.toISOString().slice(0, 10),
    tool.pricingChecked,
    `${tool.id} has an impossible pricing date`
  );
  const ageDays = (today - checkedDate) / 86_400_000;
  assert.ok(ageDays >= 0, `${tool.id} has a future pricing date`);
  assert.ok(
    ageDays <= maxPricingAgeDays,
    `${tool.id} pricing is ${Math.floor(ageDays)} days old; re-check it`
  );
}

// ---------- Composition ----------
// A directory goes lopsided one accepted tool at a time. Nothing about a
// category with three entries in it looks broken — the chip is there, the
// filter works, the count is quietly small — so the shape of the catalog is
// asserted rather than eyeballed.
//
// MIN_PER_CATEGORY is a floor, not a target. It sits below where the thinnest
// categories are today, so it catches a category being hollowed out rather
// than nagging about one that is merely smaller than the rest.
const MIN_PER_CATEGORY = 5;
const perCategory = new Map(data.categories.map(({ id }) => [id, 0]));
for (const tool of data.tools) {
  perCategory.set(tool.category, perCategory.get(tool.category) + 1);
}
for (const [id, count] of perCategory) {
  assert.ok(
    count >= MIN_PER_CATEGORY,
    `category "${id}" has only ${count} tools; a category thinner than ${MIN_PER_CATEGORY} reads as an empty room`
  );
}

const logosDirectory = new URL("assets/logos/", root);
const logoFiles = (await readdir(logosDirectory)).filter((file) => file.endsWith(".png"));
const logoIds = new Set(logoFiles.map((file) => path.basename(file, ".png")));
assert.deepEqual([...logoIds].sort(), [...ids].sort(), "tool IDs and logo filenames differ");

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const file of logoFiles) {
  const bytes = await readFile(new URL(file, logosDirectory));
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), `${file} is not actually a PNG`);
}

for (const file of [
  "figtree-latin.woff2",
  "figtree-italic-latin.woff2",
  "instrument-serif-latin.woff2",
  "instrument-serif-italic-latin.woff2",
]) {
  const bytes = await readFile(new URL(`assets/fonts/${file}`, root));
  assert.equal(bytes.subarray(0, 4).toString(), "wOF2", `${file} is not a WOFF2 font`);
}

// The section promises that nothing on the site is priced older than a given
// date, and the FAQ repeats it. That date is the oldest pricingChecked in the
// catalog, so it moves every time the staleest entry is re-verified — and
// until now nothing noticed when the prose stopped matching the data.
const oldestChecked = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(
  new Date(`${data.tools.map((t) => t.pricingChecked).sort()[0]}T00:00:00Z`)
);

const freeCount = data.tools.filter(({ pricing }) => pricing.model !== "paid").length;
const paidCount = data.tools.length - freeCount;
const beginnerCount = data.tools.filter(({ skillLevel }) => skillLevel === "beginner").length;
const publishedClaims = [
  // "directory of N AI tools" appears in the hero and again in the meta
  // description, so each claim carries enough of its own sentence to name
  // one place. Without that a single updated copy satisfied the assertion
  // for both, and the other could go stale unnoticed.
  ["hero total", `directory of ${data.tools.length} AI tools for coursework`],
  ["meta description total", `directory of ${data.tools.length} AI tools for students`],
  ["og:description total", `${data.tools.length} hand-checked tools for`],
  ["twitter:description total", `${data.tools.length} hand-checked tools.`],
  ["browse total", `browse all ${data.tools.length} tools`],
  ["category heading", `${data.categories.length} categories,<br />${data.tools.length} tools`],
  ["directory heading", `All ${data.tools.length} tools`],
  ["oldest-price FAQ", `re-checked on or after ${oldestChecked}`],
  ["free-tier FAQ", `${freeCount} of the ${data.tools.length} have a real free tier`],
  ["FAQ total", `Why only ${data.tools.length} tools?`],
  ["footer total", `<p>${data.tools.length} tools</p>`],
];
for (const [label, expected] of publishedClaims) {
  assert.ok(html.includes(expected), `index.html has a stale or missing ${label}: ${expected}`);
}

// The social card carries the same numbers on a page nobody loads: it is
// rendered to a PNG by `npm run og` and never served, so a stale count there
// survives every other check in this file and ships on every share.
const ogCard = await readFile(new URL("scripts/og-card.html", root), "utf8");
for (const [label, expected] of [
  ["hero total", `directory of ${data.tools.length} AI tools`],
  ["fact total", `<span>${data.tools.length} tools</span>`],
]) {
  assert.ok(
    ogCard.includes(expected),
    `scripts/og-card.html has a stale ${label}: ${expected} — then run: npm run og`
  );
}

// ---------- Generated metadata ----------
// robots.txt, sitemap.xml and the JSON-LD block are all produced by
// `npm run meta`. Committed copies that no longer match the generator are
// exactly the drift this file already caught once with the tool counts, so
// they are compared rather than trusted.
const generated = [
  ["sitemap.xml", buildSitemap(data)],
  ["robots.txt", buildRobots()],
];
for (const [file, expected] of generated) {
  const actual = await readFile(new URL(file, root), "utf8").catch(() => null);
  assert.notEqual(actual, null, `${file} is missing; run: npm run meta`);
  assert.equal(actual, expected, `${file} is stale; run: npm run meta`);
}

const jsonLdStart = html.indexOf(JSONLD_OPEN);
const jsonLdEnd = html.indexOf(JSONLD_CLOSE);
assert.ok(jsonLdStart !== -1 && jsonLdEnd !== -1, "index.html is missing the JSON-LD markers");
assert.equal(
  html.slice(jsonLdStart, jsonLdEnd + JSONLD_CLOSE.length),
  renderJsonLdBlock(data),
  "the JSON-LD in index.html is stale; run: npm run meta"
);

// ---------- Sharing ----------
// A card that unfurls against the wrong origin fails silently, and a social
// image of the wrong size is cropped by every platform differently, so both
// are checked rather than eyeballed.
const origin = SITE_URL.replace(/\/$/, "");
for (const tag of [
  `<link rel="canonical" href="${origin}/" />`,
  `<meta property="og:url" content="${origin}/" />`,
  `<meta property="og:image" content="${origin}/assets/og.png" />`,
  `<meta name="twitter:image" content="${origin}/assets/og.png" />`,
  '<meta name="twitter:card" content="summary_large_image" />',
]) {
  assert.ok(html.includes(tag), `index.html is missing or has drifted from: ${tag}`);
}

const ogBytes = await readFile(new URL("assets/og.png", root));
assert.ok(ogBytes.subarray(0, 8).equals(pngSignature), "assets/og.png is not a PNG");
// A PNG's IHDR is the first chunk, and its width and height are the four
// bytes each that follow the chunk type at offset 16.
const ogWidth = ogBytes.readUInt32BE(16);
const ogHeight = ogBytes.readUInt32BE(20);
assert.equal(`${ogWidth}x${ogHeight}`, "1200x630", "assets/og.png must be 1200x630; run: npm run og");

// The composition, printed on every run. The site's premise is that these
// tools are usable with no budget, and that claim is a ratio — worth seeing
// each time the catalog changes rather than the day someone questions it.
const thinnest = [...perCategory.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3);

console.log(
  `Validated ${data.tools.length} tools, ${data.categories.length} categories, ` +
    `${logoFiles.length} logos, and the generated metadata.`
);
console.log(
  `  ${freeCount} free or freemium · ${paidCount} paid · ${beginnerCount} beginner-level`
);
console.log(
  `  thinnest categories: ${thinnest.map(([id, n]) => `${id} (${n})`).join(", ")}`
);
