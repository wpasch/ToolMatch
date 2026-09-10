// Shared builders and the boundary where catalog data stops being trusted.
//
// data/tools.json is a public repository file, so a pull request can put
// anything in it. Every value that reaches the page goes through something
// here first: nothing from a tool entry is ever concatenated into markup.

// Only http(s) survives. A `javascript:` or `data:` URL in a catalog entry
// would otherwise turn a card into a script trigger the moment someone
// clicks it.
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export function safeUrl(raw) {
  try {
    const url = new URL(String(raw), window.location.href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// A handful of tools whose live favicon (fetched via a favicon service)
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
//
// Logos are served from this repository rather than fetched from a favicon
// service at page load. A runtime call would have told that third party the
// domain of every tool a visitor was looking at, on every visit; the icons
// were collected once instead.
//
// The id becomes a filename, so it is checked against a strict pattern
// first. Anything else — a path separator, a leading dot, an id that could
// climb out of the directory — falls back to a lettermark.
const SAFE_LOGO_ID = /^[a-z0-9][a-z0-9-]*$/;

export function logoUrl(tool) {
  const id = String(tool?.id ?? "");
  return SAFE_LOGO_ID.test(id) ? `assets/logos/${id}.png` : null;
}

// Small DOM builders. textContent never parses markup, so these are safe to
// hand arbitrary strings.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Sprite icon from the <symbol> set in index.html. Built with the SVG
// namespace because createElement would produce an inert HTML element of
// the same name.
export function icon(id, className) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className ? `icon ${className}` : "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

export function titleCase(value) {
  const text = String(value ?? "").replaceAll("-", " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function formatCheckedDate(value) {
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

// Honoured by anything that would otherwise animate a scroll position.
export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
