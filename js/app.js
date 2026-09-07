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
const LOGO_OVERRIDES = {
  notebooklm: "assets/logos/notebooklm.png",
  "microsoft-copilot": "assets/logos/microsoft-copilot.png",
  "github-copilot": "assets/logos/github-copilot.png",
  chatgpt: "assets/logos/chatgpt.png",
  windsurf: "assets/logos/windsurf.png",
};

// Favicon service used to fetch the rest of the tools' logos without hosting
// 75 image files ourselves. Falls back to a lettermark if a given domain has
// none.
function logoUrl(tool) {
  if (LOGO_OVERRIDES[tool.id]) return LOGO_OVERRIDES[tool.id];
  const domain = new URL(tool.url).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// ---------- Tool cards ----------
function renderToolCard(tool, categoryLabel) {
  const li = document.createElement("li");
  li.className = "tool-card";
  const initial = tool.name.trim().charAt(0).toUpperCase();
  li.innerHTML = `
    <div class="tool-card__head">
      <img
        class="tool-card__logo"
        src="${logoUrl(tool)}"
        alt=""
        width="32"
        height="32"
        loading="lazy"
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tool-card__logo tool-card__logo--fallback',textContent:'${initial}'}))"
      />
      <div class="tool-card__title">
        <h3 class="tool-card__name">${escapeHtml(tool.name)}</h3>
        <span class="tool-card__cat">${escapeHtml(categoryLabel)}</span>
      </div>
    </div>
    <p class="tool-card__tagline">${escapeHtml(tool.tagline)}</p>
    <p class="tool-card__meta">${escapeHtml(tool.pricing.note)}</p>
    <a class="tool-card__link" href="${tool.url}" target="_blank" rel="noopener">
      Open ${escapeHtml(tool.name)}
    </a>
  `;
  return li;
}

function renderInto(list, tools, labels) {
  list.innerHTML = "";
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

  const picks = tools.slice(0, 22);
  const chips = picks
    .map(
      (tool) => `
        <span class="marquee__chip">
          <img src="${logoUrl(tool)}" alt="" width="28" height="28" loading="lazy" />
        </span>`
    )
    .join("");

  track.innerHTML = chips + chips;
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

  cluster.innerHTML = CLUSTER_POSITIONS.map(([left, top], i) => {
    const tool = tools[(i * step) % tools.length];
    return `
      <span class="cluster__chip" style="left:${left}%;top:${top}%;${driftStyle(i)}">
        <img src="${logoUrl(tool)}" alt="" width="29" height="29" loading="lazy" />
      </span>`;
  }).join("");
}

// ---------- Category chips ----------
function renderCategories(data) {
  const list = document.getElementById("category-list");
  if (!list) return;

  const counts = {};
  for (const tool of data.tools) {
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }

  list.innerHTML = data.categories
    .map(
      (category) => `
        <li>
          <a href="#directory" data-category="${category.id}">
            ${escapeHtml(category.label)}
            <span>${counts[category.id] ?? 0}</span>
          </a>
        </li>`
    )
    .join("");

  // Jumping from a category chip pre-selects that filter in the directory.
  list.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-category]");
    if (!link) return;
    const button = document.querySelector(
      `.filter[data-category="${link.dataset.category}"]`
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

  bar.innerHTML = options
    .map(
      (option, i) => `
        <button
          type="button"
          class="filter"
          data-category="${option.id}"
          aria-pressed="${i === 0}"
        >${escapeHtml(option.label)}</button>`
    )
    .join("");

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
  if (!form) return;

  const index = buildIndex(data.tools, labels);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const ranked = search(index, input.value);

    // Nothing usable typed at all — send them to the directory rather than
    // showing an empty results panel.
    if (ranked.length === 0 && input.value.trim() === "") {
      document.getElementById("directory").scrollIntoView();
      return;
    }

    results.hidden = false;

    if (ranked.length === 0) {
      heading.textContent = "No match for that yet";
      resultsList.innerHTML = `<li class="tool-list__empty">Try describing the task differently, or browse the full directory below.</li>`;
    } else {
      heading.textContent = `${ranked.length} tools for that`;
      renderInto(resultsList, ranked, labels);
    }

    results.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

    // Not every browser ships View Transitions, and anyone asking for less
    // motion does not want a full-screen wipe.
    if (!document.startViewTransition || reduceMotion.matches) {
      applyTheme(next);
      return;
    }

    // Turn the dial before the transition starts. Inside the callback the
    // page is already being captured, and a snapshot is a still frame — the
    // rotation would be frozen out of the animation entirely.
    button.setAttribute("aria-pressed", String(next === "dark"));

    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // Far enough to clear the corner furthest from the button, so the
    // reveal always finishes covering the viewport.
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => applyTheme(next));

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 620,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  });

  // Keep the dial in sync if the OS theme changes while no explicit choice
  // has been made on this page.
  prefersDark.addEventListener("change", updateButton);
  updateButton();
}

// ---------- Nav state ----------
// The bar is glass over the sky and an opaque surface below it. Watching a
// sentinel at the hero's base is cheaper than a scroll listener.
function initNav() {
  const nav = document.getElementById("nav");
  const hero = document.querySelector(".hero");
  if (!nav || !hero) return;

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
