import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildIndex, rank, search } from "../js/search.js";

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

// Every category has to be reachable by describing the task, not by knowing
// the category exists. CONCEPTS is a hand-maintained map from how people
// phrase things to where the catalog keeps them, and the failure mode is
// silent: a category nobody wrote a phrase for simply never surfaces, and
// nothing about the site looks broken. These are the phrases a person would
// actually type, one per category, checked against where they should land.
const PHRASINGS = {
  "chat-assistant": ["an AI chatbot to ask questions", "brainstorm ideas with an assistant"],
  writing: ["proofread my essay", "make my writing clearer"],
  coding: ["help me debug this function", "build a website"],
  research: ["find sources for my literature review", "read academic papers"],
  image: ["generate an illustration", "remove a photo background"],
  design: ["design a poster", "make a logo for my brand"],
  presentations: ["make a slide deck", "build a pitch presentation"],
  "audio-video": ["edit a video", "generate a voiceover"],
  productivity: ["organize my notes", "keep track of my projects"],
  meetings: ["transcribe a lecture", "take notes in a call"],
  learning: ["help me study for an exam", "explain calculus to me"],
  career: ["improve my resume", "practice for an interview"],
  automation: ["automate a workflow", "connect two apps together"],
};

test("every category is reachable from how someone would describe the task", () => {
  const missing = Object.keys(labels).filter((id) => !PHRASINGS[id]);
  assert.deepEqual(missing, [], "a category has no phrasing to reach it by");

  for (const [category, phrases] of Object.entries(PHRASINGS)) {
    for (const phrase of phrases) {
      const found = search(index, phrase).filter(
        (tool) => tool.category === category
      );
      assert.ok(
        found.length > 0,
        `"${phrase}" surfaces nothing from ${category} — CONCEPTS has a gap`
      );
    }
  }
});

test("results say which of the searcher's words they matched", () => {
  const [top] = rank(index, "transcribe a meeting", 1, labels);
  assert.equal(top.tool.id, "otter");
  assert.match(top.reason, /“transcribe”/);

  // Words are quoted as typed. The index folds "slides" to "slide" so the
  // two are one token, but quoting the stem back reads like a correction.
  const slides = rank(index, "make some slides", 3, labels);
  assert.ok(slides.some(({ reason }) => reason.includes("“slides”")));

  // A tool can be right without sharing any vocabulary with the query, and
  // when that happens the reason says so rather than inventing a word match.
  const byCategory = rank(index, "revise my essay", 6, labels).filter(
    ({ reason }) => reason.includes("the category your wording points at")
  );
  assert.ok(byCategory.length > 0);
  assert.ok(
    byCategory.every(({ tool, reason }) => reason.startsWith(labels[tool.category])),
    "a category explanation must name that tool's own category"
  );
});

test("a result with no explanation is never shown", () => {
  // Not a spot check. A tool can clear MIN_SCORE on inferred terms alone —
  // a concept's `also` word landing on a product name scores 4.8 without the
  // searcher having typed anything that matched — and that path produced an
  // empty reason. Every phrase the reachability test uses is swept here, so
  // the invariant is held across the whole concept map rather than the three
  // queries someone thought to check.
  // Every word that appears anywhere in the catalog's prose, not just the
  // phrases above: the three cases that first exposed this — "spreadsheet",
  // "excel", "workspace" — were all single words nobody would have thought
  // to add to a list by hand.
  const vocabulary = new Set();
  for (const tool of data.tools) {
    const prose = [tool.name, tool.tagline, tool.description, ...tool.useCases].join(" ");
    for (const word of prose.toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (word.length > 2) vocabulary.add(word);
    }
  }

  const queries = [...Object.values(PHRASINGS).flat(), ...vocabulary];
  for (const query of queries) {
    for (const row of rank(index, query, 6, labels)) {
      assert.notEqual(row.reason, "", `${row.tool.id} matched "${query}" for no stated reason`);
    }
  }
});
