"use client";

import { XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type TaskRowProps = {
  title: string;
  done: boolean;
  /** True while the row only exists locally and has no server id yet. */
  pending?: boolean;
  /** Position in its section, used to stagger the entrance. */
  index?: number;
  onToggle: (next: boolean) => void;
  onRemove: () => void;
};

export function TaskRow({
  title,
  done,
  pending = false,
  index = 0,
  onToggle,
  onRemove,
}: TaskRowProps) {
  return (
    <div
      className="anim-row-in group flex items-center gap-2.5 rounded-md px-2 py-[5px] transition-colors hover:bg-[var(--hover)]"
      // Capped so a long list still finishes arriving quickly.
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
    >
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
      <span className="min-w-0 flex-1 truncate text-[14.5px]">
        <span
          data-done={done}
          className={`task-title ${done ? "text-faint" : "text-foreground"}`}
        >
          {title}
        </span>
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
  );
}
