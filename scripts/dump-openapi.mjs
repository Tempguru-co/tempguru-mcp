// Dump the OpenAPI 3.1 spec to a static JSON artifact so non-TypeScript tools
// (the OKF generator, external consumers) can read it without a build step.
//
// The spec is defined in TypeScript (src/lib/api/openapi.ts, served by the
// /openapi.json route). This bundles that module with esbuild and evaluates
// buildOpenApiSpec() to produce content/mcp-data/openapi.json. Wired ahead of
// build-okf in `npm run build` so api.md can be DERIVED from the real spec and
// cannot drift from what the API serves.
//
//   node scripts/dump-openapi.mjs

import { build } from "esbuild";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const entry = join(repoRoot, "src", "lib", "api", "openapi.ts");
const outPath = join(repoRoot, "content", "mcp-data", "openapi.json");

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});

const tmp = join(mkdtempSync(join(tmpdir(), "okf-openapi-")), "openapi.mjs");
writeFileSync(tmp, result.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);
const spec = mod.buildOpenApiSpec();

writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${outPath}, OpenAPI ${spec.openapi}, ${Object.keys(spec.paths || {}).length} paths, ${Object.keys(spec.components?.schemas || {}).length} schemas`);
