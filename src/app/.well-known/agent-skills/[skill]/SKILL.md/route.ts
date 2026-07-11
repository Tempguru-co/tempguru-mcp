// GET /.well-known/agent-skills/{skill}/SKILL.md
//
// Serves the canonical skill bytes from the MCP origin. The discovery index
// uses relative URLs, so digest-verifying installers fetch from whichever
// origin supplied the index (mcp.tempguru.co here; tempguru.co at the edge).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_SLUGS, type SkillSlug } from "@/lib/mcp/register-tools";

const SKILL_SET = new Set<string>(SKILL_SLUGS);
const SKILL_BODIES = Object.fromEntries(
  SKILL_SLUGS.map((slug) => [
    slug,
    readFileSync(join(process.cwd(), "content", "skills", `${slug}.md`), "utf8"),
  ]),
) as Record<SkillSlug, string>;

export async function GET(
  _request: Request,
  context: { params: Promise<{ skill: string }> },
) {
  const { skill } = await context.params;
  if (!SKILL_SET.has(skill)) {
    return new Response("Skill not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(SKILL_BODIES[skill as SkillSlug], {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
