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

/** Stands in for a zero sector, which Recharts would otherwise drop. */
const HAIR = 0.0001;

type TodayDonutProps = { done: number; total: number; animate?: boolean };

/**
 * One ratio, so the ring carries the shape and the number in the middle carries
 * the value — a bare percentage would lose the sense of how much is left, and a
 * bare ring would make you estimate.
 */
export function TodayDonut({ done, total, animate = false }: TodayDonutProps) {
  const left = Math.max(total - done, 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  /*
   * Two sectors always, even at 0% and 100%.
   *
   * Recharts discards a sector whose value is zero, so the honest numbers gave
   * this ring a changing sector count — one at 0/4, two at 1/4, one again at
   * 4/4. It cannot tween between different counts, so it threw the ring away
   * and re-swept it from twelve o'clock, and it did that on the first tick of
   * the day and on the one that finishes it: the two that most deserve to look
   * good. A hair of value keeps both sectors alive so the arc simply grows into
   * the space the other gives up.
   *
   * The hair is about a hundredth of a degree wide. All you can actually see of
   * it is its 2px card-coloured stroke, which is the same divider that sits
   * between the two arcs at every other percentage. `count` carries the real
   * number alongside, because the tooltip must not read "0.0001".
   */
  const empty = total === 0;
  const data = [
    {
      key: "done",
      value: Math.max(empty ? 0 : done, HAIR),
      count: empty ? 0 : done,
      fill: "var(--color-done)",
    },
    {
      key: "left",
      // An all-zero dataset draws nothing, so an empty day borrows a full track
      // for the "0%" to sit inside.
      value: empty ? 1 : Math.max(left, HAIR),
      count: empty ? 0 : left,
      fill: "var(--color-left)",
    },
  ];

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[176px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              nameKey="key"
              hideLabel
              // Reads `count`, not the plotted value — see HAIR above.
              formatter={(_value, _name, item) => {
                const row = item.payload as { key: string; count: number };
                return (
                  <span className="text-muted-foreground">
                    {row.key === "done" ? "Done" : "Left"} · {row.count}
                  </span>
                );
              }}
            />
          }
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
          /*
           * Off for the first paint, for the same reason as the bars: Recharts
           * animates via requestAnimationFrame, which a hidden tab suspends, so
           * a ring that sweeps in on mount draws nothing at all until the tab
           * is looked at. After that, "auto" rather than plain true, so the
           * tween also stands down under prefers-reduced-motion.
           */
          isAnimationActive={animate ? "auto" : false}
          animationDuration={550}
          animationEasing="ease-out"
        >
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              const { cx, cy } = viewBox;
              return (
                // Keyed by value so a change remounts it and replays the fade.
                <text
                  key={`${pct}-${done}-${total}`}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="anim-fade"
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
