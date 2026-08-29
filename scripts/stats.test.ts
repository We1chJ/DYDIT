import { formatClock, isoWeekKey, minuteOfDay, periodKey, toDayKey, fromDayKey } from "../lib/periods";
import {
  activeOn, averageRatio, busiestHour, currentStreak, dailyStats, goalProgress,
  longestStreak, perfectDays, taskMinutes, timeOfDay,
} from "../lib/stats";
import type { Completion, Goal, Task } from "../lib/types";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n         expected ${e}\n         actual   ${a}`}`);
}

const task = (
  id: string, cadence: Task["cadence"], created: string, goal_id: string | null = null,
): Task => ({ id, title: id, cadence, goal_id, archived_at: null, created_at: created });
const comp = (
  task_id: string, period_key: string, completed_on: string, completed_minute: number | null = null,
): Completion =>
  ({ id: `${task_id}-${period_key}`, task_id, period_key, completed_on, completed_minute });

// --- ISO week keys, cross-checked by hand -----------------------------------
// 2026-01-01 is a Thursday, so ISO week 1 of 2026 runs Mon Dec 29 2025 – Sun Jan 4.
console.log("ISO weeks");
eq("Jan 1 2026 (Thu) is W01", isoWeekKey(new Date(2026, 0, 1)), "2026-W01");
eq("Dec 29 2025 (Mon) is 2026-W01", isoWeekKey(new Date(2025, 11, 29)), "2026-W01");
eq("Dec 28 2025 (Sun) is 2025-W52", isoWeekKey(new Date(2025, 11, 28)), "2025-W52");
eq("Aug 11 2026 is W33", isoWeekKey(new Date(2026, 7, 11)), "2026-W33");
eq("Aug 10 2026 (Mon) is W33", isoWeekKey(new Date(2026, 7, 10)), "2026-W33");
eq("Aug 9 2026 (Sun) is W32", isoWeekKey(new Date(2026, 7, 9)), "2026-W32");

console.log("\nperiod keys");
const d = new Date(2026, 7, 11);
eq("daily", periodKey("daily", d), "2026-08-11");
eq("weekly", periodKey("weekly", d), "2026-W33");
eq("day key is local, not UTC", toDayKey(new Date(2026, 0, 1, 23, 30)), "2026-01-01");
eq("day key round-trips", toDayKey(fromDayKey("2026-03-09")), "2026-03-09");

// --- Fixture ----------------------------------------------------------------
// A: daily from Aug 1.  B: daily from Aug 5.  C: weekly from Aug 1.
const tasks = [
  task("A", "daily", "2026-08-01T09:00:00"),
  task("B", "daily", "2026-08-05T09:00:00"),
  task("C", "weekly", "2026-08-01T09:00:00"),
];
const completions = [
  comp("A", "2026-08-10", "2026-08-10"),
  comp("A", "2026-08-11", "2026-08-11"),
  comp("B", "2026-08-11", "2026-08-11"),
  comp("A", "2026-08-12", "2026-08-12"),
  comp("B", "2026-08-12", "2026-08-12"),
  comp("C", "2026-W33", "2026-08-11"),
];

console.log("\nactiveOn");
eq("B not active before it existed", activeOn(tasks[1], "2026-08-04"), false);
eq("B active on creation day", activeOn(tasks[1], "2026-08-05"), true);
eq("archived task drops out on archive day",
  activeOn({ ...tasks[0], archived_at: "2026-08-11T09:00:00" }, "2026-08-11"), false);
eq("archived task counted the day before",
  activeOn({ ...tasks[0], archived_at: "2026-08-11T09:00:00" }, "2026-08-10"), true);

console.log("\ndailyStats  Aug 8 – Aug 12");
const days = dailyStats(tasks, completions, "2026-08-08", "2026-08-12");
eq("five days", days.length, 5);
eq("Aug 8  0/2", [days[0].done, days[0].total, days[0].level], [0, 2, 0]);
eq("Aug 9  0/2", [days[1].done, days[1].total, days[1].level], [0, 2, 0]);
eq("Aug 10 1/2 -> level 2", [days[2].done, days[2].total, days[2].level], [1, 2, 2]);
eq("Aug 11 2/2 -> level 4", [days[3].done, days[3].total, days[3].level], [2, 2, 4]);
eq("Aug 11 weekly shows as otherDone", days[3].otherDone, 1);
eq("Aug 12 2/2 -> level 4", [days[4].done, days[4].total, days[4].level], [2, 2, 4]);
eq("weekly task excluded from daily totals", days[4].total, 2);

console.log("\nstreaks & aggregates");
eq("current streak = 2", currentStreak(days, "2026-08-12"), 2);
eq("longest streak = 2", longestStreak(days), 2);
eq("perfect days = 2", perfectDays(days), 2);
eq("average = (0+0+.5+1+1)/5 = 0.5", averageRatio(days), 0.5);

// Unfinished today must not break the streak that ran through yesterday.
const openToday = dailyStats(tasks, completions, "2026-08-08", "2026-08-13");
eq("today unfinished -> streak still 2", currentStreak(openToday, "2026-08-13"), 2);

// A day with no daily tasks at all is "no data", not a zero.
const noneYet = dailyStats(tasks, completions, "2026-07-28", "2026-07-30");
eq("pre-history ratio is null", noneYet.map((x) => x.ratio), [null, null, null]);
eq("pre-history excluded from average", averageRatio(noneYet), null);


