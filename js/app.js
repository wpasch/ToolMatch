// Entry point: boots the app, renders the tool directory, and wires the
// landing page's moving parts (hero strip, category cluster, filters,
// search matching).

import { loadData } from "./data.js";
import { buildIndex, search } from "./search.js";

const directoryList = document.getElementById("directory-list");
const directoryEmpty = document.getElementById("directory-empty");

// A handful of tools whose live favicon (fetched via the service below)
// turned out to be wrong or a generic placeholder when checked against the
// product's real logo — served locally instead so they render correctly.
//   - notebooklm: service returned Google's generic "G" (NotebookLM sits
//     behind a sign-in wall, so the crawler can't reach its real icon).
//     Google renamed the product to "Gemini Notebook" in July 2026 with a
//     new blue arch mark; this is that current icon, pulled from Google's
//     own Workspace Updates announcement.
//   - microsoft-copilot: service returned a generic globe placeholder.
//     This is Microsoft's official rebrand icon (in use since Sept 2023),
//     sourced from Wikipedia's cited copy and cross-checked against
//     copilot.microsoft.com's own <link rel="icon"> SVG.
//   - github-copilot: service returned the generic GitHub Octocat (correct
//     for github.com, not specific to the Copilot product) — swapped for
//     Copilot's own mascot mark.
//   - chatgpt: service returned OpenAI's org-level mark — swapped for the
//     actual ChatGPT app icon, which matches the product being listed.
//   - windsurf: service returned an unrelated hexagon icon — fetched
//     directly from windsurf.com/favicon.ico instead.
// Those five sit in assets/logos/ alongside the rest, named by tool id like
// every other icon, so no special case is needed to serve them.

// data/tools.json is a public repository file, so a pull request can put
// anything in it. Every value below is treated as untrusted: nothing from a
// tool entry is ever concatenated into markup.

// Only http(s) survives. A `javascript:` or `data:` URL in a catalog entry
// would otherwise turn a card into a script trigger the moment someone
// clicks it.
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

