"use client";

import { PlayIcon } from "lucide-react";

/**
 * The way into the weekly review, on the weeks it has something to say.
 *
 * A header button is the wrong shape for something that matters once every
 * seven days: it is either ignorable enough to miss for a fortnight, or loud
 * enough to be clutter the rest of the time. So the entrance is a card while
 * the week is unread, and the quiet header button once it has been seen.
 *
 * It borrows the story's own colours rather than the app's, which is the point
 * — it should look like a door into somewhere else.
 */
export function ReviewBanner({
  range,
  onOpen,
}: {
  range: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ backgroundColor: "#0B3D2E", color: "#F5F5F4" }}
      className="anim-banner-in group flex w-full items-center gap-4 overflow-hidden rounded-lg px-4 py-3.5 text-left transition-transform hover:scale-[1.006] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110"
        style={{ backgroundColor: "#A3E635", color: "#0B3D2E" }}
      >
        <PlayIcon className="size-4 translate-x-px fill-current" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block text-[11px] uppercase tracking-[0.14em]"
          style={{ color: "#A3E635" }}
        >
          Your week is ready
        </span>
        <span className="mt-0.5 block truncate text-[14.5px] font-medium">
          {range}
        </span>
      </span>

      <span className="shrink-0 text-[12px] opacity-70">Play</span>
    </button>
  );
}
