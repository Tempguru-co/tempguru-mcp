// Generate the buyer-submitted REST quote-request JSON Schema from its exact
// Zod contract. Authless MCP request_quote uses a separate non-PII schema.

import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const entry = join(repoRoot, "src", "lib", "mcp", "quote.ts");
const outPath = join(repoRoot, "public", "schemas", "event-staffing-request.schema.json");

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const tmp = join(mkdtempSync(join(tmpdir(), "quote-schema-")), "quote.mjs");
writeFileSync(tmp, result.outputFiles[0].text);
const { RequestQuoteSchema } = await import(pathToFileURL(tmp).href);
const generated = RequestQuoteSchema.toJSONSchema({ target: "draft-2020-12" });
const schema = {
  ...generated,
  $id: "https://tempguru.co/schemas/event-staffing-request.schema.json",
  title: "TempGuru Event Staffing Quote Request",
  description:
    "The exact public contract accepted by the buyer-operated POST /api/v1/quote-requests endpoint. Authless MCP request_quote accepts only a saved non-PII plan reference and returns a form link.",
};

writeFileSync(outPath, JSON.stringify(schema, null, 2) + "\n");
console.log(`Wrote ${outPath} from RequestQuoteSchema`);
