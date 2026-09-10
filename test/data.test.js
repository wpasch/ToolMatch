import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));

test("failed and invalid responses can retry; only a usable catalog is cached", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    if (attempts === 1) return { ok: false, status: 503 };
    if (attempts === 2) return { ok: true, json: async () => ({ tools: [] }) };
    if (attempts === 3) throw new TypeError("Network unavailable");
    return { ok: true, json: async () => catalog };
  });
  const { loadData } = await import("../js/data.js");
  await assert.rejects(loadData(), /503/);
  await assert.rejects(loadData(), /incomplete/);
  await assert.rejects(loadData(), /Network/);
  assert.equal(await loadData(), catalog);
  assert.equal(await loadData(), catalog);
  assert.equal(attempts, 4);
});
