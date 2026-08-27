export type Cadence = "daily" | "weekly" | "once";

export type Task = {
  id: string;
  title: string;
  cadence: Cadence;
  archived_at: string | null;
  created_at: string;
};

export type Completion = {
  id: string;
  task_id: string;
  period_key: string;
  /** Local calendar day the box was ticked, as YYYY-MM-DD. */
  completed_on: string;
};

export type TabDef = {
  cadence: Cadence;
  label: string;
  /** Sits under the tab label — says when this list wipes itself. */
  resets: string;
  /** Shown when the list is empty. */
  blurb: string;
};

/*
 * One tab per cadence. There is no separate "section" concept: a list *is* its
 * reset rule, so the two would only ever have to be kept in sync.
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
  {
    cadence: "once",
    label: "Long-term",
    resets: "no reset",
    blurb: "One-off tasks and slow goals. Check it once and it stays done.",
  },
];

export const TAB_BY_CADENCE = new Map(TABS.map((t) => [t.cadence, t]));
