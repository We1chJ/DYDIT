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
  /**
   * Whether to stagger at all. The cascade is for a list arriving together; a
   * single row typed in just now should appear the moment it is typed, not
   * wait out a delay computed from how far down the list it happens to sit.
   */
  stagger?: boolean;
  /** The goals this row can be pointed at, in the order they are numbered. */
  goals: Goal[];
  /**
   * False for the to-do list. A one-off has no rhythm to chart — its times
   * strip would hold a single mark — and nothing ongoing to feed, so neither
   * trailing control earns the space.
   *
   * A one-off that was linked before this stays linked, and goes on counting
   * toward its goal; the row simply stops offering to change it.
   */
  recurring?: boolean;
  /** The goal this feeds, if any. */
  goalId?: string | null;
  /** Every timed tick of this task, as minutes since local midnight. */
  minutes: number[];
  /** The drag grip, already wired by the list. Null when the row can't move. */
  handle?: React.ReactNode;
  /** True while this is the row being carried. */
  dragging?: boolean;
  onToggle: (next: boolean) => void;
  onRename: (title: string) => void;
  onSetGoal: (goalId: string | null) => void;
  onRemove: () => void;
};

/**
 * Which inline panel, if any, the row has open. "remove" is the confirmation:
 * it lives in the row's own trailing space rather than a dialog, so the thing
 * you are about to remove stays on screen and in place while you decide.
 */
type Panel = "none" | "goal" | "times" | "remove";

export function TaskRow({
  title,
  done,
  pending = false,
  index = 0,
  stagger = true,
  goals,
  recurring = true,
  goalId = null,
  minutes,
  handle = null,
  dragging = false,
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
      style={{ animationDelay: stagger ? `${Math.min(index, 8) * 28}ms` : "0ms" }}
      // Closing on focus leaving the whole row covers both clicking away and
      // tabbing out, without a document-level listener.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPanel("none");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && panel !== "none") setPanel("none");
      }}
    >
      <div
        className={`group flex items-center gap-2.5 rounded-md px-2 py-[5px] transition-colors ${
          dragging
            ? "bg-card shadow-lg ring-1 ring-border"
            : "hover:bg-[var(--hover)]"
        }`}
      >
        {/* The slot is always there, so picking a row up never shifts the list. */}
        <span className="size-3.5 shrink-0">{handle}</span>

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

            {goals.length > 0 && recurring ? (
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

        {panel === "remove" ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]">
            <span className="text-faint">Remove?</span>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Confirm removing ${title}`}
              className="rounded px-1 py-0.5 font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Yes
            </button>
            <button
              type="button"
              // Focused rather than Yes, so a stray Enter cancels instead of
              // removing, and so blurring the row can dismiss the prompt.
              autoFocus
              onClick={() => setPanel("none")}
              className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </span>
        ) : (
          <>
            {/*
              Both trailing controls stay invisible until the row is hovered or
              focused, so a list at rest is just titles and checkboxes.
            */}
            {recurring ? (
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
            ) : null}

            <button
              type="button"
              onClick={() => setPanel("remove")}
              disabled={pending}
              aria-label={`Remove ${title}`}
              title="Remove — past completions are kept"
              className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            >
              <XIcon className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {panel === "goal" ? (
        <div className="px-2 pb-1.5 pl-15">
          <GoalChips goals={goals} selected={goalId} onSelect={pickGoal} />
        </div>
      ) : null}

      {panel === "times" ? (
        <div className="px-2 pb-2 pl-15 pr-8">
          <TaskTimes minutes={minutes} />
        </div>
      ) : null}
    </div>
  );
}
