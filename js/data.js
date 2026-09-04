// Loads and caches the tool catalog from data/tools.json.
// Everything else in the app reads tool data through loadData().

let cache = null;

export async function loadData() {
  if (cache) return cache;

  const response = await fetch("data/tools.json");
  if (!response.ok) {
    throw new Error(`Could not load tools.json (HTTP ${response.status})`);
  }

  cache = await response.json();
  return cache;
}
