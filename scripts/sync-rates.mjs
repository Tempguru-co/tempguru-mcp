// Keep the MCP's bundled rate data in lockstep with the website's canonical
// source. The city builder edits site/city-v2/{cities-rates,rate-inheritance}.json;
// the deployed MCP can only read what's committed into the app, so it bundles a
// copy under content/mcp-data/. This script is the one bridge between them.
//
//   node scripts/sync-rates.mjs           copy canonical -> MCP, report
//   node scripts/sync-rates.mjs --check   verify they match; exit 1 if drifted
//                                         (skips cleanly when the source is absent,
//                                          e.g. on Vercel where site/ isn't deployed)
//
// Wire the --check form into the build so a stale MCP copy can never ship.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAIRS = [
  ["site/city-v2/cities-rates.json", "content/mcp-data/city-rates.json"],
  ["site/city-v2/rate-inheritance.json", "content/mcp-data/rate-inheritance.json"],
];

const check = process.argv.includes("--check");
let drift = 0;
let synced = 0;
let checked = 0;
let skipped = 0;

for (const [srcRel, dstRel] of PAIRS) {
  const src = join(root, srcRel);
  const dst = join(root, dstRel);

  if (!existsSync(src)) {
    // Canonical source not present (deployed build, fresh clone), the committed
    // MCP copy is authoritative here, nothing to do.
    console.log(`  skip: ${srcRel} not present (using committed MCP copy)`);
    skipped++;
    continue;
  }
  checked++;
  const srcData = readFileSync(src, "utf8");
  const dstData = existsSync(dst) ? readFileSync(dst, "utf8") : null;

  if (srcData === dstData) {
    console.log(`  ok:   ${dstRel} matches ${srcRel}`);
    continue;
  }
  if (check) {
    drift++;
    console.error(`  DRIFT: ${dstRel} is out of sync with ${srcRel}. Run: npm run sync-rates`);
  } else {
    writeFileSync(dst, srcData);
    synced++;
    console.log(`  synced: ${srcRel} -> ${dstRel}`);
  }
}

if (check && drift > 0) {
  console.error(`\nrate data drift detected (${drift} file(s)). The MCP would ship stale rates.`);
  process.exit(1);
}
if (check && checked === 0) {
  console.log(`\nrate sync: skipped; ${skipped} canonical website source file(s) absent, using committed MCP copies.`);
} else if (check) {
  console.log(`\nrate sync: ${checked} source file(s) in sync${skipped ? `; ${skipped} absent source file(s) skipped` : ""}.`);
} else {
  console.log(`\nrate sync: ${synced} file(s) updated.`);
}
