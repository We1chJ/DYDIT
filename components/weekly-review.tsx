"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { formatWeekRange, type WeekReview } from "@/lib/review";
import { formatClock, formatDayShort, fromDayKey } from "@/lib/periods";

/*
 * The week, told rather than tabulated.
 *
 * A review is read once and then not again, which makes it the one moment in
 * this app that can afford to be loud without the rest of it becoming loud too.
 * So it runs as a sequence of full-screen cards instead of a table: one fact
 * each, given enough room to land.
 *
 * The cards are built from what the week actually contained. A week with
 * nothing outstanding has no "slipped" card, because a card that says "nothing"
 * is four seconds of dead air.
 */

/** Milliseconds a card holds before moving on. */
const DWELL = 4600;

/**
 * Duotone pairs, cycled across the cards.
 *
 * Fixed colours rather than theme tokens: a card is its own full-bleed surface,
 * so it looks the same in light and dark and nothing here has to survive being
 * recoloured. Every pair is a dark ground with a bright accent, so one text
 * colour works throughout.
 */
const PAIRS = [
  { bg: "#0B3D2E", ink: "#A3E635" },
  { bg: "#17161D", ink: "#FBBF24" },
  { bg: "#2E1065", ink: "#FDA4AF" },
  { bg: "#042F2E", ink: "#5EEAD4" },
  { bg: "#4C0519", ink: "#FDBA74" },
  { bg: "#0C1B33", ink: "#7DD3FC" },
  { bg: "#14290F", ink: "#BEF264" },
  { bg: "#1E1B4B", ink: "#C4B5FD" },
];

