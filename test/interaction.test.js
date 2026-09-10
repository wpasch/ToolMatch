import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { initCardSharing } from "../js/cards.js";
import { comparisonRows, isCompared, toggleComparison, reportUrl } from "../js/compare.js";
import { allMatchesUrl, linkedToolUrl, writeHistory, directoryStateFromUrl } from "../js/directory.js";

const data = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));

class Element {
  constructor() { this.children = []; this.classes = new Set(); this.classList = { add: (s) => this.classes.add(s), remove: (s) => this.classes.delete(s) }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  focus() { this.focused = true; }
  select() { this.selected = true; }
  querySelector() { return this.children.find((c) => c.className === "tool-card__copy-feedback"); }
}

test("copy feedback clears on both cards; denied clipboard exposes a selected link without changing the URL", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let click;
  globalThis.document = { createElement: () => new Element(), addEventListener: (_, handler) => { click = handler; } };
  globalThis.window = { location: { href: "https://example.test/?filter=slides#directory" } };
  let deny = false;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => { if (deny) throw Error("Denied"); } } } });
  t.after(() => {
    delete globalThis.document; delete globalThis.window;
    Object.defineProperty(globalThis, "navigator", oldNavigator);
  });
  initCardSharing();
  const cards = [new Element(), new Element()];
  const buttons = cards.map((card, i) => {
    const button = new Element(); button.dataset = { tool: i ? "gamma" : "claude" }; button.closest = () => card; return button;
  });
  for (const button of buttons) await click({ target: { closest: () => button } });
  assert.ok(buttons.every((b) => b.classes.has("is-copied")));
  t.mock.timers.tick(2001);
  assert.ok(buttons.every((b) => !b.classes.has("is-copied")));
  deny = true;
  await click({ target: { closest: () => buttons[0] } });
  const input = cards[0].querySelector().children[1].children[0];
  assert.equal(input.value, "https://example.test/?tool=claude");
  assert.ok(input.readOnly && input.focused && input.selected);
  assert.equal(window.location.href, "https://example.test/?filter=slides#directory");
  assert.equal(buttons[0].classes.has("is-copied"), false);
});

test("comparison caps selection at three and allows replacing a pick", () => {
  for (const id of ["a", "b", "c"]) assert.equal(toggleComparison(id), true);
  assert.equal(toggleComparison("d"), false);
  assert.equal(isCompared("d"), false);
  assert.equal(toggleComparison("b"), true);
  assert.equal(toggleComparison("d"), true);
  for (const id of ["a", "c", "d"]) toggleComparison(id);
});

// A comparison is only worth its space if the columns differ. These guard the
// two ways it stopped being one: a row repeating another row verbatim, and a
// row that had nothing to say about any tool in the selection.
test("no comparison row repeats another for any pair in the catalog", () => {
  const byId = Object.fromEntries(data.tools.map((tool) => [tool.id, tool]));
  for (const tool of data.tools) {
    const rows = comparisonRows([tool]);
    const values = rows.map(([, [value]]) => value);
    assert.equal(new Set(values).size, values.length,
      `${tool.id} renders the same text in two comparison rows: ${values.join(" | ")}`);
  }
  // The pairing that produced the original bug: free access falling through
  // to the pricing note, so the two rows read identically.
  const [freeAccess, pricing] = comparisonRows([byId.chatgpt])
    .filter(([label]) => label === "Free access & limits" || label === "Pricing");
  assert.notEqual(freeAccess[1][0], pricing[1][0]);
});

test("a row absent from every compared tool is dropped, not filled with apologies", () => {
  const withoutSetup = data.tools.filter((tool) => !tool.setup).slice(0, 3);
  assert.equal(withoutSetup.length, 3);
  const labels = comparisonRows(withoutSetup).map(([label]) => label);
  assert.ok(!labels.includes("Setup"));
  // Skill level is on every tool, so splitting it off setup keeps it shown.
  assert.ok(labels.includes("Skill level"));

  const withSetup = data.tools.find((tool) => tool.setup);
  const mixed = comparisonRows([withSetup, withoutSetup[0]]);
  const setup = mixed.find(([label]) => label === "Setup");
  assert.deepEqual(setup[1], [withSetup.setup, "Not recorded"]);
});

