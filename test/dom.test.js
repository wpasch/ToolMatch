// The boundary where catalog data stops being trusted.
//
// data/tools.json is a file in a public repository, so a pull request can put
// anything in it — and these are the four functions standing between that and
// the page. They had no tests, which is backwards: search ranking being a bit
// off is a bad recommendation, and one of these being a bit off is script
// execution or a file read from outside the repository.

import assert from "node:assert/strict";
import test from "node:test";

// dom.js resolves relative URLs against the document. Nothing in its module
// body touches `window`, only its functions do, so the shim is in place well
// before any test runs.
globalThis.window = { location: { href: "https://wpasch.github.io/ToolMatch/" } };

const { safeUrl, logoUrl, escapeHtml, titleCase, formatCheckedDate } = await import(
  "../js/dom.js"
);

test("safeUrl passes http and https and resolves relative paths", () => {
  assert.equal(safeUrl("https://example.com/tool"), "https://example.com/tool");
  assert.equal(safeUrl("http://example.com/tool"), "http://example.com/tool");
  assert.equal(
    safeUrl("assets/logos/otter.png"),
    "https://wpasch.github.io/ToolMatch/assets/logos/otter.png"
  );
});

test("safeUrl refuses every scheme that could execute", () => {
  for (const hostile of [
    "javascript:alert(1)",
    // The URL parser strips leading whitespace and interior tabs and
    // newlines before it decides on a scheme, so these are all the same
    // `javascript:` — which is exactly why checking the raw string for a
    // "javascript:" prefix would not have been enough.
    "  javascript:alert(1)",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/abc",
  ]) {
    assert.equal(safeUrl(hostile), null, `${hostile} must not survive safeUrl`);
  }
});

test("safeUrl never throws, and junk stays on this origin", () => {
  // safeUrl resolves relative paths because logoUrl hands it one, so its
  // contract is "no scheme that can execute" — not "must be absolute". A
  // garbage value therefore comes back as a harmless same-origin URL rather
  // than null. What matters is that it never throws and never escapes:
  // validate-data.js is what guarantees no tool ships a URL like this.
  for (const junk of [null, undefined, "", "://", {}, []]) {
    const resolved = safeUrl(junk);
    assert.ok(
      resolved.startsWith("https://wpasch.github.io/ToolMatch/"),
      `${JSON.stringify(junk)} resolved off-origin: ${resolved}`
    );
  }
});

test("logoUrl only builds a filename from an id that cannot escape the folder", () => {
  assert.equal(logoUrl({ id: "otter" }), "assets/logos/otter.png");
  assert.equal(logoUrl({ id: "tl-dv" }), "assets/logos/tl-dv.png");

  for (const hostile of [
    "../../etc/passwd",
    "..",
    "a/b",
    "a\\b",
    ".hidden",
    "-leading-dash",
    "Otter", // the pattern is lowercase, and a case-folding filesystem would
    "otter.png", // otherwise let two ids point at one file
    "otter%2e%2e",
    "",
  ]) {
    assert.equal(logoUrl({ id: hostile }), null, `${hostile} must not become a path`);
  }

  assert.equal(logoUrl({}), null);
  assert.equal(logoUrl(null), null);
});

test("escapeHtml neutralises every character that can break out of markup", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
  assert.equal(escapeHtml("it's"), "it&#39;s");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  // Escaped first, so an already-escaped entity cannot be reassembled.
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  assert.equal(escapeHtml(null), "null");
  assert.equal(escapeHtml(42), "42");
});

test("titleCase handles the hyphenated ids it is given", () => {
  assert.equal(titleCase("freemium"), "Freemium");
  assert.equal(titleCase("chat-assistant"), "Chat assistant");
  assert.equal(titleCase(""), "");
  assert.equal(titleCase(null), "");
});

test("formatCheckedDate reads a date-only value as a calendar date", () => {
  // The regression this guards: `new Date("2026-01-01")` is midnight UTC, so
  // anywhere west of Greenwich it formats as the last day of the year before.
  // The assertion avoids naming a month, since the runner's locale decides
  // that and CI's is not the developer's.
  const formatted = formatCheckedDate("2026-01-01");
  assert.ok(formatted.includes("2026"), `expected a 2026 date, got ${formatted}`);
  assert.ok(!formatted.includes("2025"), `date slipped a day: ${formatted}`);

  for (const bad of ["", "nope", "2026-1-1", "26-01-01", null, undefined]) {
    assert.equal(formatCheckedDate(bad), null);
  }
});
