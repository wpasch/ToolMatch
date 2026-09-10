import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildIndex, queryBudget, rank, search } from "../js/search.js";

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
  assert.ok(ids("make a powerpoint").slice(0, 4).includes("plus-ai"));
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

test("budget requests filter eligibility without losing task relevance", () => {
  for (const query of ["free presentation tools", "presentation tools without paying", "no budget for slides"]) {
    const found = search(index, query);
    assert.ok(found.some((tool) => tool.id === "gamma"));
    assert.ok(found.every((tool) => tool.pricing.model !== "paid"));
  }
  const paid = search(index, "paid only presentation tools");
  assert.ok(paid.length > 0);
  assert.ok(paid.every((tool) => tool.pricing.model === "paid"));
  assert.ok(search(index, "free tools").every((tool) => tool.pricing.model !== "paid"));
});

test("partial product names and meaningful short terms find tools", () => {
  assert.equal(ids("chatg")[0], "chatgpt");
  assert.equal(ids("gramm")[0], "grammarly");
  assert.equal(ids("v0")[0], "v0");
  assert.ok(search(index, "CV").some((tool) => tool.category === "career"));
  assert.deepEqual(ids("a"), []);
});

test("mixed-price and licensing language do not accidentally restrict costs", () => {
  for (const phrase of ["free or paid", "paid or free", "free and paid", "not necessarily free"]) {
    const query = `presentation tools, ${phrase}`;
    assert.equal(queryBudget(query).price, "any");
    assert.ok(search(index, query, 107).some((tool) => tool.pricing.model === "paid"));
  }
  assert.equal(queryBudget("royalty-free music").price, "any");
  assert.equal(queryBudget("free royalty-free music generator").price, "free");
  assert.ok(search(index, "free royalty-free music generator", 107).every((tool) => tool.pricing.model !== "paid"));
});

test("specific tasks dominate generic AI words and weak matches are excluded", () => {
  assert.deepEqual(ids("AI launcher"), ["raycast"]);
  assert.deepEqual(ids("free AI launcher"), []);
  const slides = search(index, "make a slide deck", 107);
  assert.ok(slides.some((tool) => tool.id === "gamma"));
  assert.ok(!slides.some((tool) => ["windsurf", "suno", "grammarly"].includes(tool.id)));
});

test("free matching respects known feature restrictions without excluding the free core app", () => {
  assert.ok(ids("free Raycast").includes("raycast"));
  assert.ok(!ids("free Raycast AI").includes("raycast"));
  assert.ok(!search(index, "free AI resume tools", 107).some((tool) => ["teal", "huntr"].includes(tool.id)));
  assert.ok(search(index, "free resume tools", 107).some((tool) => tool.id === "teal"));
});

// Two words carry a student meaning and an academic one, and the catalog
// serves both. These pin each direction, because the fix for one is exactly
// the thing that could break the other.
test("study and review route by context rather than to one fixed category", () => {
  const learning = (query) => {
    const top = search(index, query).slice(0, 3).map(({ id }) => id);
    const categories = top.map((id) => data.tools.find((t) => t.id === id).category);
    return { top, categories };
  };
  for (const query of ["study for finals", "study for a test", "review before midterms"]) {
    assert.ok(learning(query).categories.includes("learning"),
      `"${query}" returned no study tool: ${learning(query).top.join(", ")}`);
  }
  // The same two words, used academically, must still reach the papers.
  for (const query of ["literature review", "review the literature", "do a systematic review"]) {
    assert.equal(learning(query).categories[0], "research",
      `"${query}" left the research tools: ${learning(query).top.join(", ")}`);
  }
  // And "review my essay" is neither: it is someone asking for an editor.
  assert.ok(!learning("review my essay").categories.includes("research"));
});

test("translate reaches the tools that translate, not a passing noun", () => {
  const translators = new Set(["qwen-chat", "notta", "heygen", "veed"]);
  for (const query of ["translate a document", "translate text", "translate to spanish", "translate a video"]) {
    const top = ids(query).slice(0, 3);
    const category = (id) => data.tools.find((t) => t.id === id).category;
    assert.ok(top.some((id) => translators.has(id) || category(id) === "chat-assistant"),
      `"${query}" returned nothing that translates: ${top.join(", ")}`);
    assert.ok(!top.includes("presentations-ai"),
      `"${query}" still returns a presentation builder`);
  }
  // A translate query must not drag the whole chat category over a listing
  // that names the job outright.
  assert.ok(ids("translate a video").slice(0, 2).every((id) => translators.has(id)));
});