function safeUrl(raw) {
  try {
    const url = new URL(String(raw), window.location.href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// Logos are served from this repository rather than fetched from a favicon
// service at page load. A runtime call would have told that third party the
// domain of every tool a visitor was looking at, on every visit; the icons
// were collected once instead.
//
// The id becomes a filename, so it is checked against a strict pattern
// first. Anything else — a path separator, a leading dot, an id that could
// climb out of the directory — falls back to a lettermark.
const SAFE_LOGO_ID = /^[a-z0-9][a-z0-9-]*$/;

function logoUrl(tool) {
  const id = String(tool?.id ?? "");
  return SAFE_LOGO_ID.test(id) ? `assets/logos/${id}.png` : null;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// Small DOM builders. textContent never parses markup, so these are safe to
// hand arbitrary strings.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function lettermark(name) {
  const initial = String(name).trim().charAt(0).toUpperCase() || "?";
  return el("span", "tool-card__logo tool-card__logo--fallback", initial);
}

function titleCase(value) {
  const text = String(value ?? "").replaceAll("-", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function formatCheckedDate(value) {
  // Parse date-only values as local calendar dates. `new Date("YYYY-MM-DD")`
  // is UTC and can display as the previous day west of Greenwich.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

// A real error listener rather than an inline onerror attribute: that
// attribute was a JavaScript string nested inside HTML, so it needed two
// different escapes to be safe and had neither.
function toolLogo(tool) {
  const src = safeUrl(logoUrl(tool));
  if (!src) return lettermark(tool.name);

  const img = el("img", "tool-card__logo");
  img.src = src;
  img.alt = "";
  img.width = 32;
  img.height = 32;
  img.loading = "lazy";
  img.addEventListener("error", () => img.replaceWith(lettermark(tool.name)), {
    once: true,
  });
  return img;
}

// ---------- Tool cards ----------
function renderToolCard(tool, categoryLabel) {
  const li = el("li", "tool-card");

  const title = el("div", "tool-card__title");
  title.append(
    el("h3", "tool-card__name", tool.name),
    el("span", "tool-card__cat", categoryLabel)
  );

  const head = el("div", "tool-card__head");
  head.append(toolLogo(tool), title);

  li.append(
    head,
    el("p", "tool-card__tagline", tool.tagline),
    el("p", "tool-card__description", tool.description)
  );

  const badges = el("div", "tool-card__badges");
  badges.append(
    el("span", "tool-card__badge", titleCase(tool.pricing?.model)),
    el("span", "tool-card__badge", `${titleCase(tool.skillLevel)} level`)
  );
  li.append(badges, el("p", "tool-card__meta", tool.pricing?.note ?? ""));

  const checked = formatCheckedDate(tool.pricingChecked);
  if (checked) {
    li.append(el("p", "tool-card__checked", `Pricing checked ${checked}`));
  }

  // A card whose link failed validation still renders — minus the link.
  const href = safeUrl(tool.url);
  if (href) {
    const link = el("a", "tool-card__link", `Open ${tool.name}`);
    link.href = href;
    link.target = "_blank";
    // noreferrer as well as noopener: these are third-party sites and they
    // do not need to be told where the visitor came from.
    link.rel = "noopener noreferrer";
    li.append(link);
  }

  return li;
}

function renderInto(list, tools, labels) {
  list.replaceChildren();
  for (const tool of tools) {
    list.appendChild(renderToolCard(tool, labels[tool.category] ?? tool.category));
  }
  list.removeAttribute("aria-busy");
  list.removeAttribute("aria-label");
}

// One skeleton card: a logo-sized block, a title-width block, and two
// tagline-width lines, shown while data/tools.json is still loading.
function renderSkeleton(count) {
  directoryList.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    li.className = "tool-card tool-card--skeleton";
    li.setAttribute("aria-hidden", "true");
    li.innerHTML = `
      <div class="tool-card__head">
        <span class="skeleton-block skeleton-block--logo"></span>
        <span class="skeleton-block skeleton-block--title"></span>
      </div>
      <span class="skeleton-block skeleton-block--line"></span>
      <span class="skeleton-block skeleton-block--line short"></span>
    `;
    directoryList.appendChild(li);
  }
}

// ---------- Hero logo strip ----------
// Two identical runs of chips sit side by side; the CSS marquee translates
// the pair by -50%, so the seam never shows.
function renderMarquee(tools) {
  const track = document.getElementById("hero-marquee");
  if (!track) return;

  function chip(tool, size) {
    const span = el("span", "marquee__chip");
    const src = safeUrl(logoUrl(tool));
    if (src) {
      const img = el("img");
      img.src = src;
      img.alt = "";
      img.width = size;
      img.height = size;
      img.loading = "lazy";
      span.append(img);
    }
    return span;
  }

  const picks = tools.slice(0, 22);
  track.replaceChildren();
  // Two runs, so the -50% translate lands on an identical frame.
  for (let pass = 0; pass < 2; pass++) {
    for (const tool of picks) track.appendChild(chip(tool, 28));
  }
}

// ---------- Category cluster ----------
// Fixed positions rather than random ones, so the scatter reads as composed.
// All of them sit in the band above the heading; the tops alternate high and
// low so the row never reads as a straight line, and the CSS mask dissolves
// the lower ones into the type below.
// Chips over the centre column stay high, clear of the heading; the ones
// that hang lower are pushed out to the margins where no type reaches.
const CLUSTER_POSITIONS = [
  [2, 52], [9, 16], [17, 60], [25, 10], [34, 4], [43, 14],
  [57, 8], [66, 2], [74, 54], [82, 12], [90, 58], [97, 26],
];

// Drift values per chip. Derived from the index rather than Math.random so
// the layout is identical on every load, but the numbers are coprime enough
// that no two chips share a rhythm. The delays are negative on purpose:
// that starts each chip partway through its cycle instead of having the
// whole cluster lurch into motion together on load.
function driftStyle(i) {
  const duration = 6.5 + ((i * 1.7) % 5.5);
  const delay = -((i * 2.3) % 7).toFixed(2);
  const dy = -(11 + ((i * 5) % 13));
  const dx = ((i % 3) - 1) * 7;
  const rotate = ((i % 5) - 2) * 3;
  return `--t:${duration.toFixed(2)}s;--d:${delay}s;--dy:${dy}px;--dx:${dx}px;--r:${rotate}deg`;
}

function renderCluster(tools) {
  const cluster = document.getElementById("logo-cluster");
  if (!cluster) return;

  // Spread the picks across the catalog so the cluster shows variety
  // rather than the first dozen chat assistants.
  const step = Math.floor(tools.length / CLUSTER_POSITIONS.length) || 1;

  cluster.replaceChildren();
  CLUSTER_POSITIONS.forEach(([left, top], i) => {
    const tool = tools[(i * step) % tools.length];
    const span = el("span", "cluster__chip");
    // Numbers only — nothing from the catalog reaches the style attribute.
    span.style.cssText = `left:${left}%;top:${top}%;${driftStyle(i)}`;

    const src = safeUrl(logoUrl(tool));
    if (src) {
      const img = el("img");
      img.src = src;
      img.alt = "";
      img.width = 29;
      img.height = 29;
      img.loading = "lazy";
      span.append(img);
    }
    cluster.appendChild(span);
  });
}

// ---------- Category chips ----------
function renderCategories(data) {
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
function initFilters(data, labels) {
  const bar = document.getElementById("filters");
  if (!bar) return;

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

  bar.addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;

    for (const other of bar.querySelectorAll(".filter")) {
      other.setAttribute("aria-pressed", String(other === button));
    }

    const category = button.dataset.category;
    const shown =
      category === "all"
        ? data.tools
        : data.tools.filter((tool) => tool.category === category);

    renderInto(directoryList, shown, labels);
    directoryEmpty.hidden = shown.length > 0;
  });
}

// ---------- Search ----------
// Matching lives in js/search.js; this only wires the form to it.
function initSearch(data, labels) {
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

  function showResults() {
    const ranked = search(index, input.value);
    syncQuery(input.value);

    // Nothing usable typed at all — send them to the directory rather than
    // showing an empty results panel.
    if (ranked.length === 0 && input.value.trim() === "") {
      document.getElementById("directory").scrollIntoView();
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
      renderInto(resultsList, ranked, labels);
      if (status) status.textContent = `${ranked.length} matching tools found.`;
    }

    heading.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    results.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showResults();
  });

  const initialQuery = new URL(window.location.href).searchParams.get("q");
  if (initialQuery) {
    input.value = initialQuery;
    showResults();
  }
}

// ---------- Theme toggle ----------
// Defaults to the OS preference (handled purely in CSS); an explicit choice
// here is saved and takes over from then on. The inline script in
// index.html's <head> applies a saved choice before first paint so there's
// no flash of the wrong theme.
function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function currentTheme() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return prefersDark.matches ? "dark" : "light";
  }

  function updateButton() {
    const isDark = currentTheme() === "dark";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function applyTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — theme still applies for this page view */
    }
    updateButton();
  }

  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // Keep the dial in sync if the OS theme changes while no explicit choice
  // has been made on this page.
  if (prefersDark.addEventListener) {
    prefersDark.addEventListener("change", updateButton);
  } else {
    prefersDark.addListener(updateButton);
  }
  updateButton();
}

