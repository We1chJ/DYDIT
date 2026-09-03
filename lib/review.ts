import {
  addDays,
  daysBetween,
  fromDayKey,
  isoWeekKey,
  toDayKey,
} from "@/lib/periods";
import { activeOn, completionIndex, dailyStats, isDone } from "@/lib/stats";
import type { Completion, Goal, Task } from "@/lib/types";

/*
 * The week, read back.
 *
 * Everything here is derived from rows already in the browser, so the review
 * costs nothing to open. It answers four questions in order of how much they
 * sting: what got done, what kept slipping, which goals moved, and what has
 * been sitting untouched long enough to have been forgotten.
 *
 * A week is the ISO week — Monday to Sunday — because that is what a weekly
 * task's period key already means, and having two different weeks in one app
 * would be a bug waiting to happen.
 */

export type Slip = {
  task: Task;
  /** Days in the week the task was due and not done. */
  missed: number;
  /** Days it was due at all, so 1 of 7 reads differently from 1 of 2. */
  due: number;
};

export type GoalMove = { goal: Goal; days: number };

export type Stale = { task: Task; days: number };

export type WeekReview = {
  weekKey: string;
  /** Monday and Sunday of the week, as day keys. */
  from: string;
  to: string;
  /** True when the week has not finished yet. */
  current: boolean;
  /** Daily ticks landed, over daily chances that existed. */
  done: number;
  total: number;
  /** Days in the week where every daily task was done. Never counts a day
   *  with nothing due, which would otherwise be free credit. */
  perfectDays: number;
  /** Weekly tasks, since they are due once across the whole week. */
  weeklyDone: number;
  weeklyTotal: number;
  /** One-offs ticked during the week — no denominator exists for these. */
  onceDone: number;
  slips: Slip[];
  goalsMoved: GoalMove[];
  stale: Stale[];
};

/** Monday of the ISO week containing `d`. */
export function weekStart(d: Date): Date {
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  // getDay is Sunday-first; ISO weeks are not.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export function review(
  tasks: Task[],
  completions: Completion[],
  goals: Goal[],
  /** Any day inside the week being reviewed. */
  inWeek: Date,
  today: Date,
  dayStartHour: number,
  limit = 3,
): WeekReview {
  const monday = weekStart(inWeek);
  const sunday = addDays(monday, 6);
  const from = toDayKey(monday);
  const to = toDayKey(sunday);
  const weekKey = isoWeekKey(monday);
  const todayKey = toDayKey(today);
  const current = weekKey === isoWeekKey(today);

  // A week in progress is only judged as far as it has actually got.
  const lastKey = current && todayKey < to ? todayKey : to;
  const index = completionIndex(completions);

  const days = dailyStats(tasks, completions, from, lastKey, dayStartHour);
  const done = days.reduce((n, d) => n + d.done, 0);
  const total = days.reduce((n, d) => n + d.total, 0);
  const perfectDays = days.filter((d) => d.total > 0 && d.done === d.total).length;

  // --- what kept slipping ---------------------------------------------------
  const slips: Slip[] = [];
  for (const task of tasks) {
    if (task.cadence !== "daily") continue;
    let missed = 0;
    let due = 0;
    for (const d of days) {
      if (!activeOn(task, d.dayKey, dayStartHour)) continue;
      due++;
      if (!isDone(index, task.id, d.dayKey)) missed++;
    }
    if (missed > 0) slips.push({ task, missed, due });
  }
  slips.sort((a, b) => b.missed - a.missed || a.task.title.localeCompare(b.task.title));

  // --- weekly and one-off tallies ------------------------------------------
  const weeklyTasks = tasks.filter(
    (t) => t.cadence === "weekly" && activeOn(t, lastKey, dayStartHour),
  );
  const weeklyDone = weeklyTasks.filter((t) => isDone(index, t.id, weekKey)).length;

  const inRange = completions.filter((c) => c.completed_on >= from && c.completed_on <= to);
  const onceIds = new Set(
    tasks.filter((t) => t.cadence === "once").map((t) => t.id),
  );
  const onceDone = inRange.filter((c) => onceIds.has(c.task_id)).length;

  // --- which goals moved ----------------------------------------------------
  const goalsMoved: GoalMove[] = [];
  for (const goal of goals) {
    if (goal.archived_at) continue;
    const ids = new Set(
      tasks.filter((t) => t.goal_id === goal.id).map((t) => t.id),
    );
    const touched = new Set<string>();
    for (const c of inRange) if (ids.has(c.task_id)) touched.add(c.completed_on);
    if (touched.size > 0) goalsMoved.push({ goal, days: touched.size });
  }
  goalsMoved.sort((a, b) => b.days - a.days || a.goal.title.localeCompare(b.goal.title));

  // --- what has gone untouched ---------------------------------------------
  const lastDone = new Map<string, string>();
  for (const c of completions) {
    const seen = lastDone.get(c.task_id);
    if (!seen || c.completed_on > seen) lastDone.set(c.task_id, c.completed_on);
  }
  const stale: Stale[] = tasks
    .filter((t) => !t.archived_at)
    .map((task) => {
      // Never done falls back to how long it has been sitting there, which for
      // something added weeks ago is exactly the complaint.
      const since =
        lastDone.get(task.id) ?? toDayKey(new Date(task.created_at));
      return { task, days: Math.max(0, daysBetween(since, to)) };
    })
    // A week is the floor: anything done inside the week under review is not
    // being forgotten, it is just not done today.
    .filter((s) => s.days > 7)
    .sort((a, b) => b.days - a.days || a.task.title.localeCompare(b.task.title));

  return {
    weekKey,
    from,
    to,
    current,
    done,
    total,
    perfectDays,
    weeklyDone,
    weeklyTotal: weeklyTasks.length,
    onceDone,
    slips: slips.slice(0, limit),
    goalsMoved: goalsMoved.slice(0, limit),
    stale: stale.slice(0, limit),
  };
}

/** The week a review should open on: the last one that actually finished. */
export function lastCompleteWeek(today: Date): Date {
  return addDays(weekStart(today), -7);
}

/** Formats a week as "Aug 31 – Sep 6". */
export function formatWeekRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const a = fromDayKey(from).toLocaleDateString(undefined, opts);
  const b = fromDayKey(to).toLocaleDateString(undefined, opts);
  return `${a} – ${b}`;
}
