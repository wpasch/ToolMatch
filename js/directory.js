// Everything that decides which tools are on screen: the category chips in
// the Categories section, the directory's own filters, and the hero search.

import { el, prefersReducedMotion } from "./dom.js";
import { renderCatalogInto, renderInto } from "./cards.js";
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
// Both search fields use the same task matching and budget constraints.
const VALID_PRICE_FILTERS = new Set(["any", "free", "paid"]);

export function normalizePriceFilter(value) {
  return VALID_PRICE_FILTERS.has(value) ? value : "any";
}

export function directoryStateFromUrl(href) {
  const params = new URL(href).searchParams;
  return {
    category: params.get("category") || "all",
    price: normalizePriceFilter(params.get("price") || "any"),
    query: params.get("filter") || "",
  };
}

// How many tools each category would show at a given price. The chips are a
// promise about what a click produces, so they have to be counted under the
// same filter the click will apply.
export function countByCategory(tools, price = "any") {
  const wanted = normalizePriceFilter(price);
  const counts = {};
  for (const tool of tools) {
    const model = tool.pricing?.model;
    if (wanted === "free" && model === "paid") continue;
    if (wanted === "paid" && model !== "paid") continue;
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }
  return counts;
}

export function filterDirectoryTools(
  tools,
  { category = "all", price = "any", query = "" } = {},
  labels = {},
  index
) {
  const wantedPrice = normalizePriceFilter(price);
  const matched = query.trim()
    ? rank(index ?? buildIndex(tools, labels), query, tools.length, labels).map((row) => row.tool)
    : tools;
  return matched.filter((tool) =>
    (category === "all" || tool.category === category) &&
    (wantedPrice !== "free" || tool.pricing?.model !== "paid") &&
    (wantedPrice !== "paid" || tool.pricing?.model === "paid")
  );
}

// Facet counts answer what selecting each option would show, retaining the
// other filters. In particular, text matching applies to every count.
export function directoryCounts(tools, state, labels = {}, index) {
  const matched = filterDirectoryTools(tools, { query: state.query }, labels, index);
  const categories = countByCategory(matched, state.price);
  const inCategory = matched.filter((tool) => state.category === "all" || tool.category === state.category);
  const free = inCategory.filter((tool) => tool.pricing?.model !== "paid").length;
  return {
    categories,
    total: Object.values(categories).reduce((sum, n) => sum + n, 0),
    prices: { any: inCategory.length, free, paid: inCategory.length - free },
  };
}

