"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";

type AddTaskProps = {
  onAdd: (title: string) => void;
  placeholder: string;
};

/**
 * Collapsed to a ghost row until clicked, the way a Notion list item is.
 * Enter commits and stays open so you can type several in a row; Escape closes.
 */
export function AddTask({ onAdd, placeholder }: AddTaskProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
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

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-[5px]">
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
  );
}
