import { el, formatCheckedDate, safeUrl, titleCase } from "./dom.js";

export const MAX_COMPARE = 3;
let selected = new Set();
try {
  const stored = JSON.parse(sessionStorage.getItem("toolmatch-compare") || "[]");
  if (Array.isArray(stored)) selected = new Set(stored.filter((id) => typeof id === "string").slice(0, MAX_COMPARE));
} catch { /* Selection still works without storage. */ }
export const isCompared = (id) => selected.has(id);

export function toggleComparison(id) {
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < MAX_COMPARE) selected.add(id);
  else return false;
  try { sessionStorage.setItem("toolmatch-compare", JSON.stringify([...selected])); } catch {}
  return true;
}

export function reportUrl(tool) {
  const url = new URL("https://github.com/wpasch/ToolMatch/issues/new");
  url.searchParams.set("title", `Outdated information: ${tool.name}`);
  url.searchParams.set("body", `Tool: ${tool.name} (${tool.id})\nWebsite: ${tool.url}\nPricing last checked: ${tool.pricingChecked}\nCurrent listing: ${tool.pricing.note}\n\nWhat needs changing?\n\nSource for the correction:\n`);
  return url.toString();
}

// What a column says about a tool when the catalog has not recorded the
// researched answer. Every tool has a pricing model, so this row always says
// something true and something different per model — which is the question
// being asked of it. Falling through to `pricing.note` instead printed the
// Pricing row twice for the 99 tools with no researched free-access note.
const FREE_ACCESS_BY_MODEL = {
  free: "Free — no paid tier.",
  freemium: "Free tier; limits not recorded.",
  paid: "No free tier.",
};

// A field returns null where the catalog holds nothing for that tool. Rows
// that come back null for every tool on screen are dropped rather than
// printed as a line of apologies: `setup` exists on 8 of 107 tools, so
// "Setup requirements not yet recorded." was almost always the whole row.
const FIELDS = [
  ["Best for", (tool) => tool.tagline],
  ["Free access & limits", (tool) =>
    tool.pricing?.freeAccess || FREE_ACCESS_BY_MODEL[tool.pricing?.model] || null],
  ["Pricing", (tool) => tool.pricing?.note],
  ["Useful tasks", (tool) => tool.useCases?.join(" · ")],
  // Split off setup so the level, which every tool has, is not withheld by
  // the field that almost none of them do.
  ["Skill level", (tool) => (tool.skillLevel ? `${titleCase(tool.skillLevel)} level` : null)],
  ["Setup", (tool) => tool.setup ?? null],
  // The card renders this date as "3 Sep 2026"; the table printed the raw
  // 2026-09-03 for the same field.
  ["Pricing checked", (tool) => formatCheckedDate(tool.pricingChecked)],
];

export function comparisonRows(tools) {
  return FIELDS
    .map(([label, read]) => [label, tools.map((tool) => read(tool) || null)])
    .filter(([, values]) => values.some((value) => value !== null))
    .map(([label, values]) => [label, values.map((value) => value ?? "Not recorded")]);
}

export function initComparison(data) {
  const byId = new Map(data.tools.map((tool) => [tool.id, tool]));
  selected = new Set([...selected].filter((id) => byId.has(id)));
  const bar = document.getElementById("compare-bar");
  const picks = document.getElementById("compare-picks");
  const open = document.getElementById("compare-open");
  const dialog = document.getElementById("compare-dialog");
  const table = document.getElementById("compare-table");
  const status = document.getElementById("compare-status");
  const hint = bar?.querySelector(".compare-hint");
  if (!bar || !dialog) return;

  function update() {
    // Any change to the selection answers the refusal, so the emphasis goes.
    bar.classList.remove("compare-bar--full");
    bar.hidden = selected.size === 0;
    document.body.classList.toggle("has-comparison", selected.size > 0);
    open.disabled = selected.size < 2;
    open.textContent = `Compare (${selected.size}/3)`;
    // The cap used to be enforced by greying out every other Compare button,
    // which stated the limit nowhere and — because a disabled button cannot
    // be clicked — made the sentence below unreachable. The bar is on screen
    // whenever anything is selected, so the rule lives here instead.
    if (hint) hint.textContent = selected.size >= MAX_COMPARE
      ? `${MAX_COMPARE} of ${MAX_COMPARE} — remove one to add another`
      : "Choose 2–3 tools";
    picks.replaceChildren();
    for (const id of selected) {
      const remove = el("button", "compare-pick", `${byId.get(id).name} ×`);
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${byId.get(id).name} from comparison`);
      remove.addEventListener("click", () => {
        toggleComparison(id);
        update();
        (picks.querySelector("button") ?? document.querySelector(`[data-compare="${id}"]`))?.focus();
      });
      picks.append(remove);
    }
    syncComparisonButtons();
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-compare]");
    if (!button || !byId.has(button.dataset.compare)) return;
    if (!toggleComparison(button.dataset.compare)) {
      status.textContent = `Compare up to ${MAX_COMPARE} tools. Remove one to add another.`;
      // The rule is already written in the bar; this points at it, because a
      // press that changes nothing anywhere reads as a broken button.
      bar.classList.remove("compare-bar--full");
      void bar.offsetWidth;
      bar.classList.add("compare-bar--full");
      return;
    }
    status.textContent = `${selected.size} ${selected.size === 1 ? "tool" : "tools"} selected. ${selected.size < 2 ? "Choose another tool to compare." : "Comparison is ready."}`;
    update();
  });
  open.addEventListener("click", () => {
    const tools = [...selected].map((id) => byId.get(id));
    table.replaceChildren();
    const caption = el("caption", "visually-hidden", "Compare selected tools");
    const head = el("thead");
    const titles = el("tr");
    const feature = el("th", null, "Feature");
    feature.scope = "col";
    titles.append(feature);
    for (const tool of tools) {
      const th = el("th");
      th.scope = "col";
      const link = el("a", null, tool.name);
      link.href = safeUrl(tool.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      th.append(link);
      titles.append(th);
    }
    head.append(titles);
    const body = el("tbody");
    for (const [label, values] of comparisonRows(tools)) {
      const tr = el("tr");
      const th = el("th", null, label);
      th.scope = "row";
      tr.append(th);
      for (const value of values) tr.append(el("td", null, value));
      body.append(tr);
    }
    table.append(caption, head, body);
    dialog.showModal();
  });
  document.getElementById("compare-close").addEventListener("click", () => dialog.close());
  update();
}

// Deliberately never disabled. Selection survives in session storage, so
// arriving on a category page with three tools already held used to mean
// every Compare button on screen was dead on arrival, captioned "Compare"
// and explaining nothing. Pressing one at the cap now says why.
export function syncComparisonButtons() {
  const full = selected.size >= MAX_COMPARE;
  for (const button of document.querySelectorAll("button[data-compare]")) {
    const active = isCompared(button.dataset.compare);
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "Selected for comparison" : "Compare";
    button.setAttribute("aria-label", `${button.textContent}: ${button.dataset.toolName}`);
    button.classList.toggle("tool-card__compare--full", full && !active);
  }
}
