import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderCatalogInto } from "../js/cards.js";
import { buildIndex, rank } from "../js/search.js";

// Small element tree for inspecting the actual renderer's output order.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.classList = { add() {} };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
}
const data = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));
const labels = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));

test("rendered search results retain relevance across categories; browsing stays grouped", (t) => {
  globalThis.document = {
    querySelectorAll: () => [],
    createElement: (tag) => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
  };
  globalThis.window = { location: { href: "https://example.test/" } };
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const found = rank(buildIndex(data.tools, labels), "make a slide deck", 107, labels).map((r) => r.tool);
  const container = new Element("div");
  renderCatalogInto(container, found, labels, data.categories, { anchors: true, ranked: true });
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tag, "ul");
  assert.deepEqual(container.children[0].children.map((card) => card.id), found.map((tool) => `tool-${tool.id}`));
  renderCatalogInto(container, found, labels, data.categories, { anchors: true });
  assert.ok(container.children.length > 1);
  assert.equal(container.children[0].tag, "div");
});

test("Back and Forward restore submitted hero searches and their all-matches links", async (t) => {
  const { initSearch } = await import("../js/directory.js");
  class Control extends Element {
    constructor(tag) { super(tag); this.listeners = {}; this.value = ""; this.hidden = false; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    focus() {}
    scrollIntoView() {}
  }
  const ids = Object.fromEntries(["search-form", "search-input", "results", "results-list", "search-status", "results-label", "results-more", "search-examples"].map((id) => [id, new Control("div")]));
  const heading = new Control("h2");
  ids.results.querySelector = () => heading;
  const example = new Control("button");
  example.dataset.query = "make a slide deck";
  const listeners = {};
  const entries = ["https://example.test/"];
  globalThis.window = {
    location: { href: entries[0], hash: "" },
    matchMedia: () => ({ matches: true }),
    addEventListener: (event, listener) => { listeners[event] = listener; },
  };
  globalThis.history = { pushState: (_, __, href) => { entries.push(String(href)); window.location.href = String(href); } };
  globalThis.document = {
    getElementById: (id) => ids[id],
    querySelector: () => example,
    querySelectorAll: () => [],
    createElement: (tag) => new Control(tag),
    createElementNS: (_, tag) => new Control(tag),
  };
  t.after(() => { delete globalThis.window; delete globalThis.document; delete globalThis.history; });
  initSearch(data, labels);
  for (const query of ["AI launcher", "make a slide deck"]) {
    ids["search-input"].value = query;
    ids["search-form"].listeners.submit({ preventDefault() {} });
  }
  assert.equal(entries.length, 3);
  assert.equal(ids["results-more"].hidden, false);
  assert.equal(new URL(ids["results-more"].href).searchParams.get("filter"), "make a slide deck");
  window.location.href = entries[1];
  listeners.popstate();
  assert.equal(ids["search-input"].value, "AI launcher");
  assert.match(heading.textContent, /1 tool for “AI launcher”/);
  assert.equal(ids["results-more"].hidden, true);
  window.location.href = entries[2];
  listeners.popstate();
  assert.equal(ids["search-input"].value, "make a slide deck");
  assert.equal(entries.length, 3, "restoring history must not add another entry");
});
