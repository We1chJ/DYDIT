"use client";

import type { Goal } from "@/lib/types";

type GoalChipsProps = {
  goals: Goal[];
  selected: string | null;
  onSelect: (goalId: string | null) => void;
  /**
   * Suppresses mousedown so a chip never pulls the caret out of an open text
   * field — the blur would commit the draft before the goal had been chosen.
   */
  keepFocus?: boolean;
};

/**
 * The goal picker: "None", then one numbered chip per goal.
 *
 * The numbers are positional, derived from the order the goals arrive in, and
 * are never stored. They exist so a goal can be named by typing "#2" while
 * adding a task, which means archiving a goal renumbers the rest without
 * touching any task's link — those are held by id.
 */
export function GoalChips({
  goals,
  selected,
  onSelect,
  keepFocus = false,
}: GoalChipsProps) {
  const chip = (id: string | null, label: string, number: number | null) => {
    const isSelected = selected === id;
    return (
      <button
        key={id ?? "none"}
        type="button"
        onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
        onClick={() => onSelect(id)}
        aria-pressed={isSelected}
        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors ${
          isSelected
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-[var(--hover)]"
        }`}
      >
        {number === null ? null : (
          <span className="tnum opacity-55">{number}</span>
        )}
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-faint">Goal</span>
      {chip(null, "None", null)}
      {goals.map((g, i) => chip(g.id, g.title, i + 1))}
    </div>
  );
}
