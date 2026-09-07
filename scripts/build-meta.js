// Regenerates everything derived from the catalog and the canonical URL:
// the JSON-LD block in index.html, sitemap.xml, and robots.txt.
//
//   npm run meta
//
// These three used to be the obvious thing to hand-write and the obvious
// thing to forget — the site already had one bug of exactly this shape,
// where the tool counts quoted in index.html drifted from data/tools.json.
// So the generator is the source of truth and validate-data.js fails when
// the committed files no longer match what it would produce.

import { readFile, writeFile } from "node:fs/promises";
import { SITE_URL } from "./site.js";

const root = new URL("../", import.meta.url);

// The block in index.html is replaced between these two comments, so the
// surrounding markup is never reformatted by a regeneration.
export const JSONLD_OPEN = "<!-- BEGIN generated JSON-LD (npm run meta) -->";
export const JSONLD_CLOSE = "<!-- END generated JSON-LD -->";

// A directory's useful structured data is the list itself, so the catalog is
// enumerated — but only as name and URL.
//
// Two things are deliberately absent. Descriptions, because the tools have no
// pages of their own here and duplicating the catalog into the markup is
// padding. And prices: a price in structured data is a claim, and this one
// would go stale without the 120-day re-check discipline that guards the
// visible catalog. Pretty-printed with offers this block was 57KB on a 17KB
// page; as it stands it is about 9KB, which gzip takes down to a rounding
// error against the fonts.
export function buildGraph(data) {
  const site = SITE_URL.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: `${site}/`,
        name: "ToolMatch",
        description:
          "A hand-checked directory of AI tools for coursework and early-career work.",
        inLanguage: "en",
        potentialAction: {
          "@type": "SearchAction",
          // The hero search reads ?q= on load, so a search result can deep
          // link straight into a match rather than the front page.
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${site}/?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "CollectionPage",
        "@id": `${site}/#catalog`,
        url: `${site}/`,
        name: `${data.tools.length} AI tools, hand-checked`,
        isPartOf: { "@id": `${site}/#website` },
        dateModified: data.meta.updated,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: data.tools.length,
          itemListElement: data.tools.map((tool, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: tool.name,
            url: tool.url,
          })),
        },
      },
    ],
  };
}

export function buildSitemap(data) {
  const site = SITE_URL.replace(/\/$/, "");
  // One page. The sitemap exists to state its canonical form and when the
  // catalog behind it last moved, not to enumerate anything.
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site}/</loc>
    <lastmod>${data.meta.updated}</lastmod>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
`;
}

export function buildRobots() {
  const site = SITE_URL.replace(/\/$/, "");
  return `# Everything here is meant to be found.
User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`;
}

// The block as it should appear in index.html, indented to sit inside <head>.
// Minified rather than indented: this is for crawlers, and pretty-printing a
// hundred list items costs more bytes than the items themselves.
export function renderJsonLdBlock(data) {
  const json = JSON.stringify(buildGraph(data));
  return `${JSONLD_OPEN}\n    <script type="application/ld+json">${json}</script>\n    ${JSONLD_CLOSE}`;
}

export function replaceJsonLd(html, block) {
  const start = html.indexOf(JSONLD_OPEN);
  const end = html.indexOf(JSONLD_CLOSE);
  if (start === -1 || end === -1) {
    throw new Error("index.html is missing the generated JSON-LD markers");
  }
  return html.slice(0, start) + block + html.slice(end + JSONLD_CLOSE.length);
}

// Running the file writes; importing it does not.
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(await readFile(new URL("data/tools.json", root), "utf8"));
  const html = await readFile(new URL("index.html", root), "utf8");

  await writeFile(new URL("index.html", root), replaceJsonLd(html, renderJsonLdBlock(data)));
  await writeFile(new URL("sitemap.xml", root), buildSitemap(data));
  await writeFile(new URL("robots.txt", root), buildRobots());

  console.log(
    `Wrote JSON-LD for ${data.tools.length} tools, sitemap.xml, and robots.txt for ${SITE_URL}`
  );
}
