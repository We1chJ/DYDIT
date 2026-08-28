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
          /*
           * Recharts interpolates each bar from the height it last rendered at,
           * so ticking today's box moves that bar and leaves the other 29 where
           * they are. Kept short all the same.
           *
           * Off entirely for the first paint: Recharts animates via
           * requestAnimationFrame, and a hidden tab suspends it, so a chart
           * that animates on mount draws no bars at all until you look at it.
           * After that, "auto" rather than plain true, because it also disables
           * the tween under prefers-reduced-motion — which the media query in
           * globals.css cannot do here, that block only reaches CSS animations.
           */
          isAnimationActive={animate ? "auto" : false}
          animationDuration={420}
          animationEasing="ease-out"
        />
      </BarChart>
    </ChartContainer>
  );
}
