import { addDays, daysBetween, isoWeekKey, periodKey, toDayKey } from "@/lib/periods";
import type { Completion, Task } from "@/lib/types";

/*
 * What to do next.
 *
 * Only three things ever go on this list, so the question is not "what is
 * outstanding" — plenty is, always — but "what would I most regret skipping".
 * Three signals answer that, and they answer it differently:
 *
 *   deadline    a weekly task on Sunday is nearly out of week; on Monday it is
 *               not. A daily task is due today either way, which is ordinary
 *               rather than urgent, so it scores low on its own.
 *   streak      what breaks if today is missed. Fourteen days is a real loss;
 *               zero days is nothing to protect.
 *   staleness   how long it has been ignored. This is the one that catches the
 *               thing quietly rotting, which no deadline ever will.
 *
 * They are summed rather than ranked in tiers, so a task can earn its place by
 * being moderately all three rather than extremely one.
 */

/** Each signal contributes at most this, which is what keeps them comparable. */
const CAP = 3;

/*
 * Where each signal stops growing.
 *
 * Neglect needs a month to become the loudest thing about a task. A streak
 * needs far less: a fortnight of daily reps is already worth protecting, and
 * setting this as high as the staleness plateau meant a run had to reach ten
 * days before it outranked the plain fact of being due — by which point the
 * list had stopped saying anything useful about it.
 */
const STREAK_PLATEAU = 15;
const STALE_PLATEAU = 30;

/** Walking back further than this to measure a streak changes no ordering. */
const MAX_LOOKBACK = 60;

export type FocusItem = {
  task: Task;
  /** Why it is on the list — the single signal that put it there. */
  reason: string;
  score: number;
};

/** Days until the ISO week ends. 0 on Sunday, 6 on Monday. */
function daysLeftInWeek(d: Date): number {
  return 6 - ((d.getDay() + 6) % 7);
}

/**
 * How many periods in a row this was completed, ending just before now.
 *
 * Deliberately excludes the current period: the task is on this list precisely
 * because the current one is not done, and counting it would always give zero.
 */
function streakBefore(
  task: Task,
  keys: Set<string>,
  today: Date,
): number {
  if (task.cadence === "once") return 0;
  const step = task.cadence === "weekly" ? -7 : -1;
  const keyOf = task.cadence === "weekly" ? isoWeekKey : toDayKey;

  let n = 0;
  let d = addDays(today, step);
  while (n < MAX_LOOKBACK && keys.has(keyOf(d))) {
    n++;
    d = addDays(d, step);
  }
  return n;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The few tasks worth looking at right now, most pressing first.
 *
 * `today` is the logical day — already shifted by the day-start hour — so the
 * period keys here line up with the ones the lists are ticked against.
 */
export function focusList(
  tasks: Task[],
  completions: Completion[],
  today: Date,
  limit = 3,
): FocusItem[] {
  const todayKey = toDayKey(today);

  const periodsByTask = new Map<string, Set<string>>();
  const lastDoneByTask = new Map<string, string>();
  for (const c of completions) {
    let seen = periodsByTask.get(c.task_id);
    if (!seen) {
      seen = new Set();
      periodsByTask.set(c.task_id, seen);
    }
    seen.add(c.period_key);

    const last = lastDoneByTask.get(c.task_id);
    if (!last || c.completed_on > last) {
      lastDoneByTask.set(c.task_id, c.completed_on);
    }
  }

  const items: FocusItem[] = [];

  for (const task of tasks) {
    if (task.archived_at) continue;

    const keys = periodsByTask.get(task.id) ?? new Set<string>();
    // Already done for this period is not something to suggest.
    if (keys.has(periodKey(task.cadence, today))) continue;

    // Never done falls back to how long it has been sitting there unattended,
    // which for a task added weeks ago is exactly the point.
    const since = lastDoneByTask.get(task.id) ?? toDayKey(new Date(task.created_at));
    const staleDays = Math.max(0, daysBetween(since, todayKey));
    const streak = streakBefore(task, keys, today);
    const daysLeft = daysLeftInWeek(today);

    let deadline = 0;
    let deadlineReason = "";
    if (task.cadence === "weekly") {
      deadline = Math.max(0, CAP - daysLeft);
      deadlineReason =
        daysLeft === 0 ? "last day this week" : `${plural(daysLeft, "day")} left this week`;
    } else if (task.cadence === "daily") {
      // Due today, but a fresh one arrives tomorrow — ordinary, not urgent.
      deadline = 1;
      deadlineReason = "due today";
    }

    const streakRisk = (Math.min(streak, STREAK_PLATEAU) / STREAK_PLATEAU) * CAP;
    const staleness = (Math.min(staleDays, STALE_PLATEAU) / STALE_PLATEAU) * CAP;

    /*
     * The row says the most *informative* thing, which is not always the
     * highest-scoring one. "Due today" is true of every daily task on the list,
     * so as a reason it distinguishes nothing; a streak, however short, at
     * least says what is at stake here specifically. Ordering is unaffected —
     * this only chooses the words.
     */
    const stale =
      task.cadence === "once"
        ? `sat here ${plural(staleDays, "day")}`
        : `${plural(staleDays, "day")} untouched`;

    let reason: string;
    if (staleness > Math.max(deadline, streakRisk)) {
      reason = stale;
    } else if (task.cadence === "weekly" && daysLeft <= 1) {
      // Genuinely about to expire, which outranks anything else worth saying.
      reason = deadlineReason;
    } else if (streak >= 2) {
      reason = `${plural(streak, task.cadence === "weekly" ? "week" : "day")} on the line`;
    } else {
      reason = deadlineReason;
    }

    items.push({ task, reason, score: deadline + streakRisk + staleness });
  }

  // Sorted by title as the final tie-break so the list does not reshuffle
  // between renders when two tasks score identically.
  items.sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title));
  return items.slice(0, limit);
}