type Card = {
  key: string;
  /** Small line above the headline. */
  kicker: string;
  /** The big thing. A number counts up; a string just arrives. */
  value: string | number;
  /** Rendered straight after the value, at half its size. */
  suffix?: string;
  /** One line underneath. */
  caption?: string;
  /** Extra rows, for the list-shaped cards. */
  rows?: { label: string; note: string }[];
  /** The 24-hour shape, on the one card that shows it. */
  hours?: number[];
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts from zero up to a value, once, on mount.
 *
 * Mount is the whole trick: each card is keyed, so arriving at one is a fresh
 * mount and the number starts over without anything having to reset it.
 * Reduced motion starts at the answer.
 */
function useCountUp(value: number, ms = 900): number {
  const [n, setN] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    if (prefersReducedMotion() || value === 0) return;
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      // Eased out, so it decelerates into the number rather than stopping dead.
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return n;
}

function Value({ value, suffix }: { value: string | number; suffix?: string }) {
  const numeric = typeof value === "number";
  const counted = useCountUp(numeric ? value : 0);
  // A goal's name can be long, and a long name set at display size wraps into
  // a wall. Numbers are always short, so only text ever needs stepping down.
  const long = !numeric && String(value).length > 14;
  return (
    <span
      className={`anim-story-value block font-semibold leading-[1.02] tracking-[-0.035em] ${
        long ? "text-[34px] sm:text-[42px]" : "text-[54px] sm:text-[68px]"
      }`}
    >
      {numeric ? counted : value}
      {suffix ? <span className="text-[0.5em]">{suffix}</span> : null}
    </span>
  );
}

/** The week's 24-hour shape. There is nothing to scale it against but itself. */
function Hours({ hours, ink }: { hours: number[]; ink: string }) {
  const peak = Math.max(1, ...hours);
  return (
    <div className="mt-6 flex h-16 w-full items-end gap-[3px]">
      {hours.map((n, h) => (
        <span
          key={h}
          className="anim-story-bar flex-1 rounded-[2px]"
          style={{
            height: `${Math.max(2, (n / peak) * 100)}%`,
            backgroundColor: ink,
            opacity: n === 0 ? 0.18 : 1,
            animationDelay: `${h * 18}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function WeeklyReview({
  review,
  canGoForward,
  onStep,
  onClose,
}: {
  review: WeekReview;
  canGoForward: boolean;
  onStep: (weeks: number) => void;
  onClose: () => void;
}) {
  const cards = useMemo(() => buildCards(review), [review]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const frame = useRef<HTMLDivElement>(null);

  // A different week is a different story, so it starts from the top.
  const [seenWeek, setSeenWeek] = useState(review.weekKey);
  if (seenWeek !== review.weekKey) {
    setSeenWeek(review.weekKey);
    setI(0);
  }

  const last = i >= cards.length - 1;

  useEffect(() => {
    frame.current?.focus();
  }, []);

  /*
   * Auto-advance, which stops at the end rather than closing. Being thrown out
   * of something you were still reading is worse than a story that waits.
   */
  useEffect(() => {
    if (paused || last) return;
    const id = setTimeout(() => setI((n) => n + 1), DWELL);
    return () => clearTimeout(id);
  }, [paused, last, i]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, cards.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, cards.length]);

  const card = cards[i];
  const pair = PAIRS[i % PAIRS.length];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review of ${review.weekKey}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={frame}
        tabIndex={-1}
        style={{ backgroundColor: pair.bg, color: "#F5F5F4" }}
        className="relative flex h-[min(640px,88vh)] w-full max-w-[430px] flex-col overflow-hidden rounded-2xl shadow-2xl transition-colors duration-500 focus:outline-none"
      >
        {/* One segment per card, filling as its card plays. */}
        <div className="flex shrink-0 gap-1 p-3">
          {cards.map((c, n) => (
            <span
              key={c.key}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
            >
              <span
                className="block h-full rounded-full bg-white"
                style={
                  n < i
                    ? { width: "100%" }
                    : n > i
                      ? { width: 0 }
                      : {
                          width: "100%",
                          transformOrigin: "left",
                          animation: paused
                            ? "none"
                            : `story-fill ${DWELL}ms linear forwards`,
                        }
                }
              />
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 px-4 pb-1">
          <span className="text-[11px] uppercase tracking-[0.12em] opacity-60">
            {formatWeekRange(review.from, review.to)}
            {review.current ? " · so far" : ""}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play" : "Pause"}
              className="rounded p-1.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {paused ? (
                <PlayIcon className="size-3.5" />
              ) : (
                <PauseIcon className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review"
              className="rounded p-1.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <XIcon className="size-4" />
            </button>
          </span>
        </div>

        {/*
          Keyed on the card, so arriving at one is a mount and everything inside
          replays its entrance without being told to.
        */}
        <div
          key={card.key}
          className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-7 py-4"
        >
          <p
            className="anim-story-kicker text-[12px] uppercase tracking-[0.14em]"
            style={{ color: pair.ink }}
          >
            {card.kicker}
          </p>

          <div className="mt-3">
            <Value value={card.value} suffix={card.suffix} />
          </div>

          {card.caption ? (
            <p className="anim-story-caption mt-3 text-[14px] leading-snug opacity-75">
              {card.caption}
            </p>
          ) : null}

          {card.hours ? <Hours hours={card.hours} ink={pair.ink} /> : null}

          {card.rows && card.rows.length > 0 ? (
            <div className="mt-5 grid gap-2">
              {card.rows.map((r, n) => (
                <div
                  key={r.label}
                  className="anim-story-row flex items-baseline gap-3 border-t border-white/15 pt-2"
                  style={{ animationDelay: `${140 + n * 90}ms` }}
                >
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {r.label}
                  </span>
                  <span
                    className="tnum shrink-0 text-[12.5px]"
                    style={{ color: pair.ink }}
                  >
                    {r.note}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 px-3 pb-3">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(n - 1, 0))}
            disabled={i === 0}
            aria-label="Previous card"
            className="rounded p-1.5 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setI((n) => Math.min(n + 1, cards.length - 1))}
            disabled={last}
            aria-label="Next card"
            className="rounded p-1.5 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <ChevronRightIcon className="size-5" />
          </button>

          <span className="ml-auto flex items-center gap-1 text-[11.5px]">
            <button
              type="button"
              onClick={() => onStep(-1)}
              className="rounded px-2 py-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              earlier week
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={!canGoForward}
              className="rounded px-2 py-1 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              later week
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Friday" — which is what a story wants, where a table wanted "Aug 28". */
function weekdayOf(dayKey: string): string {
  return fromDayKey(dayKey).toLocaleDateString(undefined, { weekday: "long" });
}

/**
 * The week, as cards.
 *
 * Only what the week actually contained: a card reading "nothing" is dead air,
 * so an untroubled week is simply a shorter story.
 */
function buildCards(r: WeekReview): Card[] {
  const cards: Card[] = [];
  const ratio = r.total === 0 ? null : Math.round((r.done / r.total) * 100);
  const prevRatio =
    r.prevTotal === 0 ? null : Math.round((r.prevDone / r.prevTotal) * 100);

  const [year, weekNo] = r.weekKey.split("-W");
  cards.push({
    key: "cover",
    kicker: r.current ? "This week, so far" : "Your week",
    value: `Week ${Number(weekNo)}`,
    caption: `${formatWeekRange(r.from, r.to)} · ${year}`,
  });

  if (ratio !== null) {
    // Only compared where there is a week behind it worth comparing against.
    const delta =
      prevRatio === null
        ? "Nothing to measure it against yet."
        : ratio === prevRatio
          ? "Exactly where you were the week before."
          : ratio > prevRatio
            ? `Up from ${prevRatio}% the week before.`
            : `Down from ${prevRatio}% the week before.`;
    cards.push({
      key: "finished",
      kicker: "You finished",
      value: ratio,
      suffix: "%",
      caption: `${r.done} of ${r.total} daily tasks. ${delta}`,
    });
  }

  cards.push({
    key: "perfect",
    kicker: "Perfect days",
    value: r.perfectDays,
    caption:
      r.perfectDays === 0
        ? "No day where everything due got done."
        : r.perfectDays === 7
          ? "Every single day. That is the whole week."
          : `${r.perfectDays} of 7 days where everything due got done.`,
  });

  if (r.bestDay) {
    cards.push({
      key: "best",
      kicker: "Your best day",
      value: weekdayOf(r.bestDay.dayKey),
      caption: `${formatDayShort(r.bestDay.dayKey)} · ${r.bestDay.done} of ${r.bestDay.total} done.`,
    });
  }

  if (r.hours.some((b) => b.count > 0)) {
    const busiest = r.hours.reduce((best, b) =>
      b.count > best.count ? b : best,
    );
    cards.push({
      key: "hours",
      kicker: "When you worked",
      value: formatClock(busiest.hour * 60),
      caption: "The hour you ticked most things off.",
      hours: r.hours.map((b) => b.count),
    });
  }

  if (r.slips.length > 0) {
    cards.push({
      key: "slipped",
      kicker: "What slipped",
      value: r.slips[0].missed,
      caption: `days missed on ${r.slips[0].task.title}.`,
      rows: r.slips.slice(1).map((s) => ({
        label: s.task.title,
        note: `missed ${s.missed} of ${s.due}`,
      })),
    });
  }

  if (r.goalsMoved.length > 0) {
    const top = r.goalsMoved[0];
    cards.push({
      key: "goals",
      kicker: "Goals you moved",
      value: top.goal.title,
      caption: `${top.days} ${top.days === 1 ? "day" : "days"} of work went into it.`,
      rows: r.goalsMoved.slice(1).map((m) => ({
        label: m.goal.title,
        note: `${m.days} ${m.days === 1 ? "day" : "days"}`,
      })),
    });
  }

  if (r.stale.length > 0) {
    cards.push({
      key: "stale",
      kicker: "Going cold",
      value: r.stale[0].days,
      suffix: "d",
      caption: `since you last touched ${r.stale[0].task.title}.`,
      rows: r.stale.slice(1).map((s) => ({
        label: s.task.title,
        note: `${s.days} days`,
      })),
    });
  }

  cards.push({
    key: "end",
    kicker: "That was the week",
    value: r.current ? "Still going" : "See you next week",
    caption: r.current
      ? "This one is not finished yet. Come back when it is."
      : "Close this and get on with it.",
  });

  return cards;
}
