"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import type { Goal } from "@/lib/types";

type AddTaskProps = {
  onAdd: (title: string, goalId: string | null) => void;
  placeholder: string;
  goals: Goal[];
};

/**
 * Collapsed to a ghost row until clicked, the way a Notion list item is.
 * Enter commits and stays open so you can type several in a row; Escape closes.
 *
 * The goal picker is a row of inline chips rather than a dropdown: a portalled
 * popup would pull focus out of the input, and the blur would commit the draft
 * before you had chosen anything. The chips suppress mousedown instead, so the
 * caret never leaves the field.
 */
export function AddTask({ onAdd, placeholder, goals }: AddTaskProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed, goalId);
    setValue("");
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-[14.5px] text-faint transition-colors hover:bg-[var(--hover)] hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlusIcon className="size-3.5 shrink-0" />
        New task
      </button>
    );
  }

  const chip = (id: string | null, label: string) => {
    const selected = goalId === id;
    return (
      <button
        key={id ?? "none"}
        type="button"
        // Keeps focus in the input, so blur never fires and the draft survives.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setGoalId(id)}
        aria-pressed={selected}
        className={`rounded-full border px-2 py-0.5 text-[11.5px] transition-colors ${
          selected
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-[var(--hover)]"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="rounded-md px-2 py-[5px]">
      <div className="flex items-center gap-2.5">
        <PlusIcon className="size-3.5 shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            commit();
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setValue("");
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-foreground placeholder:text-faint focus:outline-none"
        />
      </div>

      {goals.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
          <span className="text-[11.5px] text-faint">Goal</span>
          {chip(null, "None")}
          {goals.map((g) => chip(g.id, g.title))}
        </div>
      ) : null}
    </div>
  );
}
