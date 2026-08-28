"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { GoalChips } from "@/components/goal-chips";
import type { Goal } from "@/lib/types";

type AddTaskProps = {
  onAdd: (title: string, goalId: string | null) => void;
  placeholder: string;
  goals: Goal[];
};

const GOAL_REF = /^(.*?)\s*#(\d+)\s*$/;

/**
 * Pulls a trailing "#2" off a draft title and resolves it to a goal.
 *
 * Only a trailing token counts, and only one that actually names a goal you
 * have — so "Do set #7" against three goals stays a plain title rather than
 * losing its suffix to a link that doesn't exist. A bare "#2" with nothing in
 * front of it is a title too, since stripping it would leave nothing to save.
 */
function parseGoalRef(value: string, goals: Goal[]) {
  const match = GOAL_REF.exec(value);
  if (!match) return null;

  const title = match[1].trim();
  const goal = goals[Number(match[2]) - 1];
  if (!title || !goal) return null;

  return { title, goal };
}

/**
 * Collapsed to a ghost row until clicked, the way a Notion list item is.
 * Enter commits and stays open so you can type several in a row; Escape closes.
 *
 * A goal can be picked two ways: click a chip, or end the title with its number
 * ("Read 30 minutes #2"), which links without leaving the keyboard. The line
 * under the chips always says which one is about to be used, so the shorthand
 * is never silent.
 *
 * The chips are inline rather than a dropdown: a portalled popup would pull
 * focus out of the input, and the blur would commit the draft before you had
 * chosen anything. GoalChips suppresses mousedown instead, so the caret stays.
 */
export function AddTask({ onAdd, placeholder, goals }: AddTaskProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ref = parseGoalRef(value, goals);
  // A typed "#2" wins over the chips, since it is the more recent instruction.
  const effectiveGoalId = ref ? ref.goal.id : goalId;

  function commit() {
    const parsed = parseGoalRef(value, goals);
    const trimmed = parsed ? parsed.title : value.trim();
    if (!trimmed) return;

    onAdd(trimmed, parsed ? parsed.goal.id : goalId);
    setValue("");
    inputRef.current?.focus();
  }

  // Clicking a chip supersedes a number already typed, so the "#2" comes back
  // out of the field — otherwise the row would show two conflicting answers.
  function selectGoal(id: string | null) {
    if (ref) setValue(ref.title);
    setGoalId(id);
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
        <div className="mt-1.5 space-y-1 pl-6">
          <GoalChips
            goals={goals}
            selected={effectiveGoalId}
            onSelect={selectGoal}
            keepFocus
          />
          {/* Always one line, so resolving a number never shifts the layout. */}
          <p className="text-[11px] text-faint">
            {ref ? (
              <span className="text-primary">
                → {ref.goal.title}
                <span className="text-faint"> · “#2” drops off the title</span>
              </span>
            ) : (
              "End the title with #2 to link it as you type."
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
