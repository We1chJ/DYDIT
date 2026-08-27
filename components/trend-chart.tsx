"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDayShort } from "@/lib/periods";
import type { DayStat } from "@/lib/stats";

const config = {
  pct: { label: "Completed", color: "var(--primary)" },
} satisfies ChartConfig;

type TrendChartProps = { days: DayStat[]; animate?: boolean };

type Row = {
  dayKey: string;
  pct: number | null;
  done: number;
  total: number;
};

/** Daily completion rate, one bar per day. Single series, so no legend. */
export function TrendChart({ days, animate = false }: TrendChartProps) {
  const data: Row[] = days.map((d) => ({
    dayKey: d.dayKey,
    // null, not 0 — a day with nothing due draws no bar rather than a failure.
    pct: d.ratio === null ? null : Math.round(d.ratio * 100),
    done: d.done,
    total: d.total,
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[168px] w-full">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="dayKey"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatDayShort}
          className="text-[11px]"
        />
        <YAxis hide domain={[0, 100]} />
        <ChartTooltip
          cursor={{ fill: "var(--hover)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as Row;
            return (
              <div className="rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-popover-foreground shadow-md">
                <span className="font-medium">{formatDayShort(row.dayKey)}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {row.total === 0
                    ? "no daily tasks"
                    : `${row.done}/${row.total} · ${row.pct}%`}
                </span>
              </div>
            );
          }}
        />
        <Bar
          dataKey="pct"
          fill="var(--primary)"
          radius={[3, 3, 0, 0]}
          // Re-eases to the new height when today's bar changes. Kept short: 30
          // bars moving at once reads as noise past about half a second. Off on
          // first paint for the same background-tab reason as the donut.
          isAnimationActive={animate}
          animationDuration={420}
          animationEasing="ease-out"
        />
      </BarChart>
    </ChartContainer>
  );
}
