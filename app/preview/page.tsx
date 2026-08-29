import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import type { Completion, Goal, Task } from "@/lib/types";

function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const start = new Date();
start.setDate(start.getDate() - 200);

const goals: Goal[] = [
  ["g1", "Learn Japanese"],
  ["g2", "Run a half marathon"],
  ["g3", "Ship DYDIT"],
].map(([id, title]) => ({
  id,
  title,
  archived_at: null,
  created_at: start.toISOString(),
}));

const tasks: Task[] = (
  [
    ["Anki, 20 cards", "daily", "g1"],
    ["Read 30 minutes", "daily", null],
    ["Easy run", "daily", "g2"],
    ["No screens after 10", "daily", null],
    ["Grammar lesson", "weekly", "g1"],
    ["Long run", "weekly", "g2"],
    ["Ship one feature", "weekly", "g3"],
    ["Deep clean the kitchen", "weekly", null],
    // One-offs, so the Once card shows a real list rather than its empty state.
    ["Book the dentist", "once", null],
    ["Reply to the landlord", "once", null],
    ["Renew the passport", "once", null],
  ] as const
).map(([title, cadence, goal_id], i) => ({
  id: `t${i}`,
  title,
  cadence,
  goal_id,
  archived_at: null,
  created_at: new Date(start.getTime() + i * 86400000).toISOString(),
}));

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** ISO week key, matching lib/periods.ts. */
function weekKey(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
  const isoYear = t.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3,
  );
  const week =
    1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const completions: Completion[] = [];
const seenWeeks = new Set<string>();

/*
 * A plausible clock time for a generated tick.
 *
 * Two humps — a morning one around 8am and a larger evening one around 9pm —
 * because a flat random minute would draw a flat curve, and a flat curve tells
 * you nothing about whether the chart works. Deterministic, like `seeded`.
 */
function seededMinute(n: number): number {
  const pick = seeded(n * 3 + 1);
  const spread = (seeded(n * 5 + 2) - 0.5) * 150;
  const centre = pick > 0.62 ? 21 * 60 : 8 * 60;
  return Math.max(0, Math.min(1439, Math.round(centre + spread)));
}

for (let d = 200; d >= 0; d--) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  const dk = dayKey(date);
  const wk = weekKey(date);

  tasks.forEach((t, ti) => {
    if (new Date(t.created_at) > date) return;

    if (t.cadence === "daily") {
      if (seeded(d * 7 + ti) > 0.36) {
        completions.push({
          id: `c${d}-${ti}`,
          task_id: t.id,
          period_key: dk,
          completed_on: dk,
          completed_minute: seededMinute(d * 7 + ti),
        });
      }
      return;
    }

    if (t.cadence === "once") {
      // Ticked one time, on one day, under the key that never moves.
      if (t.id === "t8" && d === 3) {
        completions.push({
          id: `co-${t.id}`,
          task_id: t.id,
          period_key: "once",
          completed_on: dk,
          completed_minute: 11 * 60 + 20,
        });
      }
      return;
    }

    // Weekly: at most one completion per ISO week per task.
    const mark = `${t.id}:${wk}`;
    if (seenWeeks.has(mark)) return;
    if (seeded(d * 13 + ti) > 0.45) {
      seenWeeks.add(mark);
      completions.push({
        id: `cw${d}-${ti}`,
        task_id: t.id,
        period_key: wk,
        completed_on: dk,
        completed_minute: seededMinute(d * 13 + ti),
      });
    }
  });
}

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
  return (
    <Dashboard
      tasks={tasks}
      completions={completions}
      goals={goals}
      email="preview@local"
    />
  );
}
