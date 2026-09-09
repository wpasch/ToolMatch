import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  countByCategory,
  directoryCounts,
  directoryUrl,
  directoryStateFromUrl,
  filterDirectoryTools,
  normalizePriceFilter,
} from "../js/directory.js";

const data = JSON.parse(
  await readFile(new URL("../data/tools.json", import.meta.url), "utf8")
);
const labels = Object.fromEntries(data.categories.map(({ id, label }) => [id, label]));

test("price filters partition the entire catalog", () => {
  const free = filterDirectoryTools(data.tools, { price: "free" }, labels);
  const paid = filterDirectoryTools(data.tools, { price: "paid" }, labels);

  // Counted from the catalog rather than written in: the exact totals are
  // validate-data.js's job, and pinning them here only meant this file
  // failed every time a tool was added or dropped. What matters is that the
  // two filters are complements — nothing shown twice, nothing unreachable.
  const paidInCatalog = data.tools.filter((tool) => tool.pricing.model === "paid").length;
  assert.equal(paid.length, paidInCatalog);
  assert.equal(free.length, data.tools.length - paidInCatalog);
  assert.ok(free.every((tool) => tool.pricing.model !== "paid"));
  assert.ok(paid.every((tool) => tool.pricing.model === "paid"));
  assert.equal(free.length + paid.length, data.tools.length);
  // Both sides non-empty, so neither assertion above can pass vacuously.
  assert.ok(free.length > 0 && paid.length > 0);
});

test("category, price, and text filters compose", () => {
  const tools = [
    {
      id: "free-writing",
      name: "Draft Free",
      category: "writing",
      tagline: "Draft essays",
      description: "A free editor",
      tags: ["free"],
      useCases: ["write an essay"],
      pricing: { model: "free" },
    },
    {
      id: "paid-writing",
      name: "Draft Pro",
      category: "writing",
      tagline: "Draft essays",
      description: "A paid editor",
      tags: ["paid"],
      useCases: ["write an essay"],
      pricing: { model: "paid" },
    },
    {
      id: "paid-coding",
      name: "Code Pro",
      category: "coding",
      tagline: "Debug programs",
      description: "A paid debugger",
      tags: ["paid"],
      useCases: ["debug code"],
      pricing: { model: "paid" },
    },
  ];

  assert.deepEqual(
    filterDirectoryTools(tools, { category: "writing", price: "paid" }).map(
      ({ id }) => id
    ),
    ["paid-writing"]
  );
  assert.deepEqual(
    filterDirectoryTools(tools, {
      category: "writing",
      price: "free",
      query: "essay",
    }).map(({ id }) => id),
    ["free-writing"]
  );
  assert.deepEqual(
    filterDirectoryTools(tools, {
      category: "writing",
      price: "paid",
      query: "debug",
    }),
    []
  );
});

test("price filter state is restored from shareable URLs", () => {
  assert.deepEqual(directoryStateFromUrl("https://example.test/?price=free"), {
    category: "all",
    price: "free",
    query: "",
  });
  assert.deepEqual(
    directoryStateFromUrl("https://example.test/?category=career&price=paid"),
    { category: "career", price: "paid", query: "" }
  );
});

test("missing and invalid price parameters safely fall back to any", () => {
  for (const value of [undefined, null, "", "trial", "FREE"]) {
    assert.equal(normalizePriceFilter(value), "any");
  }
  assert.equal(directoryStateFromUrl("https://example.test/").price, "any");
  assert.equal(
    directoryStateFromUrl("https://example.test/?price=unexpected").price,
    "any"
  );
});

// The chips are a promise about what a click produces. Counting them off the
// whole catalog broke that promise the moment a price filter was on: under
// "Paid only", five categories advertised a number and delivered an empty
// list. Every chip is checked against the filter it actually applies.
test("category counts agree with what the filtered list returns", () => {
  for (const price of ["any", "free", "paid"]) {
    const counts = countByCategory(data.tools, price);
    for (const { id, label } of data.categories) {
      const shown = filterDirectoryTools(data.tools, { category: id, price }, labels);
      assert.equal(
        counts[id] ?? 0,
        shown.length,
        `${label} chip disagrees with the list at price=${price}`
      );
    }
  }
});

test("a category with nothing at a price counts zero rather than its catalog total", () => {
  const paid = countByCategory(data.tools, "paid");
  const emptyUnderPaid = data.categories.filter(({ id }) => !paid[id]);

  // The catalog is deliberately mostly free, so some category always has no
  // paid entry. If that ever stops being true the assertion below is the
  // wrong shape, and this says so rather than passing vacuously.
  assert.ok(emptyUnderPaid.length > 0, "expected at least one all-free category");
  for (const { id } of emptyUnderPaid) {
    assert.equal(paid[id] ?? 0, 0);
    assert.ok(data.tools.some((tool) => tool.category === id));
  }
});

test("counts tolerate a tool with no pricing block at all", () => {
  const tools = [
    { id: "a", category: "writing", pricing: { model: "free" } },
    { id: "b", category: "writing" },
  ];

  assert.equal(countByCategory(tools, "any").writing, 2);
  assert.equal(countByCategory(tools, "free").writing, 2);
  assert.equal(countByCategory(tools, "paid").writing ?? 0, 0);
});

test("task search works in the directory and respects explicit filters", () => {
  const shown = filterDirectoryTools(data.tools, { query: "make a slide deck", price: "free" }, labels);
  assert.ok(shown.some((tool) => tool.id === "gamma"));
  assert.ok(shown.every((tool) => tool.pricing.model !== "paid"));
});

test("facet counts agree with each possible selection under task searches", () => {
  for (const query of ["make a slide deck", "free presentation tools", "quantum banana"]) {
    for (const price of ["any", "free", "paid"]) {
      const state = { category: "presentations", price, query };
      const counts = directoryCounts(data.tools, state, labels);
      for (const { id } of data.categories) {
        assert.equal(counts.categories[id] ?? 0, filterDirectoryTools(data.tools, { ...state, category: id }, labels).length);
      }
      for (const selected of ["any", "free", "paid"]) {
        assert.equal(counts.prices[selected], filterDirectoryTools(data.tools, { ...state, price: selected }, labels).length);
      }
    }
  }
});

test("complete directory state survives a URL round trip without changing hero search", () => {
  const state = { category: "presentations", price: "free", query: "slides & diagrams" };
  const url = directoryUrl("https://example.test/subpath/?q=resume&tool=gamma#directory", state);
  assert.deepEqual(directoryStateFromUrl(url), state);
  assert.equal(new URL(url).searchParams.get("q"), "resume");
  assert.equal(new URL(url).searchParams.has("tool"), false);
  assert.equal(new URL(url).hash, "#directory");
  const cleared = directoryUrl(url, { category: "all", price: "any", query: "" });
  assert.equal(new URL(cleared).search, "?q=resume");
});
