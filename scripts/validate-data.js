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

const freeCount = data.tools.filter(({ pricing }) => pricing.model !== "paid").length;
const beginnerCount = data.tools.filter(({ skillLevel }) => skillLevel === "beginner").length;
for (const expected of [
  `${data.tools.length} AI tools`,
  `browse all ${data.tools.length} tools`,
  `All ${data.tools.length} tools`,
  `${freeCount} of the ${data.tools.length}`,
  `>${beginnerCount}</p>`,
  `>${data.categories.length}</p>`,
]) {
  assert.ok(html.includes(expected), `index.html is missing current catalog statistic: ${expected}`);
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

console.log(
  `Validated ${data.tools.length} tools, ${data.categories.length} categories, ` +
    `${logoFiles.length} logos, and the generated metadata.`
);
