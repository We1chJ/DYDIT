"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatClock } from "@/lib/periods";
import type { HourBucket } from "@/lib/stats";

const chartConfig = {
  count: { label: "Ticks", color: "var(--chart-3)" },
} satisfies ChartConfig;

type TimeCurveProps = { hours: HourBucket[]; animate?: boolean };

/**
 * When in the day you actually tick things off.
 *
 * An area rather than bars: the question is the shape of a day — a morning
 * bump, an evening spike — and a filled curve reads as a rhythm where 24
 * separate columns read as a table. The bar chart above already owns bars.
 */
export function TimeCurve({ hours, animate = false }: TimeCurveProps) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[168px] w-full">
      <AreaChart data={hours} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          {/* Fades out downwards so the curve reads as a ridge, not a block. */}
          <linearGradient id="time-curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // Quarters of the day. Every third hour would crowd, and the four
          // anchors are enough to place any peak by eye.
          ticks={[0, 6, 12, 18, 23]}
          tickFormatter={(h) => formatClock(Number(h) * 60)}
        />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const hour = Number(payload?.[0]?.payload?.hour ?? 0);
                return `${formatClock(hour * 60)} – ${formatClock(((hour + 1) % 24) * 60)}`;
              }}
              formatter={(value) => (
                <span className="text-muted-foreground">
                  {Number(value) === 1 ? "1 tick" : `${value} ticks`}
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="count"
          type="monotone"
          stroke="var(--color-count)"
          strokeWidth={2}
          fill="url(#time-curve-fill)"
          /*
           * Off for the first paint, like the other charts: Recharts animates
           * through requestAnimationFrame, which a hidden tab suspends, and a
           * chart that animates on mount draws nothing at all until looked at.
           */
          isAnimationActive={animate ? "auto" : false}
          animationDuration={480}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ChartContainer>
  );
}
