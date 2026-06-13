// OpenAI Apps domain-verification challenge (ChatGPT app directory).
//
// The app console (platform.openai.com → ChatGPT Apps → TempGuru Event
// Staffing → MCP Server step) issues a token and verifies domain control by
// fetching it from this origin-root well-known URL. The token is public by
// design, that is the point of the challenge, so committing it is fine.
// If the app is ever re-created, the console issues a NEW token: update the
// string here and redeploy before clicking Verify Domain.

export const dynamic = "force-static";

const TOKEN = "2OETA7WrcHhoC2q2jBJ2tobeuRk5vJynqCFu-rQ6auY";

export function GET() {
  return new Response(TOKEN, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
