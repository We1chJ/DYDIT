import { formatClock, isoWeekKey, logicalDayKey, minuteOfDay, periodKey, toDayKey, fromDayKey } from "../lib/periods";
import {
  activeOn, averageRatio, busiestHour, currentStreak, dailyStats, goalStats,
  longestStreak, perfectDays, taskMinutes, timeOfDay,
} from "../lib/stats";
import { focusList } from "../lib/focus";
import { formatWeekRange, lastCompleteWeek, review, weekStart } from "../lib/review";
import { compareTasks, orderForMove, sortOrderBetween } from "../lib/order";
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
  sort_order: number | null = null,
): Task => ({ id, title: id, cadence, goal_id, sort_order, archived_at: null, created_at: created });
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
eq("B not active before it existed", activeOn(tasks[1], "2026-08-04", 0), false);
eq("B active on creation day", activeOn(tasks[1], "2026-08-05", 0), true);
eq("archived task drops out on archive day",
  activeOn({ ...tasks[0], archived_at: "2026-08-11T09:00:00" }, "2026-08-11", 0), false);
eq("archived task counted the day before",
  activeOn({ ...tasks[0], archived_at: "2026-08-11T09:00:00" }, "2026-08-10", 0), true);

console.log("\ndailyStats  Aug 8 – Aug 12");
const days = dailyStats(tasks, completions, "2026-08-08", "2026-08-12", 0);
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
const openToday = dailyStats(tasks, completions, "2026-08-08", "2026-08-13", 0);
eq("today unfinished -> streak still 2", currentStreak(openToday, "2026-08-13"), 2);

// A day with no daily tasks at all is "no data", not a zero.
const noneYet = dailyStats(tasks, completions, "2026-07-28", "2026-07-30", 0);
eq("pre-history ratio is null", noneYet.map((x) => x.ratio), [null, null, null]);
eq("pre-history excluded from average", averageRatio(noneYet), null);


// --- Long-term goals ---------------------------------------------------------
// "today" = Aug 12 2026 (a Wednesday). The goals were created Jul 1, so they
// are 43 days old inclusive.
console.log("");
console.log("goalStats  (today = Aug 12 2026)");
const goal = (id: string, title: string): Goal =>
  ({ id, title, archived_at: null, created_at: "2026-07-01T09:00:00" });

const goals = [goal("g1", "Learn Japanese"), goal("g2", "Untouched")];
const gTasks = [
  task("anki", "daily", "2026-08-01T09:00:00", "g1"),
  task("lesson", "weekly", "2026-08-01T09:00:00", "g1"),
  task("unlinked", "daily", "2026-08-01T09:00:00", null),
];
const gComps = [
  comp("anki", "2026-08-12", "2026-08-12"),
  comp("anki", "2026-08-11", "2026-08-11"),
  comp("anki", "2026-08-10", "2026-08-10"),
  // Same day as the anki tick above, so it must not add a fourth active day.
  comp("lesson", "2026-W33", "2026-08-10"),
  // Belongs to no goal - must not count toward g1.
  comp("unlinked", "2026-08-12", "2026-08-12"),
];
const gs = goalStats(goals, gTasks, gComps, new Date(2026, 7, 12), 0);

eq("one entry per live goal", gs.length, 2);
eq("g1 active on 3 distinct days", gs[0].activeDays, 3);
eq("two ticks on one day still count as one day", gs[0].activeDays, 3);
eq("g1 age is inclusive of both ends", gs[0].ageDays, 43);
eq("g1 streak runs Aug 10-12", gs[0].streak, 3);
eq("g1 due now = today's daily + this week's weekly", [gs[0].dueDone, gs[0].dueTotal], [2, 2]);
eq("g1 linked count excludes the unlinked task", gs[0].linked, 2);
eq("goal with no tasks has no active days", gs[1].activeDays, 0);
eq("goal with no tasks has no streak", gs[1].streak, 0);
eq("goal with no tasks is not due", [gs[1].dueDone, gs[1].dueTotal], [0, 0]);

// An untouched today must not break a run that is otherwise current.
const gapComps = [comp("anki", "2026-08-11", "2026-08-11"), comp("anki", "2026-08-10", "2026-08-10")];
eq("an untouched today leaves the streak standing",
  goalStats([goals[0]], gTasks, gapComps, new Date(2026, 7, 12), 0)[0].streak, 2);

