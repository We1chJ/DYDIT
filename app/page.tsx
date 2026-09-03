import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { isAllowed } from "@/lib/allowlist";
import { supabaseEnvOrNull } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, type Completion, type Goal, type Settings, type Task } from "@/lib/types";

// Always reflects the live rows; a cached dashboard would show stale checkboxes.
export const dynamic = "force-dynamic";

/** How far back the heatmap and trend charts can look. */
const HISTORY_DAYS = 400;

export default async function Page() {
  // First run, before .env.local exists: explain the setup rather than crash.
  if (!supabaseEnvOrNull()) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAllowed(user.email)) return <NotAllowed email={user.email} />;

  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);

  /*
   * Archived tasks come back too: they're hidden from the lists but their past
   * completions still belong in the history, so the charts need them to work
   * out what each day's denominator actually was.
   */
  const [tasksRes, completionsRes, goalsRes, settingsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, cadence, goal_id, sort_order, archived_at, created_at")
      // Manual order first, creation order underneath it — see lib/order.ts,
      // whose comparator has to stay in step with these two lines.
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("completions")
      .select("id, task_id, period_key, completed_on, completed_minute")
      .gte("completed_on", since.toISOString().slice(0, 10)),
    supabase
      .from("goals")
      .select("id, title, archived_at, created_at")
      .order("created_at", { ascending: true }),
    // maybeSingle: there is no row until something is changed from the default.
    supabase
      .from("settings")
      .select("day_start_hour, timezone, review_seen_week")
      .maybeSingle(),
  ]);

  // A missing row is the expected state, not an error, so only a real failure
  // is worth surfacing — the defaults cover the rest.
  const settings: Settings = settingsRes.data ?? DEFAULT_SETTINGS;

  if (tasksRes.error || completionsRes.error || goalsRes.error) {
    const message =
      tasksRes.error?.message ??
      completionsRes.error?.message ??
      goalsRes.error?.message;
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-[17px] font-semibold">Couldn&rsquo;t load your list</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">{message}</p>
        <p className="mt-4 text-[13px] text-faint">
          If this is a fresh project, run <code>supabase/schema.sql</code> in the
          Supabase SQL editor first.
        </p>
      </main>
    );
  }

  return (
    <Dashboard
      tasks={(tasksRes.data ?? []) as Task[]}
      completions={(completionsRes.data ?? []) as Completion[]}
      goals={(goalsRes.data ?? []) as Goal[]}
      settings={settings}
      email={user.email ?? ""}
    />
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto max-w-[440px] px-6 py-24">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
        Almost there
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
        DYDIT needs a Supabase project to keep your list in. It takes about five
        minutes.
      </p>
      <ol className="mt-5 space-y-3 text-[14px] leading-relaxed text-foreground">
        <li>
          <span className="text-faint">1.</span> Create a project at{" "}
          <a
            href="https://database.new"
            className="text-primary underline underline-offset-2"
          >
            database.new
          </a>
        </li>
        <li>
          <span className="text-faint">2.</span> Run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
            supabase/schema.sql
          </code>{" "}
          in its SQL editor
        </li>
        <li>
          <span className="text-faint">3.</span> Copy{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
            .env.local.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">
            .env.local
          </code>{" "}
          and fill in the project URL and publishable key
        </li>
      </ol>
      <p className="mt-6 text-[13px] leading-relaxed text-faint">
        The README has the full walkthrough. In the meantime,{" "}
        <a href="/preview" className="underline underline-offset-2">
          /preview
        </a>{" "}
        shows the interface with sample data.
      </p>
    </main>
  );
}

/**
 * A signed-in account that isn't on the list. Reached only if ALLOWED_EMAILS is
 * set and someone else's account exists — which the Supabase signup switch is
 * supposed to prevent in the first place.
 */
function NotAllowed({ email }: { email?: string }) {
  return (
    <main className="mx-auto max-w-[420px] px-6 py-24">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
        Not your list
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        {email ? <span className="text-foreground">{email}</span> : "This account"}{" "}
        isn&rsquo;t allowed on this instance.
      </p>
      <form action="/auth/signout" method="post" className="mt-5">
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
