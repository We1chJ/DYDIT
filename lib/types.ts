export type Cadence = "daily" | "weekly" | "monthly" | "once";

export type SectionId =
  | "daily"
  | "weekly"
  | "monthly"
  | "spontaneous"
  | "longterm";

export type Task = {
  id: string;
  title: string;
  section: SectionId;
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

export type SectionDef = {
  id: SectionId;
  label: string;
  cadence: Cadence;
  /** Shown in the empty state — says what this section is for, in one line. */
  blurb: string;
};

/*
 * `cadence` is separate from `section` because Spontaneous and Long-term goals
 * are both one-off but are different lists. Section drives grouping; cadence
 * drives when the checkbox resets.
 */
export const SECTIONS: SectionDef[] = [
  {
    id: "daily",
    label: "Daily",
    cadence: "daily",
    blurb: "Resets every night. These are the ones the heatmap counts.",
  },
  {
    id: "weekly",
    label: "Weekly",
    cadence: "weekly",
    blurb: "Resets Monday morning.",
  },
  {
    id: "monthly",
    label: "Monthly",
    cadence: "monthly",
    blurb: "Resets on the 1st.",
  },
  {
    id: "spontaneous",
    label: "Spontaneous",
    cadence: "once",
    blurb: "One-off things. Check it once and it's done.",
  },
  {
    id: "longterm",
    label: "Long-term goals",
    cadence: "once",
    blurb: "The slow ones. No reset, no pressure.",
  },
];

export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));
