"use client";

import { useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import type { GoalProgress } from "@/lib/stats";

type GoalBarsProps = {
  progress: GoalProgress[];
  windowDays: number;
  onAdd: (title: string) => void;
  onRemove: (goalId: string) => void;
};

/**
 * Long-term goals as horizontal bars.
 *
 * The bar is a completion rate over a rolling window, not a running total: a
 * goal you stopped feeding should visibly sag. The line underneath says what is
 * due right now, so the bar means something at both timescales.
 */
export function GoalBars({
  progress,
  windowDays,
  onAdd,
  onRemove,
}: GoalBarsProps) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue("");
    setAdding(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Goals
      </h2>

      {progress.length === 0 && !adding ? (
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          A goal is something daily and weekly tasks feed into — &ldquo;Learn
          Japanese&rdquo;, say. Add one, then link tasks to it and the bar fills
          as you keep them up.
        </p>
      ) : null}

      <div className="mt-3 space-y-3.5">
        {progress.map(({ goal, rate, dueDone, dueTotal, linked }) => {
          const pct = rate === null ? 0 : Math.round(rate * 100);
          return (
            <div key={goal.id} className="group">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[14px] font-medium text-foreground">
                  {goal.title}
                </span>
                <span
                  key={pct}
                  className="anim-num tnum ml-auto text-[13px] font-semibold text-foreground"
                >
                  {rate === null ? "—" : `${pct}%`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(goal.id)}
                  aria-label={`Remove ${goal.title}`}
                  title="Remove goal — its tasks are kept"
                  className="rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>

              <Progress
                value={pct}
                aria-label={`${goal.title}: ${pct}% over the last ${windowDays} days`}
                className="mt-1.5 block"
              >
                <ProgressTrack className="h-1.5">
                  <ProgressIndicator className="rounded-full transition-[width] duration-500 ease-out" />
                </ProgressTrack>
              </Progress>

              <p className="tnum mt-1 text-[11.5px] text-faint">
                {linked === 0
                  ? "no tasks linked yet"
                  : dueTotal === 0
                    ? `${linked} linked · nothing due right now`
                    : `${dueDone} of ${dueTotal} due now · ${linked} linked`}
              </p>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-md px-1">
          <PlusIcon className="size-3.5 shrink-0 text-faint" />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            placeholder="What are you working toward?"
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setValue("");
                setAdding(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-faint focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-2.5 rounded-md px-1 py-1 text-[13.5px] text-faint transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3.5 shrink-0" />
          New goal
        </button>
      )}
    </div>
  );
}
