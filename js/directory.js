// Everything that decides which tools are on screen: the category chips in
// the Categories section, the directory's own filters, and the hero search.

import { el, prefersReducedMotion } from "./dom.js";
import { renderInto } from "./cards.js";
import { buildIndex, rank } from "./search.js";

// ---------- Category chips ----------
export function renderCategories(data) {
  const list = document.getElementById("category-list");
  if (!list) return;

  const counts = {};
  for (const tool of data.tools) {
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }

  list.replaceChildren();
  for (const category of data.categories) {
    const link = el("a", null, category.label);
    link.href = "#directory";
    // dataset assigns a property, so an id containing quotes cannot escape
    // into the surrounding markup the way string concatenation allowed.
    link.dataset.category = category.id;
    link.append(el("span", null, String(counts[category.id] ?? 0)));

    const item = document.createElement("li");
    item.append(link);
    list.appendChild(item);
  }

  // Jumping from a category chip pre-selects that filter in the directory.
  list.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-category]");
    if (!link) return;
    // Matched by comparing values rather than building a selector string:
    // a category id with a quote in it would break the selector.
    const button = [...document.querySelectorAll(".filter")].find(
      (candidate) => candidate.dataset.category === link.dataset.category
    );
    button?.click();
  });
}

// ---------- Directory filters ----------
// The category chips and the text field narrow the same list, so they share
// one piece of state and one render. The field is a plain substring filter
// over what's on the card — the interpreting search is the one in the hero,
// and this only saves a trip back up to it.
export function initDirectory(data, labels) {
  const bar = document.getElementById("filters");
  const list = document.getElementById("directory-list");
  const empty = document.getElementById("directory-empty");
  if (!bar || !list || !empty) return;

  const form = document.getElementById("directory-search-form");
  const input = document.getElementById("directory-search");

  const counts = {};
  for (const tool of data.tools) {
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }

  const options = [
    { id: "all", label: `Everything (${data.tools.length})` },
    ...data.categories.map((c) => ({
      id: c.id,
      label: `${c.label} (${counts[c.id] ?? 0})`,
    })),
  ];

  bar.replaceChildren();
  options.forEach((option, i) => {
    const button = el("button", "filter", option.label);
    button.type = "button";
    button.dataset.category = option.id;
    button.setAttribute("aria-pressed", String(i === 0));
    bar.appendChild(button);
  });

  // Built once. Re-joining every tool's text on every keystroke would be
  // a hundred string builds per character typed.
  const haystacks = new Map(
    data.tools.map((tool) => [
      tool,
      [
        tool.name,
        tool.tagline,
        tool.description,
        labels[tool.category] ?? tool.category,
        ...(tool.tags ?? []),
        ...(tool.useCases ?? []),
      ]
        .join(" ")
        .toLowerCase(),
    ])
  );

  let category = "all";

  // The filter belongs in the URL for the same reason the search query does:
  // "here are the writing tools" is a thing people send each other, and
  // without this every such link lands on the unfiltered list.
  function syncCategory() {
    const url = new URL(window.location.href);
    if (category === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    history.replaceState(null, "", url);
  }

  function apply() {
    const query = (input?.value ?? "").trim().toLowerCase();
    const shown = data.tools.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      return !query || haystacks.get(tool).includes(query);
    });

    renderInto(list, shown, labels, { anchors: true });
    empty.textContent = query
      ? "Nothing here matches that."
      : "No tools in that category yet.";
    empty.hidden = shown.length > 0;
  }

  // On a phone the chips are one horizontally scrolling row, so a chip
  // chosen from the Categories section may be off to the side. Scrolling
  // the row itself rather than calling scrollIntoView keeps the page where
  // it is.
  function revealFilter(button) {
    if (bar.scrollWidth <= bar.clientWidth) return;
    const left = button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2;
    bar.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  bar.addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;

    for (const other of bar.querySelectorAll(".filter")) {
      other.setAttribute("aria-pressed", String(other === button));
    }

    category = button.dataset.category;
    revealFilter(button);
    syncCategory();
    apply();
  });

  if (input) input.addEventListener("input", apply);
  // Nothing to submit — the list is already filtered as you type — but
  // Enter would otherwise reload the page.
  form?.addEventListener("submit", (event) => event.preventDefault());

  // ---------- Opening state from the URL ----------
  const params = new URL(window.location.href).searchParams;

  const requested = params.get("category");
  if (requested && requested !== "all") {
    const button = [...bar.querySelectorAll(".filter")].find(
      (candidate) => candidate.dataset.category === requested
    );
    // An unknown category in the URL is left alone rather than corrected:
    // the list simply renders unfiltered, which is what a stale link should
    // do. Clicking is what sets the pressed state and scrolls the row.
    if (button) button.click();
  }

  // ?tool=<id> opens the directory on one card with its details already
  // showing — a link to a single tool, on a site that has no per-tool page.
  const wanted = params.get("tool");
  if (wanted) {
    const card = document.getElementById(`tool-${wanted}`);
    if (card) {
      card.querySelector(".tool-card__toggle")?.click();
      card.classList.add("tool-card--linked");
      card.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    }
  }
}