export function directoryUrl(href, { category, price, query }) {
  const url = new URL(href);
  for (const [key, value] of Object.entries({
    category: category === "all" ? "" : category,
    price: price === "any" ? "" : price,
    filter: query.trim(),
  })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  url.searchParams.delete("tool");
  return url.toString();
}

export function initDirectory(data, labels) {
  const bar = document.getElementById("filters");
  const priceBar = document.getElementById("price-filters");
  const list = document.getElementById("directory-list");
  const empty = document.getElementById("directory-empty");
  const emptyText = document.getElementById("directory-empty-text");
  const status = document.getElementById("directory-status");
  const input = document.getElementById("directory-search");
  const clear = document.getElementById("directory-clear");
  if (!bar || !list || !empty || !input || !priceBar) return;
  const index = buildIndex(data.tools, labels);
  let state = directoryStateFromUrl(window.location.href);
  if (!data.categories.some((c) => c.id === state.category)) state.category = "all";
  input.value = state.query;

  function buttons(container, options, key) {
    container.replaceChildren();
    for (const [id, label] of options) {
      const button = el("button", "filter", label);
      button.type = "button";
      button.dataset[key] = id;
      button.dataset.label = label;
      container.append(button);
    }
  }
  buttons(bar, [["all", "Everything"], ...data.categories.map((c) => [c.id, c.label])], "category");
  buttons(priceBar, [["any", "Any price"], ["free", "Free to start"], ["paid", "Paid only"]], "price");

  function apply({ sync = true } = {}) {
    state.query = input.value;
    const shown = filterDirectoryTools(data.tools, state, labels, index);
    const counts = directoryCounts(data.tools, state, labels, index);
    for (const button of bar.children) {
      const id = button.dataset.category;
      const count = id === "all" ? counts.total : counts.categories[id] ?? 0;
      button.textContent = `${button.dataset.label} (${count})`;
      button.setAttribute("aria-pressed", String(id === state.category));
      // Keep empty options available: changing another filter can recover.
    }
    for (const button of priceBar.children) {
      const id = button.dataset.price;
      button.textContent = `${button.dataset.label} (${counts.prices[id]})`;
      button.setAttribute("aria-pressed", String(id === state.price));
    }
    renderCatalogInto(list, shown, labels, data.categories, { anchors: true });
    empty.hidden = shown.length > 0;
    if (emptyText) emptyText.textContent = state.query.trim()
      ? `No tools match “${state.query.trim()}” with these filters.`
      : "No tools match these filters.";
    if (status) status.textContent = `Showing ${shown.length} of ${data.tools.length} tools`;
    if (clear) clear.disabled = state.category === "all" && state.price === "any" && !state.query;
    if (sync) history.replaceState(null, "", directoryUrl(window.location.href, state));
  }
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    apply();
    if (bar.scrollWidth > bar.clientWidth) {
      bar.scrollTo({ left: button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2,
        behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  });
  priceBar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-price]");
    if (!button) return;
    state.price = button.dataset.price;
    apply();
  });
  input.addEventListener("input", () => apply());
  document.getElementById("directory-search-form")?.addEventListener("submit", (event) => event.preventDefault());
  function reset() {
    state = { category: "all", price: "any", query: "" };
    input.value = "";
    apply();
    input.focus({ preventScroll: true });
  }
  clear?.addEventListener("click", reset);
  document.getElementById("directory-empty-clear")?.addEventListener("click", reset);
  document.getElementById("directory-task-search")?.addEventListener("click", (event) => {
    event.preventDefault();
    const heroInput = document.getElementById("search-input");
    heroInput.value = input.value;
    heroInput.focus({ preventScroll: true });
    document.getElementById("search-form").scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center",
    });
  });
  apply({ sync: false });

  // A shared tool takes precedence over filters that would hide it.
  const wanted = new URL(window.location.href).searchParams.get("tool");
  if (wanted && data.tools.some((tool) => tool.id === wanted)) {
    if (!document.getElementById(`tool-${wanted}`)) {
      state = { category: "all", price: "any", query: "" };
      input.value = "";
      apply({ sync: false });
    }
    const card = document.getElementById(`tool-${wanted}`);
    card.querySelector(".tool-card__toggle")?.click();
    card.classList.add("tool-card--linked");
    card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  } else if (window.location.hash === "#directory") {
    document.getElementById("directory").scrollIntoView({ behavior: "instant", block: "start" });
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

  // Ranking and rendering, separated from reading the box, so the page can
  // land on an example already answered without pretending anyone typed it.
  //
  // `move`: submitting is a deliberate act and the page should travel to the
  // answer, but re-typing while the answer is on screen should not yank the
  // page around under the cursor.
  // `sync` and `announce`: an answer nobody asked for does not belong in the
  // URL, and must not interrupt a screen reader.
  function renderPanel(query, { move = false, sync = true, announce = true, limit = 6, example = false } = {}) {
    const ranked = rank(index, query, limit, labels);
    if (sync) syncQuery(query);

    // Nothing usable typed at all — send them to the directory rather than
    // showing an empty results panel.
    if (ranked.length === 0 && query.trim() === "") {
      if (move) document.getElementById("directory").scrollIntoView();
      results.hidden = true;
      return 0;
    }

    results.hidden = false;
    const label = document.getElementById("results-label");
    if (label) label.textContent = example ? "Example matches" : "Matches";

    if (ranked.length === 0) {
      heading.textContent = "No match for that yet";
      resultsList.replaceChildren(
        el(
          "li",
          "tool-list__empty",
          "Try describing the task differently, or browse the full directory below."
        )
      );
      if (status && announce) status.textContent = "No matching tools found.";
    } else {
      // Quoting the query rather than saying "for that": the panel is on
      // screen before anyone has typed, so it has to name what it answered.
      heading.textContent = `${ranked.length} tools for \u201c${query.trim()}\u201d`;
      renderInto(
        resultsList,
        ranked.map((row) => row.tool),
        labels,
        { reasons: new Map(ranked.map((row) => [row.tool, row.reason])) }
      );
      if (status && announce) status.textContent = `${ranked.length} matching tools found.`;
    }

    if (move) {
      heading.focus({ preventScroll: true });
      results.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    }

    return ranked.length;
  }

  function showResults({ move }) {
    renderPanel(input.value, { move });
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
  } else {
    // Nothing asked yet. This panel sits between the hero and the categories
    // and stayed empty until someone typed, which meant the page never once
    // showed the thing it promises — a task in, a short list out. It lands on
    // a real answer instead: ranked live, not typed into the box, absent from
    // the URL, unannounced, and replaced the moment anyone asks their own
    // question. The query is read from the first example in the hero so the
    // answer on screen always belongs to a question also on screen.
    const firstExample = document.querySelector("#search-examples [data-query]");
    if (firstExample) {
      renderPanel(firstExample.dataset.query, {
        move: false,
        sync: false,
        announce: false,
        // Three, not the usual six. A full answer is what someone gets for
        // asking; this one is unasked for, and six cards ran to three phone
        // screens before the page reached the categories. Three fills one
        // row on a wide screen and still makes the point on a narrow one.
        limit: 3,
        example: true,
      });
    }
  }
}
