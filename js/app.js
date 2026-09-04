// Entry point: boots the app, renders the tool directory.
// (Search + matching land in the next piece.)

import { loadData } from "./data.js";

const directoryList = document.getElementById("directory-list");

// Card entrance animations stagger by list position (see --i in
// css/styles.css), capped so a 75-card grid doesn't take seconds to settle.
const MAX_STAGGER_INDEX = 16;

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

// Build one <li> card for a tool.
function renderToolCard(tool, categoryLabel, index) {
  const li = document.createElement("li");
  li.className = "tool-card";
  li.style.setProperty("--i", Math.min(index, MAX_STAGGER_INDEX));
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
        <h3 class="tool-card__name">${tool.name}</h3>
        <span class="tool-card__cat">${categoryLabel}</span>
      </div>
    </div>
    <p class="tool-card__tagline">${tool.tagline}</p>
    <p class="tool-card__meta">${tool.pricing.note}</p>
    <a class="tool-card__link" href="${tool.url}" target="_blank" rel="noopener">
      Visit site &rarr;
    </a>
  `;
  return li;
}

function renderDirectory(data) {
  // Map category id -> human label, so cards can show "Research & Study"
  // instead of "research".
  const categoryLabels = {};
  for (const category of data.categories) {
    categoryLabels[category.id] = category.label;
  }

  directoryList.innerHTML = "";
  data.tools.forEach((tool, index) => {
    const label = categoryLabels[tool.category] ?? tool.category;
    directoryList.appendChild(renderToolCard(tool, label, index));
  });
  directoryList.removeAttribute("aria-busy");
  directoryList.removeAttribute("aria-label");
}

// One skeleton card: a logo-sized block, a title-width block, and two
// tagline-width lines, shown while data/tools.json is still loading.
function renderSkeletonCard(index) {
  const li = document.createElement("li");
  li.className = "tool-card tool-card--skeleton";
  li.style.setProperty("--i", Math.min(index, MAX_STAGGER_INDEX));
  li.setAttribute("aria-hidden", "true");
  li.innerHTML = `
    <div class="tool-card__head">
      <span class="skeleton-block skeleton-block--logo"></span>
      <span class="skeleton-block skeleton-block--title"></span>
    </div>
    <span class="skeleton-block skeleton-block--line"></span>
    <span class="skeleton-block skeleton-block--line short"></span>
  `;
  return li;
}

function renderSkeleton(count) {
  directoryList.innerHTML = "";
  for (let i = 0; i < count; i++) {
    directoryList.appendChild(renderSkeletonCard(i));
  }
}

// ---------- Theme toggle ----------
// Defaults to the OS preference (handled purely in CSS); an explicit choice
// here is saved and takes over from then on. The inline script in
// index.html's <head> applies a saved choice before first paint so there's
// no flash of the wrong theme.
function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  const sunIcon = button?.querySelector(".icon-sun");
  const moonIcon = button?.querySelector(".icon-moon");
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
    button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    sunIcon.hidden = isDark;
    moonIcon.hidden = !isDark;
  }

  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — theme still applies for this page view */
    }
    updateButton();
  });

  // Keep the icon in sync if the OS theme changes while no explicit choice
  // has been made on this page.
  prefersDark.addEventListener("change", updateButton);

  updateButton();
}

// ---------- Sticky header shadow ----------
// Adds a hairline shadow once the page has scrolled, so the header reads as
// a distinct layer instead of floating with a hard edge from the top.
function initHeaderScrollShadow() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  let ticking = false;
  function update() {
    header.classList.toggle("site-header--scrolled", window.scrollY > 4);
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

async function init() {
  initThemeToggle();
  initHeaderScrollShadow();

  renderSkeleton(9);
  try {
    const data = await loadData();
    renderDirectory(data);
  } catch (error) {
    directoryList.innerHTML = `<li class="tool-list__loading">Couldn't load tools: ${error.message}</li>`;
    directoryList.removeAttribute("aria-busy");
  }
}

init();
