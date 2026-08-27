import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import type { Completion, Task } from "@/lib/types";

function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const start = new Date();
start.setDate(start.getDate() - 200);

const tasks: Task[] = [
  ["Read 30 minutes", "daily"],
  ["Workout", "daily"],
  ["No screens after 10", "daily"],
  ["Write morning pages", "daily"],
  ["Deep clean the kitchen", "weekly"],
  ["Review the week", "weekly"],
  ["Pay rent", "monthly"],
  ["Back up the laptop", "monthly"],
  ["Fix the bike light", "spontaneous"],
  ["Book dentist", "spontaneous"],
  ["Ship DYDIT", "longterm"],
  ["Read 24 books this year", "longterm"],
].map(([title, section], i) => ({
  id: `t${i}`,
  title: title as string,
  section: section as Task["section"],
  cadence: (section === "spontaneous" || section === "longterm"
    ? "once"
    : section) as Task["cadence"],
  archived_at: null,
  created_at: new Date(start.getTime() + i * 86400000).toISOString(),
}));

const completions: Completion[] = [];
const dailyTasks = tasks.filter((t) => t.cadence === "daily");
for (let d = 200; d >= 0; d--) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  dailyTasks.forEach((t, ti) => {
    if (new Date(t.created_at) > date) return;
    if (seeded(d * 7 + ti) > 0.36) {
      completions.push({
        id: `c${d}-${ti}`,
        task_id: t.id,
        period_key: key,
        completed_on: key,
      });
    }
  });
}
// A couple of non-daily ticks so the tooltip's "other" branch shows up.
completions.push({ id: "cw", task_id: "t4", period_key: "2026-W35", completed_on: "2026-08-25" });
completions.push({ id: "co", task_id: "t8", period_key: "once", completed_on: "2026-08-20" });

/*
 * Development-only design harness: the full dashboard driven by a year of
 * generated data, with no database and no sign-in. Useful for working on the
 * charts and for seeing the app before Supabase is configured.
 *
 * Ticking a box here updates optimistically and then surfaces the "not
 * configured" error, because there is nothing behind it to save to.
 */
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Dashboard tasks={tasks} completions={completions} email="preview@local" />;
}
