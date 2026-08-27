import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { supabaseEnvOrNull } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Completion, Task } from "@/lib/types";

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

  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);

  /*
   * Archived tasks come back too: they're hidden from the lists but their past
   * completions still belong in the history, so the charts need them to work
   * out what each day's denominator actually was.
   */
  const [tasksRes, completionsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, cadence, archived_at, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("completions")
      .select("id, task_id, period_key, completed_on")
      .gte("completed_on", since.toISOString().slice(0, 10)),
  ]);

  if (tasksRes.error || completionsRes.error) {
    const message = tasksRes.error?.message ?? completionsRes.error?.message;
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
