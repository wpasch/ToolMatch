// Cache only successfully parsed, usable catalogs. Failed requests can retry.
let cache = null;

export async function loadData() {
  if (cache) return cache;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("data/tools.json", { signal: controller.signal });
    if (!response.ok) throw new Error(`Could not load catalog (HTTP ${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.categories) || !data.categories.length ||
        !Array.isArray(data.tools) || !data.tools.length ||
        !data.categories.every((c) => typeof c.id === "string" && typeof c.label === "string") ||
        !data.tools.every((tool) =>
          typeof tool.id === "string" && typeof tool.name === "string" &&
          typeof tool.category === "string" && Array.isArray(tool.tags) &&
          Array.isArray(tool.useCases) && tool.pricing && typeof tool.pricing.model === "string"
        )) throw new Error("Catalog is incomplete");
    cache = data;
    return cache;
  } finally {
    clearTimeout(timeout);
  }
}
