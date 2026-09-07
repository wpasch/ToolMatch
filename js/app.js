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
import { escapeHtml } from "./dom.js";
import { initCardToggles, renderInto, renderSkeleton } from "./cards.js";
import { renderSky } from "./sky.js";
import { initSkyParallax, renderCluster, renderMarquee } from "./hero.js";
import { initNav, initReveal, initThemeToggle } from "./chrome.js";
import { initDirectory, initSearch, renderCategories } from "./directory.js";

const directoryList = document.getElementById("directory-list");

// Before anything else, and outside init(), so the clouds are in the
// document as early as this module can put them there — the sky is the
// first thing on screen.
renderSky();

async function init() {
  initThemeToggle();
  initNav();
  initSkyParallax();
  initReveal();
  initCardToggles();

  if (!directoryList) return;
  renderSkeleton(directoryList, 9);

  try {
    const data = await loadData();
    const labels = Object.fromEntries(
      data.categories.map((category) => [category.id, category.label])
    );

    renderInto(directoryList, data.tools, labels);
    renderMarquee(data.tools);
    renderCluster(data.tools);
    renderCategories(data);
    initDirectory(data, labels);
    initSearch(data, labels);
  } catch (error) {
    directoryList.innerHTML = `<li class="tool-list__loading">Couldn't load tools: ${escapeHtml(error.message)}</li>`;
    directoryList.removeAttribute("aria-busy");
  }
}

init();
