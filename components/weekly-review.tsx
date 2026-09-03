"use client";

import { useEffect, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { formatWeekRange, type WeekReview } from "@/lib/review";

type WeeklyReviewProps = {
  review: WeekReview;
  /** False on the newest week, which has nothing after it to step to. */
  canGoForward: boolean;
  onStep: (weeks: number) => void;
  onClose: () => void;
};

/** A stat with its own line, so the numbers all start in the same column. */
function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="w-24 shrink-0 text-[11.5px] uppercase tracking-[0.06em] text-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] text-foreground">
        {children}
      </span>
    </div>
  );
}

/**
 * The week, read back.
 *
 * An overlay rather than a page: every row it needs is already in the browser,
 * so opening it costs nothing, and closing it puts you back exactly where you
 * were instead of a second of page load away.
 */
export function WeeklyReview({
  review,
  canGoForward,
  onStep,
  onClose,
}: WeeklyReviewProps) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside so the arrows are immediately usable.
  useEffect(() => {
    panel.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ratio =
    review.total === 0 ? null : Math.round((review.done / review.total) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review of ${review.weekKey}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 pt-[8vh] backdrop-blur-sm"
      // Clicking the backdrop closes; clicking the card must not.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="anim-tip w-full max-w-[520px] rounded-lg border border-border bg-card p-5 shadow-xl focus:outline-none"
      >
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {review.current ? "This week" : "Week in review"}
          </h2>
          <span className="tnum text-[11.5px] text-faint">
            {formatWeekRange(review.from, review.to)}
            {review.current ? " · still running" : ""}
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label="Previous week"
              className="rounded p-1 text-faint transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={!canGoForward}
              aria-label="Next week"
              className="rounded p-1 text-faint transition-colors hover:bg-[var(--hover)] hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRightIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review"
              className="ml-1 rounded p-1 text-faint transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-4" />
            </button>
          </span>
        </div>

        <div className="divide-y divide-border/60">
          <Line label="Finished">
            <span className="tnum font-medium">
              {review.done} of {review.total}
            </span>
            <span className="text-faint">
              {ratio === null ? " daily" : ` daily · ${ratio}%`}
            </span>
            {review.weeklyTotal > 0 ? (
              <span className="tnum text-faint">
                {" · "}
                {review.weeklyDone} of {review.weeklyTotal} weekly
              </span>
            ) : null}
            {review.onceDone > 0 ? (
              <span className="tnum text-faint">
                {" · "}
                {review.onceDone} off the to-do list
              </span>
            ) : null}
          </Line>

          <Line label="Perfect days">
            <span className="tnum font-medium">{review.perfectDays}</span>
            <span className="text-faint">
              {review.perfectDays === 0 ? " — none this week" : " of 7"}
            </span>
          </Line>

          <Line label="Slipped">
            {review.slips.length === 0 ? (
              <span className="text-faint">nothing — everything due got done</span>
            ) : (
              <span className="grid gap-0.5">
                {review.slips.map((s) => (
                  <span key={s.task.id} className="flex items-baseline gap-2">
                    <span className="truncate">{s.task.title}</span>
                    <span className="tnum shrink-0 text-[11.5px] text-faint">
                      missed {s.missed} of {s.due}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </Line>

          <Line label="Goals moved">
            {review.goalsMoved.length === 0 ? (
              <span className="text-faint">none moved this week</span>
            ) : (
              <span className="grid gap-0.5">
                {review.goalsMoved.map((m) => (
                  <span key={m.goal.id} className="flex items-baseline gap-2">
                    <span className="truncate">{m.goal.title}</span>
                    <span className="tnum shrink-0 text-[11.5px] text-faint">
                      {m.days} {m.days === 1 ? "day" : "days"}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </Line>

          <Line label="Untouched">
            {review.stale.length === 0 ? (
              <span className="text-faint">nothing has been left sitting</span>
            ) : (
              <span className="grid gap-0.5">
                {review.stale.map((s) => (
                  <span key={s.task.id} className="flex items-baseline gap-2">
                    <span className="truncate">{s.task.title}</span>
                    <span className="tnum shrink-0 text-[11.5px] text-faint">
                      {s.days} days
                    </span>
                  </span>
                ))}
              </span>
            )}
          </Line>
        </div>
      </div>
    </div>
  );
}
