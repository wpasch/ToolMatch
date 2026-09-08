// Task matching for the hero search.
//
// The catalog is 108 hand-checked tools, not a web index, so this leans on a
// curated vocabulary rather than anything statistical. Three deliberate
// choices:
//
//   1. Tokens, not substrings. `"art"` should not match "start" or "chart".
//   2. Plural folding, so "slides" and "slide" are the same word.
//   3. A concept map, because people describe a task in words the catalog
//      never uses — nothing in QuillBot's entry says "revise".

const STOPWORDS = new Set([
  "a", "about", "an", "and", "any", "are", "as", "at", "be", "best",
  "build", "can", "create", "do", "does", "for", "from", "get", "good",
  "help", "how", "i",
  "in", "is", "it", "me", "my", "need", "of", "on", "or", "some", "that",
  "the", "there", "to", "want", "was", "what", "which", "with", "you",
  "your",
]);

// User phrasing on the left, where it should point on the right. `also`
// terms are folded into the query so they can match a tool's own wording
// even when the searcher never used those words.
const CONCEPTS = [
  {
    when: ["essay", "paper", "thesis", "report", "draft", "write", "writing",
      "revise", "revision", "rewrite", "proofread", "grammar", "spelling",
      "paraphrase", "reword", "tone", "concise", "clearer", "edit", "editing"],
    categories: ["writing"],
    also: ["draft", "edit", "grammar", "writing"],
  },
  {
    when: ["slide", "deck", "presentation", "present", "pitch", "powerpoint",
      "keynote", "slideshow"],
    categories: ["presentations"],
    also: ["slide", "deck", "presentation"],
  },
  {
    when: ["spreadsheet", "excel"],
    categories: [],
    also: ["spreadsheet", "excel", "formula", "data"],
  },
  {
    when: ["cite", "citation", "source", "reference", "bibliography",
      "research", "study", "reading", "literature", "review", "journal",
      "academic"],
    categories: ["research"],
    also: ["source", "citation", "research", "paper"],
  },
  {
    when: ["code", "coding", "program", "programming", "debug", "bug",
      "function", "script", "app", "website", "developer", "dev", "test",
      "refactor", "frontend", "backend"],
    categories: ["coding"],
    also: ["code", "build", "app"],
  },
  {
    when: ["image", "picture", "photo", "art", "illustration", "logo",
      "graphic", "infographic", "poster", "flyer", "visual", "thumbnail", "mockup",
      "design", "brand"],
    categories: ["image", "design"],
    also: ["image", "design", "generate", "graphic"],
  },
  {
    when: ["video", "audio", "voice", "podcast", "narrate", "narration",
      "dub", "music", "sound", "clip", "subtitle", "caption", "speech"],
    categories: ["audio-video"],
    also: ["video", "audio", "voice"],
  },
  {
    when: ["meeting", "lecture", "call", "transcript", "transcribe",
      "minutes", "recording", "standup", "interview"],
    categories: ["meetings"],
    also: ["meeting", "transcribe", "note"],
  },
  {
    when: ["note", "organize", "organise", "task", "todo", "project",
      "workspace", "summarize", "summarise", "summary",
      "recap", "condense", "shorten"],
    categories: ["productivity", "research"],
    also: ["note", "summarize", "organize", "document"],
  },
  {
    when: ["math", "maths", "homework", "solve", "equation", "calculus",
      "algebra", "statistics", "learn", "tutor", "practice", "quiz",
      "flashcard", "revise", "exam", "explain", "concept"],
    categories: ["learning"],
    also: ["solve", "explain", "practice", "step"],
  },
  {
    when: ["resume", "cv", "job", "interview", "career", "application",
      "cover", "hiring", "recruiter", "posting", "linkedin"],
    categories: ["career"],
    also: ["resume", "job", "interview"],
  },
  {
    when: ["automate", "automation", "workflow", "integrate", "integration",
      "agent", "sync", "trigger", "connect", "pipeline"],
    categories: ["automation"],
    also: ["automate", "sync", "workflow"],
  },
  {
    when: ["chat", "assistant", "ask", "question", "brainstorm", "idea",
      "chatbot", "conversation"],
    categories: ["chat-assistant"],
    also: ["brainstorm", "explain", "draft"],
  },
];

// Fold regular plurals so "slides" and "slide" are one token. Deliberately
// not a real stemmer: on a catalog this size an over-eager one does more
// damage than it prevents ("coding" and "code" are worth conflating,
// "codes" and "coda" are not).
function foldPlural(word) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// tokenize() with the folding removed. The two split identically, so the
// nth token of one is the nth word of the other.
function rawWords(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean)
    .map(foldPlural);
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

// A product name is the strongest intentional signal. After that, fields are
// weighted by how directly they answer "what am I trying to do."
const FIELDS = [
  ["name", 12],
  ["useCases", 6],
  ["tagline", 3],
  ["category", 3],
  ["tags", 2],
  ["description", 1],
];

// Tokenising 108 tools on every keystroke would be wasteful, so the index is
// built once when the catalog loads.
export function buildIndex(tools, categoryLabels) {
  return tools.map((tool) => ({
    tool,
    category: tool.category,
    // The site's own bar for inclusion: usable with no budget, no prior
    // setup. Used only to break ties between equally relevant tools.
    free: tool.pricing.model !== "paid",
    beginner: tool.skillLevel === "beginner",
    fields: {
      useCases: tokenSet(tool.useCases.join(" ")),
      name: tokenSet(tool.name),
      tagline: tokenSet(tool.tagline),
      category: tokenSet(categoryLabels[tool.category] ?? ""),
      tags: tokenSet(tool.tags.join(" ")),
      description: tokenSet(tool.description),
    },
  }));
}

