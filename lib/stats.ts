import { addDays, daysBetween, fromDayKey, toDayKey } from "./periods";
import type { Completion, Task } from "./types";

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
