"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { FocusItem } from "@/lib/focus";

type FocusCardProps = {
  items: FocusItem[];
  /** True until the browser has settled on what day it is. */
  pending: boolean;
  onToggle: (item: FocusItem) => void;
};

/**
 * The three things most worth doing right now.
 *
 * Deliberately tickable in place. The list below already holds every task, so
 * the only reason to send someone down there is ceremony — and a suggestion you
 * have to go and act on somewhere else is a suggestion you will skim past.
 *
 * Kept to three. A short list is a decision; a long one is the same problem
 * over again in a smaller font.
 */
export function FocusCard({ items, pending, onToggle }: FocusCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Focus
        </h2>
        <span className="text-[11.5px] text-faint">
          {pending ? "" : items.length === 0 ? "nothing pressing" : "worth doing next"}
        </span>
      </div>

      {pending ? (
        /*
          The list cannot be computed until the browser has said what day it is,
          and "nothing pressing" is a claim, not a placeholder — showing it here
          would tell you everything is done a moment before saying it is not.
        */
        <div className="space-y-1.5 py-1">
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted/40" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-1 text-[13px] text-faint">
          Everything due is done. The rest can wait.
        </p>
      ) : (
        <div className="-mx-2">
          {items.map((item, i) => (
            <div
              key={item.task.id}
              className="anim-row-in group flex items-center gap-2.5 rounded-md px-2 py-[5px] transition-colors hover:bg-[var(--hover)]"
              style={{ animationDelay: `${i * 28}ms` }}
            >
              <Checkbox
                checked={false}
                disabled={pending}
                onCheckedChange={() => onToggle(item)}
                aria-label={item.task.title}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground">
                {item.task.title}
              </span>
              {/*
                The reason is the whole point of the card — without it this is
                just three tasks with no argument for why these three.
              */}
              <span className="shrink-0 text-[11.5px] text-faint">
                {item.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
