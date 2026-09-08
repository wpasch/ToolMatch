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
- `tools` — the catalog (107 tools). Match-relevant fields: `tags`, `useCases`,
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

It also checks that `data/tools.json` is canonically formatted. The catalog is
hand-edited but its layout is not a matter of taste — a file written several
ways turns the next one-line edit into an unreviewable diff. If validation
complains, this rewrites it:

```bash
npm run format
```

Two more checks need the network, so they run on a schedule rather than on
every change — a publisher's outage should not fail a pull request that only
touched CSS:

```bash
npm run stale        # listings by age, oldest first; `-- 90` to filter
npm run links        # every catalog URL: dead, moved, or behind bot protection
```

`stale` exists because every tool was checked in the same week, so without it
the 120-day rule expires the whole catalog at once. Working the top of that
list keeps re-checking a rolling chore.

## Generated files

Three things are derived rather than written, and validation fails if the
committed copies drift from what the generator produces:

```bash
npm run meta         # JSON-LD in index.html, sitemap.xml, robots.txt
npm run og           # assets/og.png, the social card, via headless Chrome
```

`scripts/site.js` holds the canonical URL that all of it points at — change
hosts there, then re-run `npm run meta`. The social card's source is
`scripts/og-card.html`, a real page using the site's own fonts, so the card
cannot drift from the design it represents.
