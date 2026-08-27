"use client";

import { useCallback, useRef, useState } from "react";

export type TabMeta = {
  key: string;
  label: string;
  resets: string;
  done: number;
  total: number;
};

type TaskTabsProps = {
  tabs: TabMeta[];
  /** One panel per tab, same order. */
  panels: React.ReactNode[];
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * One list at a time, swiped left to right.
 *
 * Built on native CSS scroll-snap rather than a JS carousel: trackpad
 * two-finger swipes, touch drags, and shift-scroll all work for free, and the
 * motion is the browser's own so it never fights a running animation. The tab
 * buttons just scroll the same container.
 *
 * `progress` is fractional (0 → 2), so the underline tracks a half-finished
 * swipe rather than snapping once the gesture ends.
 */
export function TaskTabs({ tabs, panels }: TaskTabsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  // Browsers already coalesce scroll events to one per frame, so this needs no
  // throttling of its own.
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setProgress(el.scrollLeft / el.clientWidth);
  }, []);

  const active = Math.min(Math.max(Math.round(progress), 0), tabs.length - 1);

  const goTo = useCallback((index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(index + 1, last);
    if (e.key === "ArrowLeft") next = Math.max(index - 1, 0);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    goTo(next);
    document.getElementById(`tab-${tabs[next].key}`)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Task lists"
        className="relative flex border-b border-border"
      >
        {tabs.map((tab, i) => {
          const isActive = i === active;
          return (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => goTo(i)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className="group flex-1 rounded-t-md px-2 pb-2.5 pt-1.5 text-left transition-colors hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-baseline gap-1.5">
                <span
                  className={`text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {tab.label}
                </span>
                {tab.total > 0 ? (
                  <span
                    key={`${tab.done}/${tab.total}`}
                    className="anim-num tnum text-[12px] text-faint"
                  >
                    {tab.done}/{tab.total}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-faint">
                {tab.resets}
              </span>
            </button>
          );
        })}

        {/* Slides continuously with the scroll rather than jumping on release. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-0 h-[2px] rounded-full bg-primary"
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${progress * 100}%)`,
          }}
        />
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain"
      >
        {panels.map((panel, i) => (
          <section
            key={tabs[i].key}
            id={`panel-${tabs[i].key}`}
            role="tabpanel"
            aria-labelledby={`tab-${tabs[i].key}`}
            className="w-full shrink-0 snap-start pt-2"
          >
            {panel}
          </section>
        ))}
      </div>
    </div>
  );
}
