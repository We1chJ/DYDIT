"use client";

import { useRef, useState } from "react";
import { ClockIcon, XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { GoalChips } from "@/components/goal-chips";
import { TaskTimes } from "@/components/task-times";
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
  /** Every timed tick of this task, as minutes since local midnight. */
  minutes: number[];
  onToggle: (next: boolean) => void;
  onRename: (title: string) => void;
  onSetGoal: (goalId: string | null) => void;
  onRemove: () => void;
};

/** Which inline panel, if any, is open under the row. */
type Panel = "none" | "goal" | "times";

export function TaskRow({
  title,
  done,
  pending = false,
  index = 0,
  goals,
  goalId = null,
  minutes,
  onToggle,
  onRename,
  onSetGoal,
  onRemove,
}: TaskRowProps) {
  const [panel, setPanel] = useState<Panel>("none");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const goal = goalIndex === -1 ? null : goals[goalIndex];

  function openEditor() {
    if (pending) return;
    setDraft(title);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    // An empty title would erase the row's only label, and renaming to what it
    // already says is a write for nothing.
    if (trimmed && trimmed !== title) onRename(trimmed);
  }

  function pickGoal(next: string | null) {
    setPanel("none");
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
        if (!e.currentTarget.contains(e.relatedTarget)) setPanel("none");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && panel !== "none") setPanel("none");
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

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
            aria-label={`Rename ${title}`}
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground focus:outline-none"
          />
        ) : (
          /*
            The drawn strikethrough lives on an inline inner span so the line is
            the width of the text, not of the flex column it sits in.
          */
          <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate text-[14.5px]">
            <button
              type="button"
              onClick={openEditor}
              disabled={pending}
              title="Click to rename"
              className="min-w-0 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                data-done={done}
                className={`task-title ${done ? "text-faint" : "text-foreground"}`}
              >
                {title}
              </span>
            </button>

            {goals.length > 0 ? (
              <button
                type="button"
                onClick={() => setPanel((p) => (p === "goal" ? "none" : "goal"))}
                disabled={pending}
                aria-expanded={panel === "goal"}
                aria-label={
                  goal ? `${title} — linked to ${goal.title}` : `Link ${title} to a goal`
                }
                title={
                  goal ? `Linked to ${goal.title} — click to change` : "Link to a goal"
                }
                className={`shrink-0 truncate rounded px-1 text-[11.5px] text-faint transition-colors hover:bg-[var(--hover)] hover:text-muted-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  goal ? "" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {goal ? goal.title : "Link goal"}
              </button>
            ) : null}
          </span>
        )}

        {/*
          Both trailing controls stay invisible until the row is hovered or
          focused, so a list at rest is just titles and checkboxes.
        */}
        <button
          type="button"
          onClick={() => setPanel((p) => (p === "times" ? "none" : "times"))}
          aria-expanded={panel === "times"}
          aria-label={`When ${title} usually gets done`}
          title="When this usually gets done"
          className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <ClockIcon className="size-3.5" />
        </button>

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

      {panel === "goal" ? (
        <div className="px-2 pb-1.5 pl-9">
          <GoalChips goals={goals} selected={goalId} onSelect={pickGoal} />
        </div>
      ) : null}

      {panel === "times" ? (
        <div className="px-2 pb-2 pl-9 pr-8">
          <TaskTimes minutes={minutes} />
        </div>
      ) : null}
    </div>
  );
}