// Two days idle does break it.
const staleComps = [comp("anki", "2026-08-09", "2026-08-09")];
eq("a missed day ends the streak",
  goalStats([goals[0]], gTasks, staleComps, new Date(2026, 7, 12), 0)[0].streak, 0);

// A goal made today is one day old, never zero.
eq("a goal created today is one day old",
  goalStats([goal("g3", "New")].map((g) => ({ ...g, created_at: "2026-08-12T09:00:00" })),
    [], [], new Date(2026, 7, 12), 0)[0].ageDays, 1);

const archived = goalStats(
  [{ ...goals[0], archived_at: "2026-08-01T09:00:00" }], gTasks, gComps,
  new Date(2026, 7, 12), 0);
eq("archived goals are dropped", archived.length, 0);

// --- one-time tasks ---------------------------------------------------------
console.log("\nonce cadence");
eq("a one-off's key never moves", periodKey("once", new Date(2026, 7, 12)), "once");
eq("...not even a year later", periodKey("once", new Date(2027, 0, 1)), "once");

// A one-off contributes the single day it was ticked, and nothing after.
const onceGoal: Goal[] = [{ id: "g9", title: "ship", archived_at: null, created_at: "2026-08-01T09:00:00" }];
const onceTask = [task("o1", "once", "2026-08-01T09:00:00", "g9")];
eq("an undone one-off leaves its goal with no active days",
  goalStats(onceGoal, onceTask, [], new Date(2026, 7, 12), 0)[0].activeDays, 0);
eq("a done one-off marks the day it was ticked",
  goalStats(onceGoal, onceTask, [comp("o1", "once", "2026-08-05")], new Date(2026, 7, 12), 0)[0].activeDays, 1);

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

// --- where the day is cut ----------------------------------------------------
console.log("\nday start hour");
// With a 3am boundary, 1am on the 12th still belongs to the 11th.
eq("1am counts for the night before", logicalDayKey(new Date(2026, 7, 12, 1, 30), 3), "2026-08-11");
eq("2:59am is still the day before", logicalDayKey(new Date(2026, 7, 12, 2, 59), 3), "2026-08-11");
eq("3am starts the new day", logicalDayKey(new Date(2026, 7, 12, 3, 0), 3), "2026-08-12");
eq("the evening is unaffected", logicalDayKey(new Date(2026, 7, 12, 23, 0), 3), "2026-08-12");
// Hour 0 must behave exactly as the plain calendar day always did.
eq("hour 0 is the calendar day", logicalDayKey(new Date(2026, 7, 12, 1, 30), 0), "2026-08-12");
eq("hour 0 matches toDayKey", logicalDayKey(new Date(2026, 7, 12, 1, 30), 0), toDayKey(new Date(2026, 7, 12, 1, 30)));
// Crossing a month boundary backwards.
eq("1am on the 1st belongs to the last of the month before",
  logicalDayKey(new Date(2026, 8, 1, 1, 0), 3), "2026-08-31");

// A task created at 1am is active for the day it was really made: the night
// before, not the calendar date the clock had already rolled to.
const nightTask = task("n1", "daily", "2026-08-12T01:30:00");
eq("a 1am task counts from the night before", activeOn(nightTask, "2026-08-11", 3), true);
eq("...and not from a day earlier still", activeOn(nightTask, "2026-08-10", 3), false);


// --- manual ordering --------------------------------------------------------
console.log("\nsort order");
eq("an empty list starts at 1", sortOrderBetween(null, null), 1);
eq("dropping above the top goes below it", sortOrderBetween(null, 3), 2);
eq("dropping past the end goes above it", sortOrderBetween(3, null), 4);
eq("between two neighbours is the midpoint", sortOrderBetween(2, 3), 2.5);
eq("...and stays strictly between them", sortOrderBetween(2.5, 2.75), 2.625);
// Negative numbers happen the moment something is dragged above position 1.
eq("the top of a list can go negative", sortOrderBetween(null, -1), -2);

// Four rows numbered 1,2,3,4, in the order the list shows them.
const ordered = (n: number[]) =>
  n.map((v, i) => task(`t${i}`, "daily", `2026-01-0${i + 1}`, null, v));

