"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDayShort } from "@/lib/periods";
import type { DayStat } from "@/lib/stats";

/*
 * ChartConfig drives the colour: shadcn's ChartStyle turns each key into a
 * --color-<key> variable scoped to this chart, which is why the Bar below reads
 * var(--color-pct) rather than naming a palette step directly. That is what
 * makes the chart follow the light/dark tokens with no JS.
 */
const chartConfig = {
  pct: { label: "Completed", color: "var(--chart-3)" },
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
    <ChartContainer config={chartConfig} className="aspect-auto h-[168px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="dayKey"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatDayShort}
        />
        <YAxis hide domain={[0, 100]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatDayShort(String(value))}
              formatter={(value, _name, item) => {
                const row = item.payload as Row;
                return (
                  <span className="text-muted-foreground">
                    {row.total === 0
                      ? "no daily tasks"
                      : `${row.done} of ${row.total} · ${value}%`}
                  </span>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="pct"
          fill="var(--color-pct)"
          radius={[3, 3, 0, 0]}
          // Re-eases to the new height when today's bar changes. Kept short: 30
          // bars moving at once reads as noise past about half a second. Off on
          // first paint, because that animation needs requestAnimationFrame,
          // which a background tab suspends — the bars would never appear.
          isAnimationActive={animate}
          animationDuration={420}
          animationEasing="ease-out"
        />
      </BarChart>
    </ChartContainer>
  );
}
