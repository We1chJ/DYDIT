import type { Cadence } from "./types";

/*
 * Every function here works in LOCAL time on purpose.
 *
 * The alternative — deriving period keys on the server — means that at 7pm your
 * time the server may already be on tomorrow's date, so a task you just ticked
 * renders unticked. All date math therefore runs in the browser, and the server
 * only ever stores the key the client computed.
 */

/** Local calendar day as YYYY-MM-DD. Never use toISOString() here — that's UTC. */
export function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local midnight for a YYYY-MM-DD key. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Days between two day keys (b - a), calendar-accurate across DST. */
export function daysBetween(aKey: string, bKey: string): number {
  const a = fromDayKey(aKey);
  const b = fromDayKey(bKey);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * ISO-8601 week key, e.g. 2026-W35. Weeks start Monday, and week 1 is the one
 * containing the first Thursday — which is why this can't just be a day count.
 */
export function isoWeekKey(d: Date): string {
  const t = startOfDay(d);
  // Shift to the Thursday of this week; its year is the ISO week-year.
  const dayNum = (t.getDay() + 6) % 7; // Mon=0 … Sun=6
  t.setDate(t.getDate() - dayNum + 3);
  const isoYear = t.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week =
    1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Local month key, e.g. 2026-08. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The key a completion is stored under. This is what makes recurrence work:
 * combined with a unique index on (task_id, period_key), a daily task can be
 * completed once per day, a weekly one once per ISO week, and a one-off once
 * ever.
 */
export function periodKey(cadence: Cadence, d: Date): string {
  switch (cadence) {
    case "daily":
      return toDayKey(d);
    case "weekly":
      return isoWeekKey(d);
    case "monthly":
      return monthKey(d);
    case "once":
      return "once";
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Aug 26" — the format used in heatmap and chart tooltips. */
export function formatDayShort(key: string): string {
  const d = fromDayKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Wednesday, August 26" — the header date line. */
export function formatDayLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