// ---------- Nav state ----------
// The bar is glass over the sky and an opaque surface below it. Watching a
// sentinel at the hero's base is cheaper than a scroll listener.
function initNav() {
  const nav = document.getElementById("nav");
  const hero = document.querySelector(".hero");
  if (!nav || !hero) return;

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      nav.classList.toggle("nav--solid", hero.getBoundingClientRect().bottom <= 72);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => nav.classList.toggle("nav--solid", !entry.isIntersecting),
    { rootMargin: "-72px 0px 0px 0px", threshold: 0 }
  );
  observer.observe(hero);
}

// ---------- Sky parallax ----------
// The cloud bands drift sideways on their own (CSS); this only makes them
// lag the scroll vertically, which is what sells the depth between them.
// Writes a single custom property and lets CSS decide how far each layer
// moves.
function initSkyParallax() {
  const sky = document.querySelector(".hero__sky");
  const hero = document.querySelector(".hero");
  if (!sky || !hero) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;

  function update() {
    // Past the hero there is nothing left to parallax, so stop moving.
    const limit = hero.offsetHeight;
    const shift = Math.min(window.scrollY, limit) * 0.22;
    sky.style.setProperty("--sky-shift", `${shift}px`);
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  update();
}

// ---------- Section reveal ----------
function initReveal() {
  const targets = document.querySelectorAll(".section__head");
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
  );

  for (const target of targets) {
    target.classList.add("reveal");
    observer.observe(target);
  }
}

// ---------- Boot ----------
async function init() {
  initThemeToggle();
  initNav();
  initSkyParallax();
  initReveal();

  renderSkeleton(9);

  try {
    const data = await loadData();
    const labels = Object.fromEntries(
      data.categories.map((category) => [category.id, category.label])
    );

    renderInto(directoryList, data.tools, labels);
    renderMarquee(data.tools);
    renderCluster(data.tools);
    renderCategories(data);
    initFilters(data, labels);
    initSearch(data, labels);
  } catch (error) {
    directoryList.innerHTML = `<li class="tool-list__loading">Couldn't load tools: ${escapeHtml(error.message)}</li>`;
    directoryList.removeAttribute("aria-busy");
  }
}

init();
