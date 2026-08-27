"use client";

import { useState } from "react";
import { addDays, formatDayShort, fromDayKey, toDayKey } from "@/lib/periods";
import type { DayStat } from "@/lib/stats";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type HeatmapProps = {
  days: DayStat[];
  todayKey: string;
  weeks: number;
};

type Hover = { stat: DayStat; x: number; y: number } | null;

/**
 * A GitHub-style contribution grid.
 *
 * Hand-built rather than charted: no charting library models a calendar grid
 * well, and the whole thing is 182 positioned divs. Weeks run Monday-first to
 * line up with the ISO weeks the weekly cadence resets on.
 */
export function Heatmap({ days, todayKey, weeks }: HeatmapProps) {
  const [hover, setHover] = useState<Hover>(null);

  const byKey = new Map(days.map((d) => [d.dayKey, d]));
  const today = fromDayKey(todayKey);

  // Walk back to the Monday that starts the earliest visible week.
  const mondayOffset = (today.getDay() + 6) % 7;
  const lastMonday = addDays(today, -mondayOffset);
  const firstMonday = addDays(lastMonday, -(weeks - 1) * 7);

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(firstMonday, w * 7 + d);
      const key = toDayKey(date);
      return { key, date, stat: byKey.get(key), future: key > todayKey };
    }),
  );

  // A month label sits above the first column that contains that month's start.
  const monthLabels = columns.map((col, i) => {
    const month = col[0].date.getMonth();
    const prev = i > 0 ? columns[i - 1][0].date.getMonth() : -1;
    return month !== prev ? MONTHS[month] : null;
  });

  return (
    <div className="relative" data-heatmap>
      {/*
        Columns flex to fill the card, with a floor so they stay tappable; below
        that the wrapper scrolls rather than letting cells collapse to slivers.
        Cells are aspect-square, so the grid stays square at any width.
      */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[740px] flex-col gap-1">
          {/* Month ruler */}
          <div className="flex gap-[3px] pl-8">
            {monthLabels.map((label, i) => (
              <div
                key={i}
                className="min-w-[11px] flex-1 text-[10px] leading-none text-faint"
              >
                {label ? <span className="relative -top-px">{label}</span> : null}
              </div>
            ))}
          </div>

          <div className="flex items-stretch gap-[3px]">
            {/* Weekday ruler — alternate days only, so the labels don't crowd */}
            <div className="mr-1 flex w-7 shrink-0 flex-col gap-[3px]">
              {["Mon", "", "Wed", "", "Fri", "", ""].map((label, i) => (
                <div
                  key={i}
                  className="flex flex-1 items-center text-[10px] leading-none text-faint"
                >
                  {label}
                </div>
              ))}
            </div>

            {columns.map((col, w) => (
              <div
                key={w}
                className="flex min-w-[11px] flex-1 flex-col gap-[3px]"
              >
                {col.map((cell) => {
                  if (cell.future) {
                    return (
                      <div key={cell.key} className="aspect-square w-full" />
                    );
                  }
                  const level = cell.stat?.level ?? 0;
                  const isToday = cell.key === todayKey;
                  return (
                    <div
                      key={cell.key}
                      onMouseEnter={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const host =
                          e.currentTarget.closest("[data-heatmap]")!.getBoundingClientRect();
                        setHover({
                          stat:
                            cell.stat ??
                            { dayKey: cell.key, done: 0, total: 0, ratio: null, level: 0, otherDone: 0 },
                          x: box.left - host.left + box.width / 2,
                          y: box.top - host.top,
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                      className="aspect-square w-full rounded-[2px] transition-transform duration-100 hover:scale-125"
                      style={{
                        backgroundColor: `var(--hm-${level})`,
                        outline: isToday
                          ? "1px solid var(--foreground)"
                          : "1px solid var(--hm-ring)",
                        outlineOffset: "-1px",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex items-center justify-end gap-[3px] text-[11px] text-faint">
        <span className="mr-1">Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div
            key={l}
            className="size-[11px] rounded-[2px]"
            style={{
              backgroundColor: `var(--hm-${l})`,
              outline: "1px solid var(--hm-ring)",
              outlineOffset: "-1px",
            }}
          />
        ))}
        <span className="ml-1">More</span>
      </div>

      <div className="pointer-events-none absolute inset-0">
        {hover ? (
          <div
            className="anim-tip absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-popover-foreground shadow-md"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            <span className="font-medium">{formatDayShort(hover.stat.dayKey)}</span>
            <span className="text-muted-foreground">
              {" — "}
              {hover.stat.total === 0
                ? "no daily tasks"
                : `${hover.stat.done}/${hover.stat.total} daily`}
              {hover.stat.otherDone > 0 ? ` · ${hover.stat.otherDone} other` : ""}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
