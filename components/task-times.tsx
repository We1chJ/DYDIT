"use client";

import { formatClock } from "@/lib/periods";
import { busiestHour, timeOfDay } from "@/lib/stats";
import type { Completion } from "@/lib/types";

type TaskTimesProps = { minutes: number[] };

const GUIDES = [6, 12, 18];

/**
 * When one task in particular gets ticked, across a single day's worth of clock.
 *
 * A mark per completion rather than a histogram: with four ticks a histogram is
 * noise dressed as a distribution, whereas four marks on a strip are just four
 * marks, and they thicken into a shape as the weeks accumulate without ever
 * having claimed more than they know.
 */
export function TaskTimes({ minutes }: TaskTimesProps) {
  if (minutes.length === 0) {
    return (
      <p className="text-[11.5px] text-faint">
        No timed ticks yet — the clock starts at the next one.
      </p>
    );
  }

  // Reuse the same bucketing the big curve uses, so both agree on "usually".
  const fake: Completion[] = minutes.map((m, i) => ({
    id: `${i}`,
    task_id: "",
    period_key: "",
    completed_on: "",
    completed_minute: m,
  }));
  const peak = busiestHour(timeOfDay(fake));

  return (
    <div className="grid gap-1.5">
      <div className="relative h-6 rounded-[3px] bg-[var(--hm-0)]">
        {GUIDES.map((h) => (
          <div
            key={h}
            className="absolute top-0 h-full w-px bg-[var(--hm-ring)]"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        {minutes.map((m, i) => (
          <div
            key={i}
            title={formatClock(m)}
            className="absolute top-1 h-4 w-[2px] -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${(m / 1440) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex items-baseline justify-between text-[11px] text-faint">
        <span>12am</span>
        <span>12pm</span>
        <span>12am</span>
      </div>

      <p className="text-[11.5px] text-muted-foreground">
        {minutes.length < 3 || peak === null
          ? `${minutes.length} timed ${minutes.length === 1 ? "tick" : "ticks"} so far`
          : `Most often around ${formatClock(peak * 60)} · ${minutes.length} ticks`}
      </p>
    </div>
  );
}
