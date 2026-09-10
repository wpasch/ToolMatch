import { initComparison } from "./compare.js";
// Entry point. Wires the page together and owns nothing else — the parts
// live beside it:
//
//   dom.js        untrusted-value helpers and the small DOM builders
//   cards.js      the tool card, the list render, the loading skeleton
//   sky.js        the hero's cumulus geometry, built into the page
//   hero.js       the logo strip, the category cluster, the sky's parallax
//   chrome.js     theme dial, nav glass-to-solid, section reveal
//   directory.js  category chips, directory filters, hero search
//   search.js     the task-matching itself
//   data.js       fetching and shape-checking data/tools.json

import { loadData } from "./data.js";
import { el } from "./dom.js";
import { initCardSharing, initCardToggles, renderSkeleton } from "./cards.js";
import { renderSky } from "./sky.js";
import { initSkyParallax, renderCluster, renderMarquee } from "./hero.js";
import { initMobileMenu, initNav, initReveal, initThemeToggle } from "./chrome.js";
import { initDirectory, initSearch, renderCategories } from "./directory.js";

const directoryList = document.getElementById("directory-list");

// Before anything else, and outside init(), so the clouds are in the
// document as early as this module can put them there — the sky is the
// first thing on screen.
renderSky();

initThemeToggle();
initMobileMenu();
initNav();
initSkyParallax();
initReveal();
initCardToggles();
initCardSharing();

const status = document.getElementById("catalog-status");
const retry = document.getElementById("catalog-retry");
let loading = false;
let ready = false;

function setSearchEnabled(enabled) {
  for (const control of document.querySelectorAll(
    "#search-form input, #search-form button, #search-examples button, #directory-search"
  )) control.disabled = !enabled;
}

async function startCatalog(focusTarget) {
  if (!directoryList || loading || ready) return;
  loading = true;
  setSearchEnabled(false);
  status.textContent = "Loading tools…";
  retry.hidden = true;
  directoryList.setAttribute("aria-busy", "true");
  renderSkeleton(directoryList, 9);

  let data;
  try {
    data = await loadData();
  } catch {
    loading = false;
    status.textContent = "Tools couldn’t load. Search is unavailable for now. Please try again.";
    retry.hidden = false;
    const error = el("div", "tool-list__empty");
    error.setAttribute("role", "alert");
    error.append(el("p", null, "We couldn’t load the tools. Check your connection and try again."));
    const button = el("button", "filter", "Try again");
    button.type = "button";
    button.addEventListener("click", () => startCatalog("directory-search"));
    error.append(button);
    directoryList.replaceChildren(error);
    directoryList.removeAttribute("aria-busy");
    directoryList.removeAttribute("aria-label");
    return;
  }

  const labels = Object.fromEntries(data.categories.map((category) => [category.id, category.label]));
  renderMarquee(data.tools);
  renderCluster(data.tools);
  renderCategories(data);
  initSearch(data, labels);
  initDirectory(data, labels);
  initComparison(data);
  ready = true;
  loading = false;
  setSearchEnabled(true);
  status.textContent = "";
  if (focusTarget) document.getElementById(focusTarget)?.focus();
}

retry?.addEventListener("click", () => startCatalog("search-input"));
startCatalog();
