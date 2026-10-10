import { createHash, timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer } from "@/lib/mcp";

/*
 * The MCP endpoint Claude connects to: /api/mcp/<DYDIT_MCP_SECRET>.
 *
 * The secret is in the path rather than an Authorization header because
 * claude.ai's custom-connector dialog takes only a URL — there is nowhere to
 * put a header. The URL therefore is the password: keep it out of anything
 * shared, and rotate it by changing DYDIT_MCP_SECRET and re-adding the
 * connector. It does appear in Vercel's request logs, which only you can read.
 *
 * Each request gets a fresh server and nothing is kept between them, which is
 * what a serverless function can promise anyway.
 */
const handler = createMcpHandler(buildServer);

/**
 * Compared as hashes so both sides are the same length, which timingSafeEqual
 * requires, and so the comparison takes the same time however much of a wrong
 * guess happened to match.
 */
function secretMatches(given: string): boolean {
  const expected = process.env.DYDIT_MCP_SECRET;
  if (!expected) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

async function serve(
  request: Request,
  { params }: { params: Promise<{ secret: string }> },
): Promise<Response> {
  const { secret } = await params;
  // 404 rather than 401: a wrong guess learns nothing, not even that this exists.
  if (!secretMatches(secret)) return new Response("Not found", { status: 404 });
  return handler.fetch(request);
}

export { serve as GET, serve as POST, serve as DELETE };
