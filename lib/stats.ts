import { addDays, daysBetween, fromDayKey, isoWeekKey, periodKey, toDayKey } from "./periods";
import type { Completion, Goal, Task } from "./types";

/*
 * Everything the charts show is derived here, from raw rows, with no database
 * involvement. One user's history is at most a few thousand rows, so computing
 * in JS keeps the logic in one testable file instead of split across SQL views.
 */

export type DayStat = {
  dayKey: string;
  /** Daily tasks completed that day. */
  done: number;
  /** Daily tasks that existed that day. */
  total: number;
  /** done/total, or null when no daily tasks existed yet — "no data", not zero. */
  ratio: number | null;
  /** 0–4 heatmap bucket. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Weekly / monthly / one-off completions logged that day, for the tooltip. */
  otherDone: number;
};

/** Fast lookup of "is this task done for this period?" */
export function completionIndex(completions: Completion[]): Set<string> {
  return new Set(completions.map((c) => `${c.task_id}:${c.period_key}`));
}

export function isDone(
  index: Set<string>,
  taskId: string,
  key: string,
): boolean {
  return index.has(`${taskId}:${key}`);
}

/**
 * Was this task alive on that day? A task created today must not drag down
 * last week's completion rate, and an archived one must not drag down today's.
 */
export function activeOn(task: Task, dayKey: string): boolean {
  const created = toDayKey(new Date(task.created_at));
  if (dayKey < created) return false;
  if (task.archived_at) {
    const archived = toDayKey(new Date(task.archived_at));
    if (dayKey >= archived) return false;
  }
  return true;
}

