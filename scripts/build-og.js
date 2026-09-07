// Renders scripts/og-card.html to assets/og.png — the social preview image.
//
//   npm run og
//
// The card is a real page using the site's own woff2 fonts, so it has to be
// rendered by a browser rather than drawn. Chrome is driven headless rather
// than through Playwright to avoid a dependency (and a ~150MB browser
// download) for a file that is regenerated maybe twice a year.
//
// The page is served over HTTP rather than opened as file://, because
// Chrome refuses to load the fonts cross-origin from a file:// document and
// the card would silently render in Times New Roman.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WIDTH = 1200;
const HEIGHT = 630; // what every crawler expects; do not change one without the other
const root = new URL("../", import.meta.url);
const output = new URL("assets/og.png", root);

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env.CHROME_PATH,
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error(
    "No Chrome or Chromium found. Set CHROME_PATH to the binary, or open\n" +
      "scripts/og-card.html in a browser and export a 1200x630 screenshot by hand."
  );
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// Just enough static server to render one page. Paths are resolved against
// the repo root and anything that escapes it is refused, so a stray "../"
// in the card cannot read the rest of the disk.
const server = createServer(async (request, response) => {
  try {
    const target = new URL(`.${new URL(request.url, "http://x").pathname}`, root);
    if (!target.href.startsWith(root.href)) {
      response.writeHead(403).end();
      return;
    }
    await stat(target);
    response.writeHead(200, { "content-type": TYPES[extname(target.pathname)] ?? "application/octet-stream" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

// Chrome writes its profile somewhere; pointing it at a throwaway directory
// keeps this from touching the user's real one — and keeps a running Chrome
// from refusing the job because its profile is already locked.
const profile = await mkdtemp(join(tmpdir(), "toolmatch-og-"));

// Start from nothing, so "the file appeared" is proof this run produced it
// and not evidence of the last one.
await rm(output, { force: true });

const child = spawn(
  chrome,
  [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    // Without this a retina machine renders the card at 2x and every
    // crawler gets a 2400x1260 image.
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-data-dir=${profile}`,
    `--screenshot=${output.pathname}`,
    `http://127.0.0.1:${port}/scripts/og-card.html`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);
// Chrome writes benign mach-policy warnings to stderr on macOS; nothing here
// reads them, but the pipe has to be drained or it eventually fills.
child.stderr.resume();

// Given its own --user-data-dir, Chrome writes the screenshot and then does
// not exit — in old headless, new headless, every combination of the first-run
// flags. Waiting on the process would hang the script forever, so this waits
// on the artifact instead: once the PNG has appeared and stopped growing, the
// job is done and the browser is no longer needed.
const finished = new Promise((resolve) => child.on("close", () => resolve("exited")));
const screenshotWritten = (async () => {
  const deadline = Date.now() + 60_000;
  let previous = -1;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      const { size } = await stat(output);
      if (size > 0 && size === previous) return "written";
      previous = size;
    } catch {
      // Not there yet.
    }
  }
  return "timeout";
})();

const outcome = await Promise.race([finished, screenshotWritten]);
if (outcome !== "exited") child.kill("SIGKILL");

server.closeAllConnections();
server.close();
await rm(profile, { recursive: true, force: true });

if (outcome === "timeout") {
  console.error("Chrome produced no screenshot within 60s; assets/og.png was not updated.");
  process.exit(1);
}

const { size } = await stat(output);
console.log(`Wrote assets/og.png — ${WIDTH}x${HEIGHT}, ${(size / 1024).toFixed(0)}KB`);
