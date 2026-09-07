// Which listings are going stale, oldest first.
//
// validate-data.js draws a hard line at 120 days and fails the build there.
// That line is the right one, but on its own it turns re-checking into a
// cliff: every tool was checked in the same week, so they all expire in the
// same week. This is the rolling view that keeps it a chore instead — run it,
// re-check the top of the list, move on.
//
//   npm run stale            everything, oldest first
//   npm run stale -- 90      only what is 90 days or older

import { readFile } from "node:fs/promises";

const MAX_AGE_DAYS = 120; // must match validate-data.js
const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/tools.json", root), "utf8"));

const threshold = Number(process.argv[2]) || 0;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const ageOf = (tool) =>
  Math.floor((today - new Date(`${tool.pricingChecked}T00:00:00Z`)) / 86_400_000);

const rows = data.tools
  .map((tool) => ({ tool, age: ageOf(tool) }))
  .filter((row) => row.age >= threshold)
  .sort((a, b) => b.age - a.age || a.tool.name.localeCompare(b.tool.name));

if (rows.length === 0) {
  console.log(`Nothing is ${threshold} days old or older.`);
  process.exit(0);
}

const width = Math.max(...rows.map((row) => row.tool.name.length));
console.log("");
console.log(`  days  checked     tool${" ".repeat(width - 4)}  category`);
console.log(`  ────  ──────────  ${"─".repeat(width)}  ────────`);

for (const { tool, age } of rows) {
  const flag = age > MAX_AGE_DAYS ? "!" : " ";
  console.log(
    `${flag} ${String(age).padStart(4)}  ${tool.pricingChecked}  ` +
      `${tool.name.padEnd(width)}  ${tool.category}`
  );
}

const overdue = rows.filter((row) => row.age > MAX_AGE_DAYS).length;
const oldest = rows[0].age;
// Counted off the whole catalog, not the filtered rows: "when does the build
// break" is not a question a --days filter should be able to change.
const nextBreak = MAX_AGE_DAYS - Math.max(...data.tools.map(ageOf));

console.log("");
console.log(
  `${rows.length} of ${data.tools.length} tools · oldest ${oldest}d · ` +
    (overdue
      ? `${overdue} past ${MAX_AGE_DAYS}d and failing validation`
      : `validation fails in ${nextBreak} days`)
);
console.log("");
