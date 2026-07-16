// Regenerates content/mcp-data/site-urls.json: the canonical allowlist of
// published tempguru.co URL paths, taken straight from the live sitemap.
//
// Why this exists: tool results and page generators used to CONSTRUCT deep
// links from slug patterns (e.g. /insights/{role}-in-new-york-city). When a
// pattern had no published page the agent handed the buyer a 404. data.ts now
// only emits a deep link when its path is present in this snapshot, and
// check-submissions asserts that invariant. This script refreshes the snapshot.
//
// Network step, run manually / periodically (NOT in CI):  npm run build:url-map
// The snapshot is deterministic (sorted, no timestamp) so it commits cleanly.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SITEMAP = "https://tempguru.co/sitemap.xml";
const ORIGIN = "https://tempguru.co";
const OUT = resolve(process.cwd(), "content/mcp-data/site-urls.json");

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "tempguru-url-map/1.0" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

async function collectPaths() {
  const root = await fetchText(SITEMAP);
  // Handle both a flat <urlset> and a <sitemapindex> that points at children.
  const isIndex = /<sitemapindex/i.test(root);
  const sources = isIndex ? locs(root) : [null];
  const paths = new Set();
  for (const src of sources) {
    const xml = src ? await fetchText(src) : root;
    for (const loc of locs(xml)) {
      if (!loc.startsWith(ORIGIN)) continue;
      let path = loc.slice(ORIGIN.length) || "/";
      path = path.replace(/\/+$/, "") || "/"; // normalize trailing slash
      paths.add(path);
    }
  }
  return [...paths].sort();
}

const paths = await collectPaths();
if (paths.length < 100) {
  throw new Error(`sitemap yielded only ${paths.length} paths; refusing to write a truncated map`);
}
const out = {
  _meta: {
    source: SITEMAP,
    count: paths.length,
    note: "Canonical published URL paths. Regenerate with `npm run build:url-map`. Tool results and generators must only emit paths present here (see cityDetailUrl/roleDetailUrl in src/lib/mcp/data.ts and the URL-map gate in scripts/check-submissions.mjs).",
  },
  paths,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${paths.length} paths -> content/mcp-data/site-urls.json`);