console.log("\nmoving a row");
eq("first to last", orderForMove(ordered([1, 2, 3, 4]), 0, 3), 5);
eq("last to first", orderForMove(ordered([1, 2, 3, 4]), 3, 0), 0);
// Downwards is the case that is easy to get one place short: once the held row
// is lifted out, slot 2's neighbours are the old rows 2 and 3, not 1 and 2.
eq("first to the middle", orderForMove(ordered([1, 2, 3, 4]), 0, 2), 3.5);
eq("last to the middle", orderForMove(ordered([1, 2, 3, 4]), 3, 1), 1.5);
eq("swapping a pair", orderForMove(ordered([1, 2]), 0, 1), 3);

console.log("\nlist order");
eq("sort_order wins over creation order",
  [...ordered([3, 1, 2])].sort(compareTasks).map((t) => t.id), ["t1", "t2", "t0"]);
// A row written before the column existed has to fall to the end, never the
// top — a null sorting first would silently reshuffle somebody's whole list.
eq("a null sort_order sorts last", [
  task("old", "daily", "2020-01-01", null, null),
  task("new", "daily", "2026-01-01", null, 5),
].sort(compareTasks).map((t) => t.id), ["new", "old"]);
eq("ties fall back to created_at", [
  task("later", "daily", "2026-02-01", null, 1),
  task("earlier", "daily", "2026-01-01", null, 1),
].sort(compareTasks).map((t) => t.id), ["earlier", "later"]);

// --- what to focus on -------------------------------------------------------
// 2026-08-10 is a Monday, so 08-15 is Saturday and 08-16 is Sunday, all in W33.
console.log("\nfocus list");

const sunday = new Date(2026, 7, 16);
const saturday = new Date(2026, 7, 15);
const monday = new Date(2026, 7, 10);
const daily = (id: string) => task(id, "daily", "2026-01-01T09:00:00");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** n consecutive daily completions ending yesterday, relative to Sunday. */
const runOf = (id: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = dayKey(new Date(2026, 7, 15 - i));
    return comp(id, k, k);
  });

// The deadline signal only speaks when the week is actually running out.
const wk = [task("w1", "weekly", "2026-01-01T09:00:00")];
const lastWeek = [comp("w1", "2026-W32", "2026-08-08")];
eq("a weekly on Saturday has a day left",
  focusList(wk, lastWeek, saturday)[0].reason, "1 day left this week");
eq("a weekly on Sunday is out of week",
  focusList(wk, [comp("w1", "2026-W32", "2026-08-03")], sunday)[0].reason, "last day this week");
// The same task, the same week: pressure rises as the days run out.
eq("the same weekly is more pressing on Sunday than Monday",
  focusList(wk, [comp("w1", "2026-W32", "2026-08-03")], sunday)[0].score >
  focusList(wk, [comp("w1", "2026-W32", "2026-08-03")], monday)[0].score, true);

// Done for this period is not something to be told about.
eq("a finished weekly is not listed",
  focusList(wk, [comp("w1", "2026-W33", "2026-08-11")], sunday).length, 0);
eq("a finished daily is not listed",
  focusList([daily("d1")], [comp("d1", "2026-08-16", "2026-08-16")], sunday).length, 0);

// A streak worth protecting takes over the row; a short one does not pretend to.
eq("a fortnight-long streak is what the row reports",
  focusList([daily("d1")], runOf("d1", 14), sunday)[0].reason, "14 days on the line");
// Even a short run says more than "due today", which is true of every daily.
eq("a short streak still says what is at stake",
  focusList([daily("d1")], runOf("d1", 3), sunday)[0].reason, "3 days on the line");
eq("with no run at all it falls back to the deadline",
  focusList([daily("d1")], runOf("d1", 1), sunday)[0].reason, "due today");
// A weekly about to expire outranks anything else worth saying about it.
eq("an expiring weekly leads with the deadline, not its run",
  focusList(wk, [comp("w1", "2026-W32", "2026-08-14")], sunday)[0].reason,
  "last day this week");
// Same staleness, same deadline: the longer run leads.
eq("the longer streak leads",
  focusList([daily("keep"), daily("cold")],
    [...runOf("keep", 20), ...runOf("cold", 1)], sunday).map((f) => f.task.id),
  ["keep", "cold"]);

