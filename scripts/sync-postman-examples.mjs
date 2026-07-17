// Rebuild saved Postman REST examples through the canonical query functions.
// This makes --check cover complete response shapes, not just catalog counts.

import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const collectionPath = resolve(root, "distribution/postman-collection.json");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const cityCount = readJson("content/mcp-data/cities.json").cities.length;
const roleCount = readJson("content/mcp-data/roles.json").roles.length;
const packageVersion = readJson("package.json").version;

// queries.ts is TypeScript and uses the app's @/* alias. Bundle it the same way
// dump-openapi.mjs bundles the canonical spec, then call the real data layer.
const queryBundle = await build({
  entryPoints: [resolve(root, "src/lib/mcp/queries.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const queryModuleDir = mkdtempSync(join(tmpdir(), "postman-queries-"));
const queryModulePath = join(queryModuleDir, "queries.mjs");
writeFileSync(queryModulePath, queryBundle.outputFiles[0].text);
const queries = await import(pathToFileURL(queryModulePath).href);
rmSync(queryModuleDir, { recursive: true, force: true });

const original = readFileSync(collectionPath, "utf8");
const collection = JSON.parse(original);
let syncedExamples = 0;

function optionalString(url, name) {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function optionalInteger(url, name) {
  const raw = url.searchParams.get(name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function unwrap(result, url) {
  if (!result.ok) throw new Error(`Saved success example is invalid for ${url}: ${result.error.message}`);
  return result.data;
}

function response(input, data) {
  return { input, ...data };
}

function queryAvailabilityAtSnapshot(input, previous, url) {
  if (!Number.isInteger(previous.days_until_event)) {
    throw new Error(`Availability snapshot is missing days_until_event: ${url}`);
  }
  const eventTime = Date.parse(`${input.date}T00:00:00.000Z`);
  if (!Number.isFinite(eventTime)) throw new Error(`Availability example has an invalid date: ${url}`);

  // Postman examples are captured snapshots. Freeze Date at a point that
  // preserves the saved integer day offset while rebuilding every other field.
  const dayMs = 24 * 60 * 60 * 1000;
  const now = eventTime - (previous.days_until_event - 0.5) * dayMs;
  const RealDate = globalThis.Date;
  class SnapshotDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }

    static now() {
      return now;
    }
  }

  globalThis.Date = SnapshotDate;
  try {
    return unwrap(queries.queryAvailability(input), url);
  } finally {
    globalThis.Date = RealDate;
  }
}

function buildExample(url, previous) {
  switch (url.pathname) {
    case "/api/v1/cities": {
      const input = {
        state: optionalString(url, "state"),
        tier: optionalString(url, "tier"),
        country: optionalString(url, "country"),
        city: optionalString(url, "city"),
        limit: optionalInteger(url, "limit"),
      };
      return response(input, unwrap(queries.queryCities(input), url));
    }
    case "/api/v1/roles":
      return response({}, unwrap(queries.queryRoles(), url));
    case "/api/v1/availability": {
      const input = {
        city: optionalString(url, "city"),
        date: optionalString(url, "date"),
        role: optionalString(url, "role"),
        headcount: optionalInteger(url, "headcount"),
      };
      return response(input, queryAvailabilityAtSnapshot(input, previous, url));
    }
    case "/api/v1/pricing": {
      const input = {
        role: optionalString(url, "role"),
        city: optionalString(url, "city"),
      };
      return response(input, unwrap(queries.queryRolePricing(input), url));
    }
    case "/api/v1/compliance": {
      const input = { state: optionalString(url, "state") };
      return response(input, unwrap(queries.queryStateCompliance(input), url));
    }
    case "/api/v1/health":
      return { status: "ok", version: packageVersion };
    default:
      return null;
  }
}

function syncNode(node) {
  if (!node || typeof node !== "object") return;
  for (const savedResponse of node.response ?? []) {
    if (typeof savedResponse.body !== "string") continue;
    const rawUrl = savedResponse.originalRequest?.url?.raw;
    if (!rawUrl) continue;
    const url = new URL(rawUrl.replace("{{baseUrl}}", "https://mcp.tempguru.co"));
    const expected = buildExample(url, JSON.parse(savedResponse.body));
    if (!expected) continue;
    savedResponse.body = JSON.stringify(expected, null, 2);
    syncedExamples += 1;
  }
  for (const item of node.item ?? []) syncNode(item);
}

syncNode(collection);
const next = JSON.stringify(collection, null, 2) + "\n";
const summary = `${syncedExamples} complete responses, ${cityCount} cities, ${roleCount} roles`;

if (process.argv.includes("--check")) {
  if (next !== original) {
    console.error("Postman response examples are stale; run npm run sync:postman.");
    process.exit(1);
  }
  console.log(`Postman examples in sync: ${summary}.`);
} else {
  writeFileSync(collectionPath, next);
  console.log(`Updated Postman examples: ${summary}.`);
}
