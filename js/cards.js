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
// card's own Details toggle, so the full catalog stays skimmable.
function renderToolCard(tool, categoryLabel, { reason, anchor, headingLevel = 3 } = {}) {
  const li = el("li", "tool-card");
  // Only the directory gets stable ids. The same tool can be on screen twice
  // — once in the results panel, once in the list below it — and two elements
  // sharing an id is exactly the thing that breaks a screen reader's
  // navigation and any #fragment pointing at it.
  if (anchor) li.id = `tool-${tool.id}`;

  const title = el("div", "tool-card__title");
  // Under a category heading the card is one level deeper than it is in a
  // flat list, and a screen reader walking headings should hear that rather
  // than a run of same-level siblings that skips the group it is inside.
  title.append(
    el(`h${headingLevel}`, "tool-card__name", tool.name),
    el("span", "tool-card__cat", categoryLabel)
  );

  const head = el("div", "tool-card__head");
  head.append(toolLogo(tool), title);

  li.append(head);

  // Why this card is in front of you, when it was ranked rather than browsed.
  // It sits above the tagline because it is the answer to the question the
  // searcher actually asked, and the tagline is the publisher's answer to a
  // different one.
  if (reason) {
    const why = el("p", "tool-card__why");
    why.append(icon("tm-spark", "tool-card__why-icon"), el("span", null, reason));
    li.append(why);
  }

  li.append(
    el("p", "tool-card__tagline", tool.tagline),
    el("p", "tool-card__description", tool.description)
  );

  // The pricing model is the badge people filter on by eye, so it gets its
  // own colour; the skill level stays neutral beside it.
  const model = String(tool.pricing?.model ?? "");
  // "Paid" beside "Freemium" reads as a tier, not as a wall. On a site whose
  // premise is that you can start without a budget, the tools you cannot are
  // the single most useful thing to be able to see at a glance.
  const modelLabel = model === "paid" ? "Paid only" : titleCase(model);
  const modelBadge = el("span", "tool-card__badge", modelLabel);
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
  // A pageful of buttons all reading "Details" tells a screen reader
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

// `reasons` is a Map from tool to the one-line explanation of why it ranked;
// the directory passes none, because nothing there needs explaining.
export function renderInto(list, tools, labels, { reasons, anchors } = {}) {
  list.replaceChildren();
  for (const tool of tools) {
    list.appendChild(
      renderToolCard(tool, labels[tool.category] ?? tool.category, {
        reason: reasons?.get(tool),
        anchor: anchors,
      })
    );
  }
  list.removeAttribute("aria-busy");
  list.removeAttribute("aria-label");
}

// The catalog, broken under category headings whenever what's on screen
// spans more than one of them.
//
// The directory is the whole catalog on one page: 14,700 pixels of scroll
// with nothing in it to navigate by. It is not slow — the logos are lazy and
// the whole list is about 2,200 nodes — it is just featureless, and a wall
// you cannot orient yourself in is the actual complaint. Narrowed to a single
// category the headings would only repeat the pressed chip, so it renders
// flat and the grouping disappears on its own.
// Which categories the given tools actually occupy, in catalog order. Pulled
// out of the renderer because it is the whole grouping rule — group when this
// returns more than one — and a rule worth testing should not need a DOM.
export function categoriesPresent(tools, categories) {
  return categories.filter((category) => tools.some((tool) => tool.category === category.id));
}

export function renderCatalogInto(container, tools, labels, categories, { anchors } = {}) {
  container.replaceChildren();

  const present = categoriesPresent(tools, categories);

  const card = (tool, label, headingLevel) =>
    renderToolCard(tool, label, { anchor: anchors, headingLevel });

  if (present.length > 1) {
    for (const category of present) {
      const inGroup = tools.filter((tool) => tool.category === category.id);

      const heading = el("h3", "tool-group__title", category.label);
      heading.append(el("span", "tool-group__count", String(inGroup.length)));

      const list = el("ul", "tool-list");
      for (const tool of inGroup) list.appendChild(card(tool, category.label, 4));

      // Each group is its own box so its heading sticks only while you are
      // inside that group. Left as siblings in one container, every heading
      // sticks for the height of the whole catalog and they stack up at the
      // top of the viewport three deep.
      const group = el("div", "tool-group");
      group.append(heading, list);
      container.append(group);
    }
  } else {
    const list = el("ul", "tool-list");
    for (const tool of tools) {
      list.appendChild(card(tool, labels[tool.category] ?? tool.category, 3));
    }
    container.append(list);
  }

  container.removeAttribute("aria-busy");
  container.removeAttribute("aria-label");
}

// One skeleton card: a logo-sized block, a title-width block, and two
// tagline-width lines, shown while data/tools.json is still loading.
export function renderSkeleton(container, count) {
  const list = el("ul", "tool-list");
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
  container.replaceChildren(list);
}
