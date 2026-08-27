"use client";

import { Label, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/*
 * Each key becomes a --color-<key> variable via shadcn's ChartStyle, which the
 * data rows below reference as their fill. Adding `value` with a label but no
 * colour is the shadcn idiom for naming the measure in the tooltip.
 */
const chartConfig = {
  value: { label: "Tasks" },
  done: { label: "Done", color: "var(--chart-3)" },
  left: { label: "Left", color: "var(--hm-0)" },
} satisfies ChartConfig;

type TodayDonutProps = { done: number; total: number; animate?: boolean };

/**
 * One ratio, so the ring carries the shape and the number in the middle carries
 * the value — a bare percentage would lose the sense of how much is left, and a
 * bare ring would make you estimate.
 */
export function TodayDonut({ done, total, animate = false }: TodayDonutProps) {
  const left = Math.max(total - done, 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Recharts draws nothing for an all-zero dataset, so an empty day still needs
  // a full track for the "0%" to sit inside.
  const data =
    total === 0
      ? [{ key: "left", value: 1, fill: "var(--color-left)" }]
      : [
          { key: "done", value: done, fill: "var(--color-done)" },
          { key: "left", value: left, fill: "var(--color-left)" },
        ].filter((d) => d.value > 0);

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[176px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="key" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          // A surface-coloured gap keeps the two arcs from fusing.
          stroke="var(--card)"
          strokeWidth={2}
          // Re-sweeps from the previous angle when the count changes. Off for
          // the first paint for the same background-tab reason as the bars.
          isAnimationActive={animate}
          animationDuration={550}
          animationEasing="ease-out"
        >
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              const { cx, cy } = viewBox;
              return (
                // Keyed by value so a change remounts it and replays the roll-up.
                <text
                  key={`${pct}-${done}-${total}`}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="anim-num"
                >
                  <tspan
                    x={cx}
                    y={cy}
                    className="fill-foreground text-[30px] font-semibold tracking-[-0.03em] tabular-nums"
                  >
                    {pct}%
                  </tspan>
                  <tspan
                    x={cx}
                    y={(cy ?? 0) + 24}
                    className="fill-muted-foreground text-[12px] tabular-nums"
                  >
                    {total === 0 ? "nothing due" : `${done} of ${total}`}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
