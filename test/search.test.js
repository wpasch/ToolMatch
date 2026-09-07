import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildIndex, search } from "../js/search.js";

const data = JSON.parse(
  await readFile(new URL("../data/tools.json", import.meta.url), "utf8")
);
const labels = Object.fromEntries(data.categories.map(({ id, label }) => [id, label]));
const index = buildIndex(data.tools, labels);

function ids(query) {
  return search(index, query).map(({ id }) => id);
}

test("returns no confident result for empty, generic, or unknown requests", () => {
  assert.deepEqual(ids(""), []);
  assert.deepEqual(ids("create something"), []);
  assert.deepEqual(ids("quantum banana"), []);
});

test("ranks representative task specialists near the top", () => {
  assert.ok(ids("summarize long readings for class").slice(0, 4).includes("notebooklm"));
  assert.ok(ids("cite sources for a literature review").slice(0, 3).includes("elicit"));
  assert.ok(ids("make a powerpoint").slice(0, 4).includes("gamma"));
  assert.equal(ids("remove a photo background")[0], "photoroom");
  assert.equal(ids("transcribe a meeting")[0], "otter");
  assert.equal(ids("improve my resume")[0], "jobscan");
  assert.equal(ids("learn Spanish")[0], "duolingo");
  assert.equal(ids("generate music")[0], "suno");
});

test("understands spreadsheet and infographic phrasing", () => {
  assert.ok(ids("create a spreadsheet").includes("microsoft-copilot"));
  assert.ok(ids("create a spreadsheet").includes("zapier"));
  assert.ok(ids("make an infographic").slice(0, 4).includes("canva-magic"));
});

test("never exceeds the requested limit", () => {
  assert.equal(search(index, "write an essay", 2).length, 2);
});

test("an exact product name remains searchable", () => {
  assert.equal(ids("Make")[0], "make");
});
