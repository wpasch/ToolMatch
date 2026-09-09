// Are the links in the catalog still real?
//
// Deliberately not part of `npm test`: it needs the network, it is slow, and
// a flaky CDN should never be able to fail a pull request that only touched
// CSS. It runs on a schedule instead, and the failure it reports is a chore
// for a human, not a broken build.
//
// The hard part is that a directory of AI tools is a directory of sites
// behind bot protection. A 403 from Cloudflare is not a dead link, so those
// are reported separately and do not fail the run — only a genuine 404, a
// gone host, or a server error does.

import { readFile, writeFile } from "node:fs/promises";

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;
// Some hosts serve a challenge page to anything that does not look like a
// browser. This is not evasion — it is asking the same question a visitor's
// browser would ask, so the answer means the same thing.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 ToolMatch-LinkCheck/1.0";

const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/tools.json", root), "utf8"));

// Trailing slashes, www, and http→https upgrades are all the same page. Only
// a redirect that survives this is worth anyone editing the catalog over.
function normalize(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.host.replace(/^www\./, "") +
      parsed.pathname.replace(/\/$/, "") +
      parsed.search
    );
  } catch {
    return url;
  }
}

async function attempt(tool) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // GET rather than HEAD: enough sites answer HEAD with 405 that the
    // method itself becomes the thing being tested.
    const response = await fetch(tool.url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal,
    });
    // The body is never read, but leaving it unconsumed keeps the socket
    // open until GC gets to it, which starves the pool on a catalog-wide run.
    await response.body?.cancel();

    if ([403, 405, 429, 503].includes(response.status)) {
      return { tool, state: "blocked", detail: `HTTP ${response.status}` };
    }
    if (!response.ok) {
      return { tool, state: "dead", detail: `HTTP ${response.status}` };
    }
    if (normalize(response.url) !== normalize(tool.url)) {
      return { tool, state: "moved", detail: `→ ${response.url}` };
    }
    return { tool, state: "ok", detail: "" };
  } catch (error) {
    if (signal.aborted) {
      return { tool, state: "dead", detail: `timed out after ${TIMEOUT_MS / 1000}s` };
    }
    // A header block too big for the client is still a server that answered,
    // which is the whole question being asked. Google in particular sends
    // more Set-Cookie than Node's default 16KB buffer holds; the run raises
    // that limit, and anything still overflowing is unverifiable, not dead.
    if (error.cause?.code === "UND_ERR_HEADERS_OVERFLOW") {
      return { tool, state: "blocked", detail: "response headers exceed the client limit" };
    }
    return { tool, state: "dead", detail: error.cause?.message ?? error.message };
  }
}

// Sending the whole catalog in one burst produces transient failures that have nothing
// to do with the link: a connection reset, a DNS hiccup, a TLS handshake that
// lost a race. Reporting a live site as dead is the one result that makes this
// tool worse than not running it, so a network-level failure is always given a
// second chance before it counts. An honest 404 is not retried — the server
// already answered.
async function check(tool) {
  const first = await attempt(tool);
  if (first.state !== "dead" || /^HTTP /.test(first.detail)) return first;

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const second = await attempt(tool);
  if (second.state === "dead") second.detail += " (twice)";
  return second;
}

// A fixed pool of workers pulling from one shared queue, so a single slow
// host delays itself rather than a whole batch.
const queue = [...data.tools];
const results = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let tool = queue.shift(); tool; tool = queue.shift()) {
      results.push(await check(tool));
    }
  })
);

const by = (state) =>
  results
    .filter((row) => row.state === state)
    .sort((a, b) => a.tool.name.localeCompare(b.tool.name));

const dead = by("dead");
const moved = by("moved");
const blocked = by("blocked");

function report(title, rows) {
  if (rows.length === 0) return;
  console.log(`\n${title}`);
  for (const { tool, detail } of rows) {
    console.log(`  ${tool.id.padEnd(20)} ${tool.url}`);
    console.log(`  ${" ".repeat(20)} ${detail}`);
  }
}

report(`Dead (${dead.length}) — fix or drop these:`, dead);
report(`Moved (${moved.length}) — update the catalog URL:`, moved);

// ---------- The blind spot, tracked ----------
//
// A directory of AI tools is a directory of sites behind bot protection, and
// eighteen of them answer a link check with a challenge page no matter what.
// Printing the same eighteen every week is not a report, it is noise nobody
// reads — and noise nobody reads is where a real change hides.
//
// So the set is committed, and the run reports the difference. A tool that
// used to verify and now does not is worth a look: a challenge page is what
// a moved path looks like from here, since the server answers 403 whether or
// not the URL still exists. A tool that has stopped being blocked is worth
// knowing too — it can finally be checked automatically again.
const baselineFile = new URL("data/link-baseline.json", root);
// A missing baseline is the first run, not an error: everything currently
// blocked is the starting set, and --save writes it down.
const baseline = JSON.parse(await readFile(baselineFile, "utf8").catch(() => "null")) ?? {
  note: "Catalog URLs whose hosts answer a link check with a challenge page. Regenerate with: npm run links -- --save",
  blocked: blocked.map(({ tool }) => tool.id).sort(),
};
const wasBlocked = new Set(baseline.blocked);
const nowBlocked = new Set(blocked.map(({ tool }) => tool.id));

const newlyBlocked = blocked.filter(({ tool }) => !wasBlocked.has(tool.id));
const noLongerBlocked = [...wasBlocked].filter((id) => !nowBlocked.has(id)).sort();

if (process.argv.includes("--save")) {
  const updated = { ...baseline, blocked: [...nowBlocked].sort() };
  await writeFile(baselineFile, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`\nWrote data/link-baseline.json — ${nowBlocked.size} unverifiable.`);
} else {
  report(
    `Newly unverifiable (${newlyBlocked.length}) — these used to answer; check the URL by hand:`,
    newlyBlocked
  );
  if (noLongerBlocked.length > 0) {
    console.log(
      `\nNo longer blocked (${noLongerBlocked.length}) — verified automatically now, ` +
        `drop from the baseline with \`npm run links -- --save\`:`
    );
    for (const id of noLongerBlocked) console.log(`  ${id}`);
  }
}

const stillBlocked = blocked.length - newlyBlocked.length;
console.log(
  `\n${results.length} links · ${by("ok").length} ok · ${moved.length} moved · ` +
    `${blocked.length} unverifiable (${stillBlocked} known) · ${dead.length} dead\n`
);

// A dead link fails, and so does a change in the blocked set — that is the
// whole point of tracking it. A redirect stays a chore, and the eighteen
// sites that have always served a challenge page page nobody.
const changed = newlyBlocked.length + noLongerBlocked.length;
if (process.argv.includes("--save")) process.exit(dead.length > 0 ? 1 : 0);
process.exit(dead.length > 0 || changed > 0 ? 1 : 0);
