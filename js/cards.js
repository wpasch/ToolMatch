// The tool card: the one component the directory and the search results
// both render, plus the skeleton shown while the catalog loads.

import {
  el,
  formatCheckedDate,
  icon,
  logoUrl,
  safeUrl,
  titleCase,
} from "./dom.js";

function lettermark(name) {
  const initial = String(name).trim().charAt(0).toUpperCase() || "?";
  return el("span", "tool-card__logo tool-card__logo--fallback", initial);
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

// Publishers list every tier they sell; a card that is being skimmed needs
// the shape of the price, not the price list. The first two clauses, each
// cut at its first comma, carry it — "Free tier; Pro $20/mo ($17/mo
// annual); Max $100-200/mo" becomes "Free tier · Pro $20/mo". The untouched
// note is still on the card, behind its Details toggle.
//
// Parentheticals come out before the split, not after: a note that puts a
// semicolon *inside* its parentheses would otherwise be torn in half and
// neither half would still look like an aside.
export function shortPricing(note) {
  const clauses = String(note ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .split(";")
    .map((clause) => clause.split(",")[0].trim())
    .filter(Boolean);
  return clauses.slice(0, 2).join(" · ");
}

// Only ever used to mint element ids for aria-controls, so it can keep
// climbing across re-renders.
let cardSeq = 0;

// A closed card carries what you scan by — name, category, one clamped
// paragraph, the pricing model, a trimmed price. The full paragraph, the
// publisher's whole tier list and the date it was checked live behind the
// card's own Details toggle, so seventy-five of these stay skimmable.
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

  // The pricing model is the badge people filter on by eye, so it gets its
  // own colour; the skill level stays neutral beside it.
  const model = String(tool.pricing?.model ?? "");
  const modelBadge = el("span", "tool-card__badge", titleCase(model));
  if (model === "free") modelBadge.classList.add("tool-card__badge--free");
  if (model === "paid") modelBadge.classList.add("tool-card__badge--paid");

  const badges = el("div", "tool-card__badges");
  badges.append(
    modelBadge,
    el("span", "tool-card__badge", `${titleCase(tool.skillLevel)} level`)
  );
  li.append(badges);

  const note = tool.pricing?.note ?? "";
  li.append(el("p", "tool-card__meta tool-card__meta--short", shortPricing(note)));

  const detail = el("div", "tool-card__detail");
  detail.id = `tool-detail-${++cardSeq}`;
  detail.append(el("p", "tool-card__meta", note));

  const checked = formatCheckedDate(tool.pricingChecked);
  if (checked) {
    detail.append(el("p", "tool-card__checked", `Pricing checked ${checked}`));
  }
  li.append(detail);

  const actions = el("div", "tool-card__actions");

  // A card whose link failed validation still renders — minus the link.
  const href = safeUrl(tool.url);
  if (href) {
    const link = el("a", "tool-card__link");
    link.href = href;
    link.target = "_blank";
    // noreferrer as well as noopener: these are third-party sites and they
    // do not need to be told where the visitor came from.
    link.rel = "noopener noreferrer";
    link.append(
      el("span", "tool-card__link-label", `Open ${tool.name}`),
      icon("tm-arrow", "tool-card__arrow")
    );
    actions.append(link);
  }

  const toggle = el("button", "tool-card__toggle", "Details");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", detail.id);
  // Seventy-five buttons all reading "Details" tells a screen reader
  // nothing about which one it is on. The visible word stays the start of
  // the accessible name, so voice control still matches what's on screen.
  toggle.setAttribute("aria-label", `Details for ${tool.name}`);
  actions.append(toggle);

  li.append(actions);

  return li;
}

// One listener for every card on the page, present and future, rather than
// one per card re-attached on every filter change.
export function initCardToggles() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest(".tool-card__toggle");
    if (!toggle) return;
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.closest(".tool-card")?.classList.toggle("tool-card--open", open);
  });
}

export function renderInto(list, tools, labels) {
  list.replaceChildren();
  for (const tool of tools) {
    list.appendChild(renderToolCard(tool, labels[tool.category] ?? tool.category));
  }
  list.removeAttribute("aria-busy");
  list.removeAttribute("aria-label");
}

// One skeleton card: a logo-sized block, a title-width block, and two
// tagline-width lines, shown while data/tools.json is still loading.
export function renderSkeleton(list, count) {
  list.innerHTML = "";
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
    list.appendChild(li);
  }
}
