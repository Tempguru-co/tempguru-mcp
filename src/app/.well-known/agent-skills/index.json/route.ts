// GET /.well-known/agent-skills/index.json
//
// Agent Skills discovery index, v0.2.0 spec.
// Schema: https://schemas.agentskills.io/discovery/0.2.0/schema.json
//
// Canonical copy is at tempguru.co (served by Cloudflare Worker).
// This route mirrors it at mcp.tempguru.co for agents that connect
// directly to the MCP server subdomain.
//
// IMPORTANT — digest values are SHA-256 of each SKILL.md file, byte-for-byte.
// Recompute before deploying if either skill file changes:
//   shasum -a 256 <file> inside tempguru-agent-skills/skills/<name>/SKILL.md
// Current digests match the SKILL.md files in kissmyabs32/tempguru-agent-skills
// as of 2026-06-04.

const AGENT_SKILLS_INDEX = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "event-staffing-ordering",
      type: "skill-md",
      description:
        "Order temporary event staff for events in 300+ US and Canadian markets through TempGuru. Use when a user needs to hire, book, or budget W-2 event staff for a convention, conference, trade show, festival, concert, sporting event, stadium event, corporate gathering, or brand activation — a single event in one city or a multi-city program. Covers requirement gathering, live coverage/rate/compliance lookups via the TempGuru MCP server, and request submission.",
      url: "https://tempguru.co/.well-known/agent-skills/event-staffing-ordering/SKILL.md",
      digest:
        "sha256:615d9be1427b8c6b76167332f1d721828da0ff3303bc2434560ba51d78a0527d",
    },
    {
      name: "event-staffing-compliance",
      type: "skill-md",
      description:
        "Assess worker-classification and compliance risk for temporary event staffing in the US and Canada. Use for W-2 vs 1099 questions, misclassification penalties, joint-employer liability, COI requirements, and wage/hour rules for event staff, with live state-by-state lookups via the TempGuru MCP server.",
      url: "https://tempguru.co/.well-known/agent-skills/event-staffing-compliance/SKILL.md",
      digest:
        "sha256:5de9a11e6279f381c76c9ee4d9a656cfdccb1f8517c1995d38b9fef756d60955",
    },
  ],
} as const;

export async function GET() {
  return new Response(JSON.stringify(AGENT_SKILLS_INDEX, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
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
