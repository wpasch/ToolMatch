// Canonical formatting for data/tools.json.
//
//   npm run format
//
// The catalog was formatted by hand, which meant it was formatted several
// ways: 105 pricing objects sat on one line and two were wrapped, one euro
// sign was escaped as € while the rest were literal. None of that is
// visible on the site, and all of it is invisible right up until something
// reformats the file — at which point a one-line change arrives as a
// 1,100-line diff and the actual edit is unreviewable.
//
// So the shape is written down once, here, and validate-data.js fails when
// the committed file no longer matches — the same treatment sitemap.xml and
// robots.txt already get. The style is the one the file mostly had, because
// it was chosen for reading: a tool entry is about fifteen lines rather than
// the thirty that uniform pretty-printing produces, and the fields you scan
// for — tags, pricing — stay on one line each.

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const J = (value) => JSON.stringify(value);

// Every tool carries these, in this order. A tool whose fields arrive in some
// other order is rewritten into this one; anything unrecognised keeps its
// place at the end rather than being dropped, because a formatter that loses
// a field is worse than no formatter at all.
const FIELD_ORDER = [
  "id",
  "name",
  "url",
  "category",
  "tagline",
  "description",
  "tags",
  "useCases",
  "pricing",
  "pricingChecked",
  "skillLevel",
];

function inlineObject(object) {
  const pairs = Object.entries(object).map(([key, value]) => `${J(key)}: ${J(value)}`);
  return `{ ${pairs.join(", ")} }`;
}

function orderedEntries(tool) {
  const known = FIELD_ORDER.filter((field) => field in tool).map((field) => [field, tool[field]]);
  const extra = Object.entries(tool).filter(([field]) => !FIELD_ORDER.includes(field));
  return [...known, ...extra];
}

function formatTool(tool) {
  const fields = orderedEntries(tool).map(([key, value]) => {
    // The one field that earns its own lines. Use cases are read as a list —
    // "is the thing I want to do in here?" — and four of them run past any
    // sensible line length when joined.
    if (key === "useCases" && Array.isArray(value)) {
      const items = value.map((item) => `        ${J(item)}`).join(",\n");
      return `      ${J(key)}: [\n${items}\n      ]`;
    }
    if (Array.isArray(value)) return `      ${J(key)}: [${value.map(J).join(", ")}]`;
    if (value && typeof value === "object") return `      ${J(key)}: ${inlineObject(value)}`;
    return `      ${J(key)}: ${J(value)}`;
  });

  return `    {\n${fields.join(",\n")}\n    }`;
}

export function formatCatalog(data) {
  const blocks = [
    `  "meta": ${inlineObject(data.meta)},`,
    "",
    '  "categories": [',
    data.categories.map((category) => `    ${inlineObject(category)}`).join(",\n"),
    "  ],",
    "",
    '  "tags": [',
    data.tags.map((tag) => `    ${J(tag)}`).join(",\n"),
    "  ],",
    "",
    '  "tools": [',
    data.tools.map(formatTool).join(",\n"),
    "  ]",
  ];

  return `{\n${blocks.join("\n")}\n}\n`;
}

// Importing this file must not rewrite the catalog — validate-data.js needs
// formatCatalog to compare against, not to apply.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = new URL("data/tools.json", root);
  const before = await readFile(file, "utf8");
  const after = formatCatalog(JSON.parse(before));

  if (before === after) {
    console.log("data/tools.json is already canonical; nothing to write.");
  } else {
    await writeFile(file, after);
    const delta = after.split("\n").length - before.split("\n").length;
    console.log(
      `Formatted data/tools.json — ${after.split("\n").length} lines ` +
        `(${delta >= 0 ? "+" : ""}${delta}).`
    );
  }
}