function levelFor(ratio: number | null): 0 | 1 | 2 | 3 | 4 {
  if (ratio === null || ratio <= 0) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * One DayStat per day in [fromKey, toKey] inclusive.
 *
 * Heatmap intensity tracks DAILY tasks only. Mixing weekly and monthly items in
 * would make a cell's meaning depend on the calendar — a Monday would look
 * better than a Tuesday purely because weeklies reset. Those still surface in
 * the tooltip as `otherDone`.
 */
export function dailyStats(
  tasks: Task[],
  completions: Completion[],
  fromKey: string,
  toKey: string,
): DayStat[] {
  const index = completionIndex(completions);
  const dailyTasks = tasks.filter((t) => t.cadence === "daily");

  const otherByDay = new Map<string, number>();
  const dailyIds = new Set(dailyTasks.map((t) => t.id));
  for (const c of completions) {
    if (dailyIds.has(c.task_id)) continue;
    otherByDay.set(c.completed_on, (otherByDay.get(c.completed_on) ?? 0) + 1);
  }

  const span = daysBetween(fromKey, toKey);
  const start = fromDayKey(fromKey);
  const out: DayStat[] = [];

  for (let i = 0; i <= span; i++) {
    const dayKey = toDayKey(addDays(start, i));
    const active = dailyTasks.filter((t) => activeOn(t, dayKey));
    const done = active.filter((t) => isDone(index, t.id, dayKey)).length;
    const total = active.length;
    const ratio = total === 0 ? null : done / total;
    out.push({
      dayKey,
      done,
      total,
      ratio,
      level: levelFor(ratio),
      otherDone: otherByDay.get(dayKey) ?? 0,
    });
  }
  return out;
}

/**
 * Consecutive perfect days ending today.
 *
 * Today counts only once it's actually complete — an unfinished morning must
 * not read as a broken streak. A day with no daily tasks at all ends the
 * streak, since there's no evidence of follow-through to extend it.
 */
export function currentStreak(days: DayStat[], todayKey: string): number {
  const byKey = new Map(days.map((d) => [d.dayKey, d]));
  let streak = 0;
  let cursor = fromDayKey(todayKey);

  const today = byKey.get(todayKey);
  if (!(today && today.ratio === 1)) {
    cursor = addDays(cursor, -1); // today still in progress; start from yesterday
  }

  for (;;) {
    const stat = byKey.get(toDayKey(cursor));
    if (!stat || stat.ratio !== 1) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: DayStat[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.ratio === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** Mean completion rate across days that had any daily tasks. Null if none did. */
export function averageRatio(days: DayStat[]): number | null {
  const scored = days.filter((d) => d.ratio !== null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, d) => acc + (d.ratio as number), 0);
  return sum / scored.length;
}

/** Days belonging to the given YYYY-MM month. */
export function inMonth(days: DayStat[], month: string): DayStat[] {
  return days.filter((d) => d.dayKey.startsWith(month));
}

/** Number of days at 100% — the "perfect days" stat. */
export function perfectDays(days: DayStat[]): number {
  return days.filter((d) => d.ratio === 1).length;
}

/* ------------------------------------------------------------------------- */
/* Long-term goals                                                            */
/* ------------------------------------------------------------------------- */

export type GoalProgress = {
  goal: Goal;
  /** Completion rate over the window, or null if nothing was ever due. */
  rate: number | null;
  /** Linked tasks due right now (today for daily, this week for weekly). */
  dueTotal: number;
  dueDone: number;
  /** How many live tasks point at this goal. */
  linked: number;
};

/**
 * Progress for every goal, derived entirely from the tasks pointing at it.
 *
 * The bar is a completion *rate* over a rolling window rather than a running
 * total: a goal you stopped feeding a month ago should visibly fall back, which
 * an ever-growing count could never show. Daily and weekly tasks contribute on
 * the same footing — each counts once per period it was actually due, so one
 * daily task doesn't drown out a weekly one just by coming round more often.
 */
export function goalProgress(
  goals: Goal[],
  tasks: Task[],
  completions: Completion[],
  today: Date,
  windowDays: number,
): GoalProgress[] {
  const index = completionIndex(completions);
  const todayKey = toDayKey(today);

  // The days in the window, newest first, plus the week each one belongs to.
  const days: { dayKey: string; weekKey: string }[] = [];
  const weekRepresentative = new Map<string, string>();
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(today, -i);
    const dayKey = toDayKey(date);
    const weekKey = isoWeekKey(date);
    days.push({ dayKey, weekKey });
    // The newest day seen for a week decides whether that week counted at all.
    if (!weekRepresentative.has(weekKey)) weekRepresentative.set(weekKey, dayKey);
  }

  return goals
    .filter((g) => !g.archived_at)
    .map((goal) => {
      const linked = tasks.filter(
        (t) => t.goal_id === goal.id && !t.archived_at,
      );

      let opportunities = 0;
      let met = 0;

      for (const task of linked) {
        if (task.cadence === "once") {
          // A one-off is a single opportunity for as long as it exists, not a
          // recurring one — it either got done or it is still outstanding.
          opportunities++;
          if (isDone(index, task.id, "once")) met++;
        } else if (task.cadence === "daily") {
          for (const { dayKey } of days) {
            if (!activeOn(task, dayKey)) continue;
            opportunities++;
            if (isDone(index, task.id, dayKey)) met++;
          }
        } else {
          for (const [weekKey, dayKey] of weekRepresentative) {
            if (!activeOn(task, dayKey)) continue;
            opportunities++;
            if (isDone(index, task.id, weekKey)) met++;
          }
        }
      }

      let dueTotal = 0;
      let dueDone = 0;
      for (const task of linked) {
        if (!activeOn(task, todayKey)) continue;
        dueTotal++;
        if (isDone(index, task.id, periodKey(task.cadence, today))) dueDone++;
      }

      return {
        goal,
        rate: opportunities === 0 ? null : met / opportunities,
        dueTotal,
        dueDone,
        linked: linked.length,
      };
    });
}


export type HourBucket = { hour: number; count: number };

/**
 * Completions bucketed by the local hour they were ticked in.
 *
 * Rows written before completed_minute existed carry no time and are skipped
 * rather than counted at midnight, which would invent a spike at hour zero.
 */
export function timeOfDay(completions: Completion[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  for (const c of completions) {
    if (c.completed_minute === null) continue;
    const hour = Math.floor(c.completed_minute / 60);
    if (hour < 0 || hour > 23) continue;
    buckets[hour].count++;
  }

  return buckets;
}

/**
 * The hour holding the most completions, or null if nothing is timed yet.
 *
 * Deliberately the mode rather than a mean or median: those wrap badly around
 * midnight, where a task done at 11pm and again at 1am would average to noon —
 * an hour it has never once been done in.
 */
export function busiestHour(buckets: HourBucket[]): number | null {
  let best: HourBucket | null = null;
  for (const b of buckets) {
    if (b.count > 0 && (best === null || b.count > best.count)) best = b;
  }
  return best === null ? null : best.hour;
}

/** Every timed completion of one task, as minutes since local midnight. */
export function taskMinutes(
  completions: Completion[],
  taskId: string,
): number[] {
  return completions
    .filter((c) => c.task_id === taskId && c.completed_minute !== null)
    .map((c) => c.completed_minute as number)
    .sort((a, b) => a - b);
}
