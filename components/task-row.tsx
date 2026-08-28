"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { GoalChips } from "@/components/goal-chips";
import type { Goal } from "@/lib/types";

type TaskRowProps = {
  title: string;
  done: boolean;
  /** True while the row only exists locally and has no server id yet. */
  pending?: boolean;
  /** Position in its section, used to stagger the entrance. */
  index?: number;
  /** The goals this row can be pointed at, in the order they are numbered. */
  goals: Goal[];
  /** The goal this feeds, if any. */
  goalId?: string | null;
  onToggle: (next: boolean) => void;
  onSetGoal: (goalId: string | null) => void;
  onRemove: () => void;
};

export function TaskRow({
  title,
  done,
  pending = false,
  index = 0,
  goals,
  goalId = null,
  onToggle,
  onSetGoal,
  onRemove,
}: TaskRowProps) {
  const [picking, setPicking] = useState(false);

  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const goal = goalIndex === -1 ? null : goals[goalIndex];

  function pick(next: string | null) {
    setPicking(false);
    if (next !== goalId) onSetGoal(next);
  }

  return (
    <div
      className="anim-row-in"
      // Capped so a long list still finishes arriving quickly.
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      // Closing on focus leaving the whole row covers both clicking away and
      // tabbing out, without a document-level listener.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPicking(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && picking) setPicking(false);
      }}
    >
      <div className="group flex items-center gap-2.5 rounded-md px-2 py-[5px] transition-colors hover:bg-[var(--hover)]">
        <Checkbox
          checked={done}
          disabled={pending}
          onCheckedChange={(checked) => onToggle(Boolean(checked))}
          aria-label={title}
          className="shrink-0"
        />

        {/*
          The drawn strikethrough lives on an inline inner span so the line is the
          width of the text, not of the flex column it sits in.
        */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate text-[14.5px]">
          <span
            data-done={done}
            className={`task-title ${done ? "text-faint" : "text-foreground"}`}
          >
            {title}
          </span>

          {goals.length > 0 ? (
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              disabled={pending}
              aria-expanded={picking}
              aria-label={
                goal ? `${title} — linked to ${goal.title}` : `Link ${title} to a goal`
              }
              title={
                goal
                  ? `Linked to ${goal.title} — click to change`
                  : "Link to a goal"
              }
              className={`shrink-0 truncate rounded px-1 text-[11.5px] text-faint transition-colors hover:bg-[var(--hover)] hover:text-muted-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                // An unlinked task shouldn't carry a permanent empty slot, so
                // its affordance only appears on hover — the way Remove does.
                goal ? "" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              {goal ? goal.title : "Link goal"}
            </button>
          ) : null}
        </span>

        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label={`Remove ${title}`}
          title="Remove — past completions are kept"
          className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {picking ? (
        <div className="px-2 pb-1.5 pl-9">
          <GoalChips goals={goals} selected={goalId} onSelect={pick} />
        </div>
      ) : null}
    </div>
  );
}