// Terms that came from a concept rather than the searcher count for less:
// they are an inference about what was meant, not evidence of it.
const INFERRED_WEIGHT = 0.4;

// How much a single supporting word is worth when it points at a category.
const CATEGORY_WEIGHT = 4;

// A single incidental mention in a long description is not enough to call
// something a recommendation. Names, categories, tags, and use cases all clear
// this bar; a description needs corroborating evidence from another field.
const MIN_SCORE = 3;

// Turn what someone typed into the terms to match on, plus how strongly the
// phrasing points at each category.
function readQuery(query) {
  const typed = new Set();
  // Folding is what makes "slides" and "slide" one token, but an explanation
  // that quotes the stem back at someone who typed the plural reads like a
  // typo. The original spelling is kept alongside for that.
  const spelling = new Map();
  for (const [index, word] of tokenize(query).entries()) {
    if (word.length <= 2 || STOPWORDS.has(word)) continue;
    typed.add(word);
    if (!spelling.has(word)) spelling.set(word, rawWords(query)[index] ?? word);
  }

  const inferred = new Set();
  const categoryScore = new Map();

  for (const concept of CONCEPTS) {
    // Matched against what was typed only. Testing against the growing set
    // would let one concept's inferred words trigger the next one, and a
    // single vague word could cascade across half the catalog.
    const support = concept.when.filter((word) =>
      typed.has(foldPlural(word))
    ).length;
    if (support === 0) continue;

    // Scaled by how many words back it up, so an ambiguous term carries
    // less than a phrase that agrees with itself. "revise my essay" backs
    // writing twice and learning once; "revise for my exam" reverses that.
    for (const category of concept.categories) {
      const previous = categoryScore.get(category) ?? 0;
      categoryScore.set(category, Math.max(previous, support));
    }
    for (const word of concept.also) {
      const folded = foldPlural(word);
      if (!typed.has(folded)) inferred.add(folded);
    }
  }

  return { typed, inferred, categoryScore, spelling };
}

function matchTerms(entry, terms, multiplier) {
  let score = 0;
  for (const term of terms) {
    for (const [field, weight] of FIELDS) {
      if (entry.fields[field].has(term)) score += weight * multiplier;
    }
  }
  return score;
}

function scoreEntry(entry, typed, inferred, categoryScore) {
  let score =
    matchTerms(entry, typed, 1) + matchTerms(entry, inferred, INFERRED_WEIGHT);

  // A tool in a category the phrasing pointed at is relevant even when it
  // shares no vocabulary with the query.
  const support = categoryScore.get(entry.category) ?? 0;
  score += support * CATEGORY_WEIGHT;

  return score;
}

// Why this tool is on the list, in the searcher's own words.
//
// A ranked list with no reasoning attached asks to be taken on faith, and six
// results that arrive without explanation are indistinguishable from six
// results picked at random. This says which of their words landed — and, when
// none did, admits that the match came from the category their phrasing
// pointed at rather than from any word they used.
function explain(entry, typed, inferred, categoryScore, spelling, categoryLabels) {
  // Ordered by the strongest field each word reached, not by where it fell in
  // the sentence: "make some slides" matches Gamma on both words, but "slides"
  // is why it is a presentation tool and "make" is a verb that appears in half
  // the catalog's prose.
  const landed = (terms) =>
    [...terms]
      .map((term) => ({
        term,
        weight: Math.max(
          0,
          ...FIELDS.filter(([field]) => entry.fields[field].has(term)).map(([, w]) => w)
        ),
      }))
      .filter((row) => row.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((row) => spelling.get(row.term) ?? row.term);

  const matched = landed(typed);

  if (matched.length > 0) {
    // Two is enough to show the reasoning; a list of five reads as noise.
    const shown = matched.slice(0, 2).map((word) => `“${word}”`);
    return `Matches ${shown.join(" and ")}`;
  }

  if ((categoryScore.get(entry.category) ?? 0) > 0) {
    const label = categoryLabels?.[entry.category] ?? entry.category;
    return `${label} — the category your wording points at`;
  }

  // Everything left here scored on inferred terms alone: a word the concept
  // map folded in, on a concept that points at no category. "spreadsheet"
  // reaches Wolfram Alpha entirely through "formula", a word the searcher
  // never typed. Naming the word and admitting it was inferred is the only
  // honest version — the alternative was an empty line under the card, which
  // is how this path went unnoticed.
  const implied = landed(inferred);
  if (implied.length > 0) {
    return `Matches “${implied[0]}”, which your task implies`;
  }

  return "";
}

// The ranking itself. `search` is the plain form of this; `rank` is the one
// that also says why, and both walk the catalog exactly once.
export function rank(index, query, limit = 6, categoryLabels) {
  const { typed, inferred, categoryScore, spelling } = readQuery(query);
  if (typed.size === 0) return [];

  return index
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, typed, inferred, categoryScore),
    }))
    .filter((row) => row.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Same relevance: prefer what a broke student can actually open.
        Number(b.entry.free) - Number(a.entry.free) ||
        Number(b.entry.beginner) - Number(a.entry.beginner) ||
        a.entry.tool.name.localeCompare(b.entry.tool.name)
    )
    .slice(0, limit)
    .map((row) => ({
      tool: row.entry.tool,
      reason: explain(row.entry, typed, inferred, categoryScore, spelling, categoryLabels),
    }));
}

export function search(index, query, limit = 6) {
  return rank(index, query, limit).map((row) => row.tool);
}
