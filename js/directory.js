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
const VALID_PRICE_FILTERS = new Set(["any", "free", "paid"]);

export function normalizePriceFilter(value) {
  return VALID_PRICE_FILTERS.has(value) ? value : "any";
}

export function directoryStateFromUrl(href) {
  const params = new URL(href).searchParams;
  return {
    category: params.get("category") || "all",
    price: normalizePriceFilter(params.get("price") || "any"),
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

function searchableText(tool, labels) {
  return [
    tool.name,
    tool.tagline,
    tool.description,
    labels[tool.category] ?? tool.category,
    ...(tool.tags ?? []),
    ...(tool.useCases ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterDirectoryTools(
  tools,
  { category = "all", price = "any", query = "" } = {},
  labels = {},
  haystacks
) {
  const wantedPrice = normalizePriceFilter(price);
  const wantedText = query.trim().toLowerCase();

  return tools.filter((tool) => {
    if (category !== "all" && tool.category !== category) return false;
    const model = tool.pricing?.model;
    if (wantedPrice === "free" && model === "paid") return false;
    if (wantedPrice === "paid" && model !== "paid") return false;
    const haystack = haystacks?.get(tool) ?? searchableText(tool, labels);
    return !wantedText || haystack.includes(wantedText);
  });
}

export function initDirectory(data, labels) {
  const bar = document.getElementById("filters");
  const list = document.getElementById("directory-list");
  const empty = document.getElementById("directory-empty");
  if (!bar || !list || !empty) return;

  const form = document.getElementById("directory-search-form");
  const input = document.getElementById("directory-search");

  const options = [
    { id: "all", label: "Everything" },
    ...data.categories.map((c) => ({ id: c.id, label: c.label })),
  ];

  bar.replaceChildren();
  options.forEach((option, i) => {
    const button = el("button", "filter", option.label);
    button.type = "button";
    button.dataset.category = option.id;
    // The count is rewritten whenever the price filter moves, so the label
    // it is appended to has to survive as its own value.
    button.dataset.label = option.label;
    button.setAttribute("aria-pressed", String(i === 0));
    bar.appendChild(button);
  });

  // Cost, as a filter rather than something to notice on each card. The
  // catalog's bar for inclusion is "usable with no budget", and the tools
  // that miss it are a minority worth being able to hide outright.
  const priceBar = document.getElementById("price-filters");

  if (priceBar) {
    const freeTotal = data.tools.filter((t) => t.pricing?.model !== "paid").length;
    const priceOptions = [
      { id: "any", label: `Any price (${data.tools.length})` },
      { id: "free", label: `Free to start (${freeTotal})` },
      { id: "paid", label: `Paid only (${data.tools.length - freeTotal})` },
    ];
    priceBar.replaceChildren();
    priceOptions.forEach((option, i) => {
      const button = el("button", "filter", option.label);
      button.type = "button";
      button.dataset.price = option.id;
      button.setAttribute("aria-pressed", String(i === 0));
      priceBar.appendChild(button);
    });

    priceBar.addEventListener("click", (event) => {
      const button = event.target.closest(".filter");
      if (!button) return;
      for (const other of priceBar.querySelectorAll(".filter")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      price = button.dataset.price;
      relabelCategories();
      syncPrice();
      apply();
    });
  }

  // Built once. Re-joining every catalog entry's text on every keystroke
  // would repeat the same work for each character typed.
  const haystacks = new Map(data.tools.map((tool) => [tool, searchableText(tool, labels)]));

  let category = "all";
  let price = "any";

  // The chips ship without counts in their markup and get them here, from
  // the same function the price filter calls, so there is one place that
  // decides what a chip claims.
  relabelCategories();

  // The filter belongs in the URL for the same reason the search query does:
  // "here are the writing tools" is a thing people send each other, and
  // without this every such link lands on the unfiltered list.
  function syncCategory() {
    const url = new URL(window.location.href);
    if (category === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    history.replaceState(null, "", url);
  }

  function syncPrice() {
    const url = new URL(window.location.href);
    if (price === "any") url.searchParams.delete("price");
    else url.searchParams.set("price", price);
    history.replaceState(null, "", url);
  }

  // A chip reading "Chat Assistants (10)" that lands on an empty list is
  // worse than no count at all, and under "Paid only" five of them did
  // exactly that. The counts follow the price filter, and a chip that would
  // come up empty stops being clickable — except the one already pressed,
  // since disabling that would strand you on the empty list it produced.
  function relabelCategories() {
    const counts = countByCategory(data.tools, price);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    for (const button of bar.querySelectorAll(".filter")) {
      const id = button.dataset.category;
      const shown = id === "all" ? total : (counts[id] ?? 0);
      button.textContent = `${button.dataset.label} (${shown})`;
      button.disabled = shown === 0 && button.getAttribute("aria-pressed") !== "true";
    }
  }

  function apply() {
    const query = (input?.value ?? "").trim().toLowerCase();
    const shown = filterDirectoryTools(data.tools, { category, price, query }, labels, haystacks);

    renderInto(list, shown, labels, { anchors: true });
    empty.textContent = query
      ? "Nothing here matches that."
      : price === "any"
        ? "No tools in that category yet."
        : "Nothing in that category at that price.";
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
  const openingState = directoryStateFromUrl(window.location.href);

  const requested = openingState.category;
  if (requested && requested !== "all") {
    const button = [...bar.querySelectorAll(".filter")].find(
      (candidate) => candidate.dataset.category === requested
    );
    // An unknown category in the URL is left alone rather than corrected:
    // the list simply renders unfiltered, which is what a stale link should
    // do. Clicking is what sets the pressed state and scrolls the row.
    if (button) button.click();
  }

  const wantedPrice = openingState.price;
  if (wantedPrice !== "any" && priceBar) {
    const button = [...priceBar.querySelectorAll(".filter")].find(
      (candidate) => candidate.dataset.price === wantedPrice
    );
    if (button) button.click();
  }

  // ?tool=<id> opens the directory on one card with its details already
  // showing — a link to a single tool, on a site that has no per-tool page.
  const wanted = new URL(window.location.href).searchParams.get("tool");
  if (wanted) {
    // The filters are how you browse; an id is a specific request, so it
    // wins. Without this a link like ?category=coding&tool=grammarly renders
    // the coding list and says nothing about the tool it was asked for.
    const inCatalog = data.tools.some((tool) => tool.id === wanted);
    if (inCatalog && !document.getElementById(`tool-${wanted}`)) {
      bar.querySelector('.filter[data-category="all"]')?.click();
      priceBar?.querySelector('.filter[data-price="any"]')?.click();
    }

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

  // Ranking and rendering, separated from reading the box, so the page can
  // land on an example already answered without pretending anyone typed it.
  //
  // `move`: submitting is a deliberate act and the page should travel to the
  // answer, but re-typing while the answer is on screen should not yank the
  // page around under the cursor.
  // `sync` and `announce`: an answer nobody asked for does not belong in the
  // URL, and must not interrupt a screen reader.
  function renderPanel(query, { move = false, sync = true, announce = true, limit = 6 } = {}) {
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
      });
    }
  }
}
