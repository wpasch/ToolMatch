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
  sections.css     section frame, categories, FAQ, footer
  directory.css    filter bar, category groups, and the tool card
  motion.css       reveals, breakpoints, reduced-motion (must load last)
assets/fonts/      self-hosted webfonts and their licenses
js/
  app.js           entry point: boots the page
  dom.js           untrusted-value helpers and DOM builders
  cards.js         the tool card, grouped/flat renders, share link, skeleton
  hero.js          logo strip, category cluster, sky parallax
  sky.js           the hero's cumulus geometry, built into the page
  chrome.js        theme dial, nav state, section reveal
  directory.js     category chips, price filter, directory filters, hero search
  data.js          loads and caches data/tools.json
  search.js        query -> ranked tools
scripts/
  site.js          SITE_URL, the one canonical origin the rest agree on
  format-data.js   canonical layout for data/tools.json (npm run format)
  build-meta.js    JSON-LD, sitemap.xml, robots.txt (npm run meta)
  build-og.js      renders og-card.html to assets/og.png (npm run og)
  og-card.html     the 1200x630 card build-og.js screenshots
  validate-data.js the checks behind npm test
  check-links.js   catalog URLs, diffed against the blocked baseline
  stale-report.js  listings by pricing age, oldest first
data/
  tools.json       the tool catalog: categories, tags, tools
  link-baseline.json  ids whose hosts always answer a link check with a
                   challenge page, so the weekly run reports only changes
```

The directory renders under category headings whenever what is on screen
spans more than one category, and flat when it does not — filtered to a
single category the headings would only repeat the chip you just pressed.

Both search boxes share task matching and recognize explicit free/paid-only
requests. “Free” includes freemium plans. Directory URLs preserve `category`,
`price`, and `filter`; hero requests use `q`. Facet counts retain the other
active filters. Billing notes remain visible without punctuation trimming; an
optional editorial pricing summary must retain billing conditions and limits.

## Data shape

`data/tools.json` has three parts:

- `categories` — id + label registry (13 categories); each tool has one `category`
- `tags` — allowed tag vocabulary; each tool has a subset in `tags`
- `tools` — the catalog (107 tools). Match-relevant fields: `tags`, `useCases`,
  `tagline`, `description`.

Per-tool fields: `id`, `name`, `url`, `category`, `tagline`, `description`,
`tags`, `useCases`, `pricing` (`model` = free/freemium/paid + `note`, optional editorial `summary`),
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

Nineteen of the listed sites answer any link check with a challenge page, so
they can never be verified automatically. That set lives in
`data/link-baseline.json` and the check reports the *difference* — printing
the same nineteen every week is noise, and noise is where a real change
hides. A tool that starts or stops being blocked fails the run, because a
challenge page is also what a moved URL looks like from here. When the change
is expected, record it:

```bash
npm run links -- --save
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
