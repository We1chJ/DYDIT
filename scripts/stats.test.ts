import { isoWeekKey, periodKey, toDayKey, fromDayKey } from "../lib/periods";
import {
  activeOn, averageRatio, currentStreak, dailyStats, longestStreak, perfectDays,
} from "../lib/stats";
import type { Completion, Task } from "../lib/types";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n         expected ${e}\n         actual   ${a}`}`);
}

const task = (id: string, cadence: Task["cadence"], created: string): Task => ({
  id, title: id, cadence, archived_at: null, created_at: created,
});
const comp = (task_id: string, period_key: string, completed_on: string): Completion =>
  ({ id: `${task_id}-${period_key}`, task_id, period_key, completed_on });

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
eq("once", periodKey("once", d), "once");
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

console.log(`\n${failures === 0 ? "PASS — all assertions held" : `FAIL — ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
