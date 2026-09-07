# ToolMatch

Curation and recommendation site for AI tools, aimed at students and young
professionals. Describe what you're trying to do and get a short list of tools
that fit.

Plain HTML/CSS/JS, no framework, no build step.

## Run it locally

`fetch()` needs the files served over HTTP (not opened as `file://`), so run a
local server from this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. (VS Code's Live Server extension works too.)

## Structure

```
index.html         markup + page skeleton
css/               loaded in this order; the order is the cascade
  base.css         fonts, design tokens, element defaults, nav
  hero.css         sky, cloud banks, search, logo strip
  sections.css     section frame, steps, categories, facts, FAQ, footer
  directory.css    filter bar and the tool card
  motion.css       reveals, breakpoints, reduced-motion (must load last)
assets/fonts/      self-hosted webfonts and their licenses
js/
  app.js           entry point: boots the page
  dom.js           untrusted-value helpers and DOM builders
  cards.js         the tool card, list render, loading skeleton
  hero.js          logo strip, category cluster, sky parallax
  chrome.js        theme dial, nav state, section reveal
  directory.js     category chips, directory filters, hero search
  data.js          loads and caches data/tools.json
  search.js        query -> ranked tools
data/tools.json    the tool catalog: categories, tags, tools
```

## Data shape

`data/tools.json` has three parts:

- `categories` — id + label registry (13 categories); each tool has one `category`
- `tags` — allowed tag vocabulary; each tool has a subset in `tags`
- `tools` — the catalog (100 tools). Match-relevant fields: `tags`, `useCases`,
  `tagline`, `description`.

Per-tool fields: `id`, `name`, `url`, `category`, `tagline`, `description`,
`tags`, `useCases`, `pricing` (`model` = free/freemium/paid + `note`),
`pricingChecked` (YYYY-MM-DD — pricing drifts, so this flags staleness),
`skillLevel`.

## Verify changes

Run the dependency-free test and catalog validation suite with:

```bash
npm test
```

Validation checks the schema, published catalog counts, logo/font assets, and
pricing dates. Pricing older than 120 days fails the check so stale listings do
not quietly remain published.