// Neglect is the signal no deadline ever catches.
eq("a one-off reports how long it has sat",
  focusList([task("t1", "once", "2026-06-01T09:00:00")], [], sunday)[0].reason,
  "sat here 76 days");
eq("a neglected daily reports the gap",
  focusList([daily("d1")], [comp("d1", "2026-08-04", "2026-08-04")], sunday)[0].reason,
  "12 days untouched");
// Never done at all falls back to how long it has been sitting there.
eq("a task never done outranks one done yesterday",
  focusList([daily("never"), daily("fresh")], runOf("fresh", 1), sunday).map((f) => f.task.id),
  ["never", "fresh"]);

// Only ever three, and nothing archived.
eq("the list stays short",
  focusList(Array.from({ length: 9 }, (_, i) => daily(`t${i}`)), [], sunday).length, 3);
const goneTask: Task = { ...daily("gone"), archived_at: "2026-08-01T00:00:00" };
eq("archived tasks are left out", focusList([goneTask], [], sunday).length, 0);
eq("nothing outstanding yields nothing", focusList([], [], sunday).length, 0);


// --- goal contributions -----------------------------------------------------
console.log("\ngoal contributions");
{
  const g = goal("g1", "Master Japanese");
  const wk = task("wanikani", "daily", "2026-07-01T09:00:00", "g1");
  const duo = task("duolingo", "daily", "2026-07-01T09:00:00", "g1");
  // Three days both landed; two more only WaniKani did.
  const comps = [
    comp("wanikani", "2026-08-10", "2026-08-10"), comp("duolingo", "2026-08-10", "2026-08-10"),
    comp("wanikani", "2026-08-11", "2026-08-11"), comp("duolingo", "2026-08-11", "2026-08-11"),
    comp("wanikani", "2026-08-12", "2026-08-12"), comp("duolingo", "2026-08-12", "2026-08-12"),
    comp("wanikani", "2026-08-13", "2026-08-13"),
    comp("wanikani", "2026-08-14", "2026-08-14"),
  ];
  const [st] = goalStats([g], [wk, duo], comps, new Date(2026, 7, 16), 3);
  eq("the goal moved on five days", st.activeDays, 5);
  eq("heaviest contributor leads", st.contributors.map((c) => c.task.id), ["wanikani", "duolingo"]);
  eq("WaniKani was there every day", st.contributors[0].days, 5);
  eq("...so its share is all of them", st.contributors[0].share, 1);
  eq("Duolingo covered three", st.contributors[1].days, 3);
  eq("shares are of days, and may exceed 1 together",
    st.contributors[0].share + st.contributors[1].share > 1, true);
  // The point of the whole feature: which days would not have happened.
  eq("WaniKani carried two days alone", st.contributors[0].soloDays, 2);
  eq("Duolingo carried none alone", st.contributors[1].soloDays, 0);
  eq("a goal nothing touched has no contributors with days",
    goalStats([goal("g2", "Idle")], [], [], new Date(2026, 7, 16), 3)[0].contributors, []);
}

