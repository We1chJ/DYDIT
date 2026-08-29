"use client";

import { useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import type { GoalStat } from "@/lib/stats";

type GoalRowsProps = {
  stats: GoalStat[];
  onAdd: (title: string) => void;
  onRemove: (goalId: string) => void;
};

/**
 * Long-term goals as counts rather than bars.
 *
 * There is no bar because there is no denominator: an open-ended goal has no
 * total to be a fraction of, so a bar would have to invent a finish line and
 * then imply you were approaching it. What can be said honestly is how long
 * you have kept at it — days you fed it, out of days since you started.
 */
export function GoalRows({ stats, onAdd, onRemove }: GoalRowsProps) {
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

      {stats.length === 0 && !adding ? (
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          A goal is something daily and weekly tasks feed into — &ldquo;Learn
          Japanese&rdquo;, say. Add one, link tasks to it, and this counts the
          days you actually fed it.
        </p>
      ) : null}

      <div className="mt-3 space-y-3.5">
        {stats.map(({ goal, activeDays, ageDays, streak, dueDone, dueTotal, linked }, i) => {
          return (
            <div key={goal.id} className="group">
              <div className="flex items-baseline gap-2">
                {/*
                  Positional, and only ever an input shorthand — the number is
                  what you type when adding a task, never what gets stored.
                */}
                <span
                  title={`Goal ${i + 1} — end a task's title with #${i + 1} to link it`}
                  className="tnum shrink-0 text-[11.5px] text-faint"
                >
                  {i + 1}
                </span>
                <span className="truncate text-[14px] font-medium text-foreground">
                  {goal.title}
                </span>
                <span
                  key={activeDays}
                  className="anim-num tnum ml-auto shrink-0 text-[13px] font-semibold text-foreground"
                >
                  {activeDays} {activeDays === 1 ? "day" : "days"}
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

              <p className="tnum mt-0.5 text-[11.5px] text-faint">
                {linked === 0
                  ? "no tasks linked yet"
                  : [
                      `of ${ageDays} since you started`,
                      streak > 1 ? `${streak} in a row` : null,
                      dueTotal === 0
                        ? "nothing due right now"
                        : `${dueDone} of ${dueTotal} due now`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
