import type { Task } from "@/lib/types";

/**
 * Manual ordering, as fractional indices.
 *
 * A dragged row is given a number strictly between its two new neighbours, so
 * moving one row writes one row. The obvious alternative — an integer rank per
 * row — has to renumber everything below the drop on every single drag, which
 * is N writes for one gesture and an optimistic update that can half-apply.
 *
 * The cost is that repeatedly dropping into the same shrinking gap halves the
 * distance each time, and a double runs out of room after roughly fifty
 * consecutive halvings. That would take fifty drags into one gap with no
 * intervening move anywhere else, which is not a thing anyone does to a to-do
 * list, so there is no renumbering pass here to go wrong.
 */

/** The gap left between neighbours when a list is numbered from scratch. */
const STEP = 1;

/**
 * A sort_order that falls strictly between two neighbours.
 *
 * Either side may be null, meaning "nothing there": at the top of a list, at
 * the bottom, or in a list that is still empty.
 */
export function sortOrderBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return STEP;
  if (before === null) return (after as number) - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

/**
 * The order rows come back from the database in.
 *
 * Kept in step with the `.order()` calls in app/page.tsx, because an optimistic
 * move re-sorts the local mirror with this and the two orders disagreeing would
 * show as a row jumping when the server's answer lands. A null sort_order sorts
 * last, so a row written before the column existed sits at the end of its list
 * rather than silently at the top.
 */
export function compareTasks(a: Task, b: Task): number {
  if (a.sort_order !== b.sort_order) {
    if (a.sort_order === null) return 1;
    if (b.sort_order === null) return -1;
    return a.sort_order - b.sort_order;
  }
  // created_at is an ISO string, so lexicographic order is chronological.
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return 0;
}

/**
 * Where a row lands when it is dropped at `to` in `list`.
 *
 * The neighbours are read from the list *after* the move, which is the whole
 * subtlety: dragging downwards means everything between the old and new slot
 * has already shifted up by one, so reading them from the original list would
 * pick the wrong pair and drop the row one place short.
 */
export function orderForMove(list: Task[], from: number, to: number): number {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return sortOrderBetween(
    next[to - 1]?.sort_order ?? null,
    next[to + 1]?.sort_order ?? null,
  );
}
