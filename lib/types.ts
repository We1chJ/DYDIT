export type Cadence = "daily" | "weekly" | "once";

/**
 * A long-term goal. Never checked off directly — its progress is derived from
 * the daily and weekly tasks that point at it.
 */
export type Goal = {
  id: string;
  title: string;
  archived_at: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  cadence: Cadence;
  /** Optional edge to a Goal. Null means the task stands on its own. */
  goal_id: string | null;
  archived_at: string | null;
  created_at: string;
};

export type Completion = {
  id: string;
  task_id: string;
  period_key: string;
  /** Local calendar day the box was ticked, as YYYY-MM-DD. */
  completed_on: string;
  /**
   * Minutes since local midnight when the box was ticked, 0-1439.
   *
   * Null for rows written before the column existed, so every reader has to
   * cope with its absence rather than assuming a time.
   */
  completed_minute: number | null;
};

export type TabDef = {
  cadence: Cadence;
  label: string;
  /** Sits under the tab label — says when this list wipes itself. */
  resets: string;
  /** Shown when the list is empty. */
  blurb: string;
};

/**
 * The one-off list — the plain to-do list, as opposed to the recurring ones.
 *
 * Deliberately not a tab: the recurring lists are a rhythm you swipe between,
 * whereas whatever came up today wants to be visible at the same time as them,
 * so it gets a card of its own above the strip.
 *
 * The cadence stays "once" because that is what the database stores and what
 * the never-moving period key is named after. Only the heading is friendlier.
 */
export const ONCE: TabDef = {
  cadence: "once",
  label: "To-do list",
  resets: "never resets",
  blurb: "Whatever came up. Tick it and it stays ticked until you clear it.",
};

/*
 * One tab per recurring cadence. There is no separate "section" concept: a list
 * *is* its reset rule, so the two would only ever have to be kept in sync.
 */
export const TABS: TabDef[] = [
  {
    cadence: "daily",
    label: "Daily",
    resets: "resets nightly",
    blurb: "The everyday ones. These are what the charts above count.",
  },
  {
    cadence: "weekly",
    label: "Weekly",
    resets: "resets Monday",
    blurb: "Things that need doing once a week, whenever suits.",
  },
];

// Every list, tabbed or not — this is what validates an incoming cadence, so
// leaving Once out of it would make one-off tasks unsavable.
export const TAB_BY_CADENCE = new Map(
  [...TABS, ONCE].map((t) => [t.cadence, t]),
);