// --- the weekly review ------------------------------------------------------
// ISO week 33 of 2026 runs Mon Aug 10 – Sun Aug 16.
console.log("\nweekly review");
{
  const d1 = task("d1", "daily", "2026-01-01T09:00:00");
  const d2 = task("d2", "daily", "2026-01-01T09:00:00");
  const w1 = task("w1", "weekly", "2026-01-01T09:00:00");
  const o1 = task("o1", "once", "2026-01-01T09:00:00");
  const days = ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-15","2026-08-16"];
  const comps = [
    ...days.map((k) => comp("d1", k, k)),          // d1 every day
    comp("d2", "2026-08-10", "2026-08-10"),        // d2 only on the Monday
    comp("w1", "2026-W33", "2026-08-12"),
    comp("o1", "once", "2026-08-13"),
  ];
  // Reviewed from outside the week, so the whole week counts.
  const r = review([d1, d2, w1, o1], comps, [], new Date(2026, 7, 12), new Date(2026, 7, 20), 3);

  eq("the week is named", r.weekKey, "2026-W33");
  eq("Monday to Sunday", [r.from, r.to], ["2026-08-10", "2026-08-16"]);
  eq("a past week is not current", r.current, false);
  eq("eight of fourteen daily chances taken", [r.done, r.total], [8, 14]);
  eq("only the Monday was perfect", r.perfectDays, 1);
  eq("the weekly task landed", [r.weeklyDone, r.weeklyTotal], [1, 1]);
  eq("one one-off was ticked", r.onceDone, 1);
  eq("d2 is the thing that slipped", r.slips.map((s) => s.task.id), ["d2"]);
  eq("...on six of its seven days", [r.slips[0].missed, r.slips[0].due], [6, 7]);

  // A week still running is only judged as far as it has got.
  const mid = review([d1, d2, w1, o1], comps, [], new Date(2026, 7, 12), new Date(2026, 7, 12), 3);
  eq("a running week is flagged", mid.current, true);
  eq("...and only counts up to today", [mid.done, mid.total], [4, 6]);

  // Goals moved, counted in days rather than ticks.
  const g = goal("g1", "Japanese");
  const linked = task("d3", "daily", "2026-01-01T09:00:00", "g1");
  const gr = review([linked], [comp("d3", "2026-08-10", "2026-08-10"), comp("d3", "2026-08-11", "2026-08-11")],
    [g], new Date(2026, 7, 12), new Date(2026, 7, 20), 3);
  eq("the goal moved on two days", gr.goalsMoved.map((m) => [m.goal.id, m.days]), [["g1", 2]]);

  // Untouched: anything done inside the week is not being forgotten.
  const forgotten = task("cold", "daily", "2026-01-01T09:00:00");
  const sr = review([d1, forgotten], comps, [], new Date(2026, 7, 12), new Date(2026, 7, 20), 3);
  eq("only the long-neglected is listed", sr.stale.map((s) => s.task.id), ["cold"]);

  // The strongest day, by ratio rather than raw count.
  eq("the best day is the one with the highest ratio", r.bestDay?.dayKey, "2026-08-10");
  eq("...reported as a fraction", [r.bestDay?.done, r.bestDay?.total], [2, 2]);
  eq("a week with nothing ever due has no best day",
    review([], [], [], new Date(2026, 7, 12), new Date(2026, 7, 20), 3).bestDay, null);

  // The week before, for comparison. W32 is Aug 3-9.
  const prior = [...days.map((k) => comp("d1", k, k)),
    ...["2026-08-03","2026-08-04"].map((k) => comp("d2", k, k))];
  const withPrev = review([d1, d2], prior, [], new Date(2026, 7, 12), new Date(2026, 7, 20), 3);
  eq("the week before is measured too", [withPrev.prevDone, withPrev.prevTotal], [2, 14]);
  eq("a first week has nothing behind it",
    review([task("new", "daily", "2026-08-10T09:00:00")], [], [], new Date(2026, 7, 12), new Date(2026, 7, 20), 3).prevTotal, 0);

  // The hours are of the week under review, not of all time.
  const timed = review([d1], [comp("d1", "2026-08-10", "2026-08-10", 1320), comp("d1", "2026-09-01", "2026-09-01", 540)],
    [], new Date(2026, 7, 12), new Date(2026, 8, 5), 3);
  eq("always 24 hour buckets", timed.hours.length, 24);
  eq("the 10pm tick inside the week is counted", timed.hours[22].count, 1);
  eq("the September tick is outside the week and is not", timed.hours[9].count, 0);
  eq("d1 was done this week, so it is not stale", sr.stale.some((s) => s.task.id === "d1"), false);
}

console.log("\nweek helpers");
eq("Monday of the week containing a Wednesday",
  toDayKey(weekStart(new Date(2026, 7, 12))), "2026-08-10");
eq("Sunday still belongs to the week that began Monday",
  toDayKey(weekStart(new Date(2026, 7, 16))), "2026-08-10");
eq("the last complete week is the one before this",
  toDayKey(lastCompleteWeek(new Date(2026, 7, 12))), "2026-08-03");
eq("a week reads as a range", formatWeekRange("2026-08-10", "2026-08-16"), "Aug 10 – Aug 16");
eq("...and says so across a month boundary",
  formatWeekRange("2026-08-31", "2026-09-06"), "Aug 31 – Sep 6");


console.log(`\n${failures === 0 ? "PASS — all assertions held" : `FAIL — ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