test("free access states the model when the catalog has no researched note", () => {
  const byModel = (model) => data.tools.find((tool) => tool.pricing.model === model && !tool.pricing.freeAccess);
  const read = (tool) => comparisonRows([tool]).find(([label]) => label === "Free access & limits")[1][0];
  assert.match(read(byModel("paid")), /No free tier/);
  assert.match(read(byModel("freemium")), /Free tier/);
  const researched = data.tools.find((tool) => tool.pricing.freeAccess);
  assert.equal(read(researched), researched.pricing.freeAccess);
});

test("the comparison renders the checked date the way the card does", () => {
  const tool = data.tools[0];
  const [, [shown]] = comparisonRows([tool]).find(([label]) => label === "Pricing checked");
  assert.notEqual(shown, tool.pricingChecked, "the raw ISO date reached the table");
  assert.match(shown, /\d{4}/);
});

test("reports prefill the selected tool and keep special characters encoded", () => {
  const tool = { ...data.tools[0], name: "Tool & Test?", id: "test" };
  const url = new URL(reportUrl(tool));
  assert.equal(url.pathname, "/wpasch/ToolMatch/issues/new");
  assert.equal(url.searchParams.get("title"), "Outdated information: Tool & Test?");
  assert.ok(url.searchParams.get("body").includes(tool.pricing.note));
  assert.ok(url.searchParams.get("body").includes("Source for the correction:"));
});

test("history pushes deliberate changes and replaces typing without destroying the preceding state", (t) => {
  const entries = ["https://example.test/?category=writing#directory"];
  let cursor = 0;
  globalThis.window = { location: { href: entries[0] } };
  globalThis.history = {
    pushState: (_, __, href) => { entries.splice(++cursor); entries.push(String(href)); window.location.href = String(href); },
    replaceState: (_, __, href) => { entries[cursor] = String(href); window.location.href = String(href); },
  };
  t.after(() => { delete globalThis.window; delete globalThis.history; });
  writeHistory("https://example.test/?filter=s#directory");
  writeHistory("https://example.test/?filter=slides#directory", "replace");
  writeHistory(window.location.href);
  assert.equal(entries.length, 2);
  assert.equal(directoryStateFromUrl(entries[0]).category, "writing");
  assert.equal(directoryStateFromUrl(entries[1]).query, "slides");
  const more = new URL(allMatchesUrl("https://example.test/sub/?category=writing&price=paid&q=resume", "slides & graphics"));
  assert.equal(more.pathname, "/sub/");
  assert.equal(more.searchParams.get("filter"), "slides & graphics");
  assert.equal(more.searchParams.has("price"), false);
  assert.equal(more.hash, "#directory");
});

// Revealing a shared card drops the filters from the page, so the address
// bar must stop advertising them — it described a state the page was no
// longer in, and that URL is the thing people paste to each other.
test("a revealed tool link sheds the filters it overrode", () => {
  const url = new URL(linkedToolUrl(
    "https://example.test/sub/?category=career&price=paid&filter=resume#directory", "chatgpt"));
  assert.equal(url.searchParams.get("tool"), "chatgpt");
  for (const dropped of ["category", "price", "filter"]) {
    assert.equal(url.searchParams.has(dropped), false, `${dropped} survived`);
  }
  // Subpath hosting and the fragment both have to come through intact.
  assert.equal(url.pathname, "/sub/");
  assert.equal(url.hash, "#directory");
  // And the state it leaves behind is what the page is actually showing.
  const state = directoryStateFromUrl(url.toString());
  assert.deepEqual([state.category, state.price, state.query], ["all", "any", ""]);
});