// ---------- Hero search ----------
// Matching lives in js/search.js; this only wires the form to it.
export function initSearch(data, labels) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const results = document.getElementById("results");
  const resultsList = document.getElementById("results-list");
  const heading = results?.querySelector(".results__heading");
  const status = document.getElementById("search-status");
  if (!form || !input || !results || !resultsList || !heading) return;

  const index = buildIndex(data.tools, labels);

  function syncQuery(value) {
    const url = new URL(window.location.href);
    if (value.trim()) url.searchParams.set("q", value.trim());
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }

  // Renders the panel. `move` is what separates the two ways this is called:
  // submitting is a deliberate act and the page should travel to the answer,
  // but re-typing while the answer is already on screen should not yank the
  // page around under the cursor.
  function showResults({ move }) {
    const ranked = rank(index, input.value, 6, labels);
    syncQuery(input.value);

    // Nothing usable typed at all — send them to the directory rather than
    // showing an empty results panel.
    if (ranked.length === 0 && input.value.trim() === "") {
      if (move) document.getElementById("directory").scrollIntoView();
      results.hidden = true;
      return;
    }

    results.hidden = false;

    if (ranked.length === 0) {
      heading.textContent = "No match for that yet";
      resultsList.replaceChildren(
        el(
          "li",
          "tool-list__empty",
          "Try describing the task differently, or browse the full directory below."
        )
      );
      if (status) status.textContent = "No matching tools found.";
    } else {
      heading.textContent = `${ranked.length} tools for that`;
      renderInto(
        resultsList,
        ranked.map((row) => row.tool),
        labels,
        { reasons: new Map(ranked.map((row) => [row.tool, row.reason])) }
      );
      if (status) status.textContent = `${ranked.length} matching tools found.`;
    }

    if (move) {
      heading.focus({ preventScroll: true });
      results.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showResults({ move: true });
  });

  // Typing does nothing until there is a panel to update. Live-matching from
  // the first keystroke would push a results panel onto someone halfway
  // through a sentence; once they have asked and the panel is open, watching
  // it narrow as they add a word is the whole point.
  let pending;
  input.addEventListener("input", () => {
    if (results.hidden) return;
    clearTimeout(pending);
    pending = setTimeout(() => showResults({ move: false }), 200);
  });

  // ---------- Example queries ----------
  // An empty box asking someone to describe their task is the moment they
  // freeze. These are real queries with real answers, and clicking one runs
  // it — they are a demonstration of what the box wants, not decoration.
  document.getElementById("search-examples")?.addEventListener("click", (event) => {
    const example = event.target.closest("[data-query]");
    if (!example) return;
    input.value = example.dataset.query;
    showResults({ move: true });
  });

  const initialQuery = new URL(window.location.href).searchParams.get("q");
  if (initialQuery) {
    input.value = initialQuery;
    showResults({ move: true });
  }
}
