import { createHash, timingSafeEqual } from "node:crypto";
import webpush from "web-push";

/*
 * The reminder sender.
 *
 * It does not decide who to remind. Postgres does that — see
 * supabase/reminders.sql — and posts the finished list here. That split is the
 * whole point: working out who is behind means reading across every account,
 * which from outside the database needs the service role key, and that key
 * bypasses every RLS policy there is. Inside the database no key is needed at
 * all, so the credential simply stops existing anywhere it could leak.
 *
 * What is left here is the one part Postgres genuinely cannot do: signing a
 * VAPID JWT and encrypting the payload for each browser.
 *
 * The consequence is that this route holds no write access either. It cannot
 * record what it sent, so Postgres marks the reminders before posting them —
 * see the note there about which way that fails.
 */

export const dynamic = "force-dynamic";
// web-push needs Node crypto; this must not be moved to an edge runtime.
export const runtime = "nodejs";

type Reminder = {
  endpoint: string;
  p256dh: string;
  auth: string;
  body: string;
};

/**
 * Checks the caller's bearer token against the stored digest.
 *
 * Only the *hash* is deployed here. The token itself is generated inside
 * Postgres and never leaves it, so there is no copy of it in this project's
 * environment for anyone to read back. Plain SHA-256 is the right primitive
 * because the token is 256 bits of randomness, not a guessable password.
 */
function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET_SHA256?.trim();
  if (!expected) return false;

  const offered = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const a = createHash("sha256").update(offered).digest();
  const b = Buffer.from(expected, "hex");
  // timingSafeEqual throws on a length mismatch, so that is checked first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return Response.json({ error: "Reminders are not configured." }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:nobody@example.com",
    publicKey,
    privateKey,
  );

  let reminders: Reminder[];
  try {
    const payload = (await request.json()) as { reminders?: unknown };
    reminders = Array.isArray(payload?.reminders)
      ? (payload.reminders as Reminder[])
      : [];
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  let sent = 0;
  const dead: string[] = [];
  const failed: { endpoint: string; status: number | string }[] = [];

  for (const r of reminders) {
    if (!r?.endpoint || !r?.p256dh || !r?.auth) continue;

    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({
          title: "Did you do it today?",
          body: r.body,
          url: "/",
        }),
        { TTL: 6 * 60 * 60 },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404 and 410 mean the browser threw the subscription away. This route
      // can no longer delete it, so it is named in the response instead — the
      // reply is stored by pg_net, which is where a cleanup would read it.
      if (status === 404 || status === 410) dead.push(r.endpoint);
      else failed.push({ endpoint: r.endpoint.slice(-12), status: status ?? "unknown" });
    }
  }

  return Response.json({ sent, dead, failed });
}
