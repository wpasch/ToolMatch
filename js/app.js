// Entry point: boots the app, renders the tool directory.
// (Search + matching land in the next piece.)

import { loadData } from "./data.js";

const directoryList = document.getElementById("directory-list");

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
  for (const tool of data.tools) {
    const label = categoryLabels[tool.category] ?? tool.category;
    directoryList.appendChild(renderToolCard(tool, label));
  }
}

async function init() {
  try {
    const data = await loadData();
    renderDirectory(data);
  } catch (error) {
    directoryList.innerHTML = `<li class="tool-list__loading">Couldn't load tools: ${error.message}</li>`;
  }
}

init();
