import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { fromDayKey, isoWeekKey } from "@/lib/periods";
import type { Completion, Task } from "@/lib/types";

/*
 * The reminder sender.
 *
 * Called on a schedule, not by a person. It asks, for everyone who wants
 * reminders: is it their hour right now, and is anything still outstanding for
 * the period? If so it pushes once and records which period it pushed for, so
 * the next hour's run stays quiet.
 *
 * This runs with no session, so it cannot use RLS — it needs the service role
 * key to read across accounts. That key bypasses every policy in the database,
 * which is why it is read from the environment and never sent anywhere.
 */

export const dynamic = "force-dynamic";
// web-push needs Node crypto; this must not be moved to an edge runtime.
export const runtime = "nodejs";

type SettingsRow = {
  user_id: string;
  day_start_hour: number;
  timezone: string | null;
  remind_hour: number | null;
  remind_enabled: boolean;
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_notified_key: string | null;
};

/** The wall clock in someone else's timezone, right now. */
function clockIn(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${at("year")}-${at("month")}-${at("day")}`,
    // Intl renders midnight as "24" in some locales; fold it back to 0.
    hour: Number(at("hour")) % 24,
  };
}

/** The day a moment counts for, given a day that begins at startHour. */
function logicalDay(date: string, hour: number, startHour: number): string {
  if (hour >= startHour) return date;
  const d = fromDayKey(date);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function outstanding(tasks: Task[], done: Set<string>, dayKey: string) {
  const week = isoWeekKey(fromDayKey(dayKey));

  const openDaily = tasks.filter(
    (t) => t.cadence === "daily" && !done.has(`${t.id}|${dayKey}`),
  ).length;
  const openWeekly = tasks.filter(
    (t) => t.cadence === "weekly" && !done.has(`${t.id}|${week}`),
  ).length;

  return { openDaily, openWeekly, periodKey: dayKey };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const offered = request.headers.get("authorization");
  if (!secret || offered !== `Bearer ${secret}`) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!url || !serviceKey || !publicKey || !privateKey) {
    return Response.json({ error: "Reminders are not configured." }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:nobody@example.com",
    publicKey,
    privateKey,
  );

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: everyone, error } = await admin
    .from("settings")
    .select("user_id, day_start_hour, timezone, remind_hour, remind_enabled")
    .eq("remind_enabled", true);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const report: Record<string, unknown>[] = [];

  for (const s of (everyone ?? []) as SettingsRow[]) {
    // Without a timezone there is no way to know whether it is their evening.
    if (!s.timezone || s.remind_hour === null) continue;

    let clock;
    try {
      clock = clockIn(now, s.timezone);
    } catch {
      report.push({ user: s.user_id, skipped: "unknown timezone" });
      continue;
    }
    if (clock.hour !== s.remind_hour) continue;

    const dayKey = logicalDay(clock.date, clock.hour, s.day_start_hour);

    const [tasksRes, compsRes, subsRes] = await Promise.all([
      admin
        .from("tasks")
        .select("id, title, cadence, goal_id, archived_at, created_at")
        .eq("user_id", s.user_id)
        .is("archived_at", null),
      admin
        .from("completions")
        .select("id, task_id, period_key, completed_on, completed_minute")
        .eq("user_id", s.user_id)
        .gte("completed_on", logicalDay(clock.date, 0, 8)),
      admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, last_notified_key")
        .eq("user_id", s.user_id),
    ]);

    const tasks = (tasksRes.data ?? []) as Task[];
    const comps = (compsRes.data ?? []) as Completion[];
    const subs = (subsRes.data ?? []) as SubRow[];
    if (subs.length === 0) continue;

    const done = new Set(comps.map((c) => `${c.task_id}|${c.period_key}`));
    const { openDaily, openWeekly, periodKey } = outstanding(tasks, done, dayKey);

    // Nothing to say. The to-do list is deliberately excluded: a one-off has no
    // deadline, and nagging about it forever is how notifications get muted.
    if (openDaily === 0 && openWeekly === 0) continue;

    const bits = [
      openDaily > 0 ? `${openDaily} daily` : null,
      openWeekly > 0 ? `${openWeekly} weekly` : null,
    ].filter(Boolean);

    const body = `${bits.join(" and ")} still waiting.`;

    for (const sub of subs) {
      if (sub.last_notified_key === periodKey) continue;

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: "Did you do it today?", body, url: "/" }),
          { TTL: 6 * 60 * 60 },
        );
        await admin
          .from("push_subscriptions")
          .update({ last_notified_key: periodKey })
          .eq("id", sub.id);
        report.push({ user: s.user_id, sent: sub.endpoint.slice(-12) });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away — so should we,
        // or every run from here on retries a dead endpoint.
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          report.push({ user: s.user_id, pruned: sub.endpoint.slice(-12) });
        } else {
          report.push({ user: s.user_id, failed: status ?? "unknown" });
        }
      }
    }
  }

  return Response.json({ ran: now.toISOString(), report });
}