// --- Long-term goals ---------------------------------------------------------
// "today" = Aug 12 2026 (a Wednesday). A 7-day window covers Aug 6-12, which
// spans ISO weeks W32 (Aug 6-9) and W33 (Aug 10-12).
console.log("");
console.log("goalProgress  (7-day window ending Aug 12)");
const goal = (id: string, title: string): Goal =>
  ({ id, title, archived_at: null, created_at: "2026-07-01T09:00:00" });

const goals = [goal("g1", "Learn Japanese"), goal("g2", "Untouched")];
const gTasks = [
  task("anki", "daily", "2026-08-01T09:00:00", "g1"),
  task("lesson", "weekly", "2026-08-01T09:00:00", "g1"),
  task("unlinked", "daily", "2026-08-01T09:00:00", null),
];
const gComps = [
  // 3 of the 7 daily opportunities met.
  comp("anki", "2026-08-12", "2026-08-12"),
  comp("anki", "2026-08-11", "2026-08-11"),
  comp("anki", "2026-08-10", "2026-08-10"),
  // 1 of the 2 weekly opportunities met (W33 done, W32 not).
  comp("lesson", "2026-W33", "2026-08-10"),
  // Belongs to no goal - must not count toward g1.
  comp("unlinked", "2026-08-12", "2026-08-12"),
];
const gp = goalProgress(goals, gTasks, gComps, new Date(2026, 7, 12), 7);

eq("one entry per live goal", gp.length, 2);
eq("g1: 7 daily + 2 weekly opportunities, 4 met", gp[0].rate, 4 / 9);
eq("g1 due now = today's daily + this week's weekly", [gp[0].dueDone, gp[0].dueTotal], [2, 2]);
eq("g1 linked count excludes the unlinked task", gp[0].linked, 2);
eq("goal with no tasks has null rate", gp[1].rate, null);
eq("goal with no tasks is not due", [gp[1].dueDone, gp[1].dueTotal], [0, 0]);

const archived = goalProgress(
  [{ ...goals[0], archived_at: "2026-08-01T09:00:00" }], gTasks, gComps,
  new Date(2026, 7, 12), 7);
eq("archived goals are dropped", archived.length, 0);

// A task created mid-window only contributes from its creation day.
const lateGp = goalProgress([goals[0]], [task("late", "daily", "2026-08-10T09:00:00", "g1")],
  [comp("late", "2026-08-12", "2026-08-12")], new Date(2026, 7, 12), 7);
eq("a task added mid-window counts only from its creation day", lateGp[0].rate, 1 / 3);

// --- one-time tasks ---------------------------------------------------------
console.log("\nonce cadence");
eq("a one-off's key never moves", periodKey("once", new Date(2026, 7, 12)), "once");
eq("...not even a year later", periodKey("once", new Date(2027, 0, 1)), "once");

// One opportunity, however long it sits there — not one per day like a daily.
const onceGoal: Goal[] = [{ id: "g9", title: "ship", archived_at: null, created_at: "2026-08-01T09:00:00" }];
const onceTask = [task("o1", "once", "2026-08-01T09:00:00", "g9")];
eq("an undone one-off drags its goal to 0",
  goalProgress(onceGoal, onceTask, [], new Date(2026, 7, 12), 7)[0].rate, 0);
eq("a done one-off is a single met opportunity",
  goalProgress(onceGoal, onceTask, [comp("o1", "once", "2026-08-05")], new Date(2026, 7, 12), 7)[0].rate, 1);

// --- clock -----------------------------------------------------------------
console.log("\nclock");
eq("minuteOfDay at 8:40pm", minuteOfDay(new Date(2026, 7, 12, 20, 40)), 20 * 60 + 40);
eq("midnight is zero", minuteOfDay(new Date(2026, 7, 12, 0, 0)), 0);
eq("formats a round hour without minutes", formatClock(9 * 60), "9am");
eq("formats noon as 12pm", formatClock(12 * 60), "12pm");
eq("formats midnight as 12am", formatClock(0), "12am");
eq("formats 8:40pm", formatClock(20 * 60 + 40), "8:40pm");

// --- time of day ------------------------------------------------------------
console.log("\ntime of day");
const timed = [
  comp("t1", "2026-08-10", "2026-08-10", 9 * 60 + 5),
  comp("t1", "2026-08-11", "2026-08-11", 9 * 60 + 55),
  comp("t2", "2026-08-11", "2026-08-11", 21 * 60),
  comp("t3", "2026-08-12", "2026-08-12", null),
];
const curve = timeOfDay(timed);
eq("always 24 buckets", curve.length, 24);
eq("both 9am-ish ticks land in hour 9", curve[9].count, 2);
eq("the evening tick lands in hour 21", curve[21].count, 1);
eq("an untimed row is skipped, not counted at midnight", curve[0].count, 0);
eq("busiest hour is the mode", busiestHour(curve), 9);
eq("no timed data yields no busiest hour", busiestHour(timeOfDay([comp("t3", "k", "d")])), null);

// Per-task minutes come back sorted, and untimed rows are left out.
eq("taskMinutes returns only that task's timed ticks",
  JSON.stringify(taskMinutes(timed, "t1")), JSON.stringify([9 * 60 + 5, 9 * 60 + 55]));
eq("taskMinutes drops untimed rows", taskMinutes(timed, "t3").length, 0);

console.log(`\n${failures === 0 ? "PASS — all assertions held" : `FAIL — ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
