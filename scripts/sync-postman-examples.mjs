// Keep saved Postman response examples aligned with the canonical city/role
// catalogs. Request inventory is maintained alongside OpenAPI; this script
// prevents illustrative bodies from silently retaining old role counts or
// pattern-derived URLs that no longer resolve.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const collectionPath = resolve(root, "distribution/postman-collection.json");
const cities = JSON.parse(
  readFileSync(resolve(root, "content/mcp-data/cities.json"), "utf8"),
).cities;
const roles = JSON.parse(
  readFileSync(resolve(root, "content/mcp-data/roles.json"), "utf8"),
).roles;
const tierBreakdown = cities.reduce(
  (counts, city) => ({ ...counts, [city.tier]: (counts[city.tier] ?? 0) + 1 }),
  { hub: 0, mid: 0, small: 0 },
);

const cityUrl = new Map(
  cities.map((city) => [
    city.slug,
    city.detail_url ?? `https://tempguru.co/insights/${city.slug}`,
  ]),
);
const roleRows = roles.map((role) => ({
  slug: role.slug,
  name: role.name,
  description: role.description,
  skill_tier: role.skill_tier,
  typical_shift_length_hours: role.typical_shift_length_hours,
  url:
    role.detail_url ??
    `https://tempguru.co/insights/${role.slug}-in-new-york-city`,
}));

const original = readFileSync(collectionPath, "utf8");
const collection = JSON.parse(original);

function syncNode(node) {
  if (!node || typeof node !== "object") return;
  if (typeof node.body === "string") {
    try {
      const parsed = JSON.parse(node.body);
      if (Array.isArray(parsed.cities)) {
        parsed.total = cities.length;
        if (parsed.tier_breakdown) parsed.tier_breakdown = tierBreakdown;
        for (const city of parsed.cities) {
          if (city?.slug && cityUrl.has(city.slug)) city.url = cityUrl.get(city.slug);
        }
      }
      if (Array.isArray(parsed.roles)) {
        parsed.total = roleRows.length;
        parsed.roles = roleRows;
      }
      node.body = JSON.stringify(parsed, null, 2);
    } catch {
      // Request scripts and non-JSON examples are intentionally untouched.
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(syncNode);
    else syncNode(value);
  }
}

syncNode(collection);
const next = JSON.stringify(collection, null, 2) + "\n";

if (process.argv.includes("--check")) {
  if (next !== original) {
    console.error("Postman response examples are stale; run npm run sync:postman.");
    process.exit(1);
  }
  console.log(`Postman examples in sync: ${cities.length} cities, ${roles.length} roles.`);
} else {
  writeFileSync(collectionPath, next);
  console.log(`Updated Postman examples: ${cities.length} cities, ${roles.length} roles.`);
}
