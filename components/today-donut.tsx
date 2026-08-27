"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const config = {
  done: { label: "Done", color: "var(--primary)" },
  left: { label: "Left", color: "var(--hm-0)" },
} satisfies ChartConfig;

type TodayDonutProps = { done: number; total: number; animate?: boolean };

/**
 * One ratio, so the donut carries the shape and the number in the middle
 * carries the value — a bare percentage would lose the sense of how much is
 * left, and a bare ring would make you estimate.
 */
export function TodayDonut({ done, total, animate = false }: TodayDonutProps) {
  const left = Math.max(total - done, 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Recharts renders nothing for an all-zero dataset, so an empty day still
  // needs a full track drawn to sit the "0%" inside.
  const data =
    total === 0
      ? [{ key: "left", value: 1 }]
      : [
          { key: "done", value: done },
          { key: "left", value: left },
        ].filter((d) => d.value > 0);

  return (
    <div className="relative mx-auto aspect-square w-[168px]">
      <ChartContainer config={config} className="size-full aspect-square">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            // A 2px surface-coloured gap keeps the two arcs from fusing.
            stroke="var(--card)"
            strokeWidth={2}
            // Re-sweeps from the previous angle whenever the count changes, so
            // ticking a task reads as the ring growing rather than jumping.
            // Off for the first paint: that animation needs requestAnimationFrame,
            // which a background tab suspends, and the ring would never appear.
            isAnimationActive={animate}
            animationDuration={550}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell
                key={d.key}
                fill={d.key === "done" ? "var(--primary)" : "var(--hm-0)"}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {/* Keyed by value so a change remounts the span and replays the roll-up. */}
        <span
          key={pct}
          className="anim-num tnum text-[30px] font-semibold leading-none tracking-[-0.03em] text-foreground"
        >
          {pct}%
        </span>
        <span
          key={`${done}-${total}`}
          className="anim-num tnum mt-1.5 text-[12px] text-muted-foreground"
        >
          {total === 0 ? "nothing due" : `${done} of ${total}`}
        </span>
      </div>
    </div>
  );
}
