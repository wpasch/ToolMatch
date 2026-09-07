// Where this site actually lives.
//
// One constant, because the canonical URL appears in five places that must
// agree — the canonical link, og:url, og:image, sitemap.xml and the JSON-LD —
// and a social card that points at the wrong origin fails silently. Changing
// hosts means changing this line and running `npm run meta`; validate-data.js
// fails if index.html disagrees with it.
export const SITE_URL = "https://wpasch.github.io/ToolMatch/";
