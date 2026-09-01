"use client";

import { GripVerticalIcon } from "lucide-react";
import { useRef, useState } from "react";

/*
 * Drag-to-reorder, built on pointer events.
 *
 * The gesture is deliberately hand-rolled rather than pulled from a library.
 * Pointer events already unify mouse, trackpad and touch, and setPointerCapture
 * already routes every move and release back to the handle even when the cursor
 * outruns it — which is most of what a drag library is for. What is left is
 * about eighty lines of arithmetic.
 *
 * Nothing is reordered while the gesture is running. The rows stay exactly
 * where they are and are translated into place, so the measurements taken at
 * pointerdown stay true for the whole drag; the list only actually changes when
 * the pointer comes up. Reordering live would invalidate those measurements on
 * every frame and make the row you are holding chase its own tail.
 */

type Row = { top: number; height: number };

type Drag = {
  from: number;
  /** Where the row would land if the pointer were released now. */
  over: number;
  /** How far the held row has travelled from where it started, in pixels. */
  dy: number;
  /** Its height, which is how far every displaced row has to shift. */
  height: number;
};

type SortableListProps<T> = {
  items: T[];
  getId: (item: T) => string;
  /** Names the handle for screen readers, e.g. "Reorder Anki reps". */
  getLabel: (item: T) => string;
  /** Rows that cannot be picked up — one with no server id yet has nowhere to go. */
  isLocked?: (item: T) => boolean;
  onMove: (id: string, to: number) => void;
  /**
   * `handle` is the grip itself, already wired, for the row to place wherever
   * it wants. The gesture handlers are attached here rather than handed over as
   * props so they sit on real JSX event attributes — a bag of closures built
   * during render reads to the linter as something that might be called during
   * render, which is exactly what a ref must not be touched from.
   */
  children: (
    item: T,
    ctx: { index: number; handle: React.ReactNode; dragging: boolean },
  ) => React.ReactNode;
};

export function SortableList<T>({
  items,
  getId,
  getLabel,
  isLocked,
  onMove,
  children,
}: SortableListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  /*
   * Scratch state for the gesture in progress. Refs rather than state because
   * nothing here is rendered, and because pointermove would otherwise be
   * reading values one render behind the pointer.
   */
  const rows = useRef<Row[]>([]);
  /*
   * `over` is tracked here as well as in state, and it is the copy here that
   * decides where the row lands. State is for drawing; a release can follow the
   * last move closely enough that React has not re-rendered in between, and
   * reading the drop target from a value one render behind silently loses the
   * move.
   */
  const grab = useRef<{
    id: string;
    from: number;
    startY: number;
    over: number;
  } | null>(null);

  function begin(e: React.PointerEvent, index: number) {
    // Right- and middle-clicks also fire pointerdown, and neither means "drag".
    if (e.button !== 0) return;
    const list = listRef.current;
    if (!list) return;

    // Stops the browser starting a text selection that would follow the drag.
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    rows.current = Array.from(list.children).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });

    grab.current = {
      id: getId(items[index]),
      from: index,
      startY: e.clientY,
      over: index,
    };
    setDrag({ from: index, over: index, dy: 0, height: rows.current[index].height });
  }

  function move(e: React.PointerEvent) {
    const g = grab.current;
    if (!g) return;

    const dy = e.clientY - g.startY;
    const held = rows.current[g.from];
    const centre = held.top + held.height / 2 + dy;

    /*
     * A row swaps places once its centre passes a neighbour's centre — not its
     * edge, which would make short rows trade places twice in one pass. Only
     * the direction of travel is scanned, so a drag that overshoots and comes
     * back lands where it looks like it should.
     */
    let over = g.from;
    if (dy < 0) {
      for (let i = 0; i < g.from; i++) {
        if (centre < rows.current[i].top + rows.current[i].height / 2) {
          over = i;
          break;
        }
      }
    } else {
      for (let i = rows.current.length - 1; i > g.from; i--) {
        if (centre > rows.current[i].top + rows.current[i].height / 2) {
          over = i;
          break;
        }
      }
    }

    g.over = over;
    setDrag((d) => (d && (d.over !== over || d.dy !== dy) ? { ...d, over, dy } : d));
  }

  function end() {
    const g = grab.current;
    grab.current = null;
    setDrag(null);
    if (g && g.over !== g.from) onMove(g.id, g.over);
  }

  /** Cancelled gestures drop the row back where it was — no move is committed. */
  function cancel() {
    grab.current = null;
    setDrag(null);
  }

  function keys(e: React.KeyboardEvent, index: number) {
    const to =
      e.key === "ArrowUp"
        ? index - 1
        : e.key === "ArrowDown"
          ? index + 1
          : null;
    if (to === null || to < 0 || to >= items.length) return;
    e.preventDefault();
    // The handle keeps focus through the reorder because React keys the row by
    // id, so the DOM node moves rather than being rebuilt.
    onMove(getId(items[index]), to);
  }

  function offset(index: number): number {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.over > drag.from && index > drag.from && index <= drag.over) {
      return -drag.height;
    }
    if (drag.over < drag.from && index >= drag.over && index < drag.from) {
      return drag.height;
    }
    return 0;
  }

  return (
    <div ref={listRef} className={drag ? "select-none" : undefined}>
      {items.map((item, index) => {
        const held = drag?.from === index;
        const locked = isLocked?.(item) ?? false;

        return (
          <div
            key={getId(item)}
            style={{
              transform: `translateY(${offset(index)}px)`,
              // The held row tracks the pointer exactly; everything else eases
              // out of its way. A transition on the held row would lag behind
              // the cursor by the length of the transition.
              transition: held ? undefined : "transform 160ms cubic-bezier(0.2, 0, 0, 1)",
            }}
            className={held ? "relative z-10" : undefined}
          >
            {children(item, {
              index,
              dragging: held,
              handle: locked ? null : (
                <button
                  type="button"
                  onPointerDown={(e) => begin(e, index)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={cancel}
                  onKeyDown={(e) => keys(e, index)}
                  aria-label={`Reorder ${getLabel(item)}`}
                  title="Drag to reorder"
                  // touch-none is what lets a finger drag vertically here
                  // instead of the gesture being claimed by the page scroll or
                  // by the horizontal swipe between lists.
                  className={`cursor-grab touch-none rounded text-faint transition-opacity hover:text-muted-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100 ${
                    held ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <GripVerticalIcon className="size-3.5" />
                </button>
              ),
            })}
          </div>
        );
      })}
    </div>
  );
}
