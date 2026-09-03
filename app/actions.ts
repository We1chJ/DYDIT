"use server";

import { revalidatePath } from "next/cache";
import { isAllowed } from "@/lib/allowlist";
import { createClient } from "@/lib/supabase/server";
import { TAB_BY_CADENCE, type Cadence } from "@/lib/types";

type Result = { error?: string };

/*
 * Rows are inserted under an id the browser chose — see lib/ids.ts. The column
 * default still stands for every other caller; this only checks that what
 * arrives is actually a UUID, so a malformed one fails here with something
 * readable instead of as a cast error from Postgres.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  // Every write goes through here, so one check covers all of them.
  if (!isAllowed(user.email)) throw new Error("This account isn't allowed here.");
  return { supabase, user };
}

export async function addTask(
  id: string,
  cadence: Cadence,
  title: string,
  goalId: string | null = null,
  // Worked out in the browser from the list already on screen, which is the
  // only place the new row's neighbours are known without a second round trip.
  sortOrder: number | null = null,
): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the task a name." };
  if (trimmed.length > 500) return { error: "That title is too long." };
  if (!UUID.test(id)) return { error: "That task id isn't valid." };

  // Checked against the known tabs so an arbitrary string can't reach the
  // insert and trip the CHECK constraint.
  if (!TAB_BY_CADENCE.has(cadence)) return { error: "Unknown list." };
  if (sortOrder !== null && !Number.isFinite(sortOrder)) {
    return { error: "That position isn't a number." };
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("tasks").insert({
    id,
    user_id: user.id,
    title: trimmed,
    cadence,
    goal_id: goalId,
    sort_order: sortOrder,
  });

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Tick or untick a task for one period.
 *
 * periodKey, completedOn and minute are all computed in the browser because
 * they depend on the user's local clock — see lib/periods.ts. The server's own
 * created_at is kept too, but it cannot say what time it was where you were.
 */
export async function setDone(
  taskId: string,
  periodKey: string,
  completedOn: string,
  minute: number,
  done: boolean,
): Promise<Result> {
  const { supabase, user } = await requireUser();

  if (done) {
    const { error } = await supabase.from("completions").upsert(
      {
        user_id: user.id,
        task_id: taskId,
        period_key: periodKey,
        completed_on: completedOn,
        completed_minute: minute,
      },
      { onConflict: "task_id,period_key", ignoreDuplicates: true },
    );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("completions")
      .delete()
      .eq("task_id", taskId)
      .eq("period_key", periodKey);
    if (error) return { error: error.message };
  }

  revalidatePath("/");
  return {};
}

/**
 * Removing a task archives it rather than deleting it.
 *
 * A hard delete would cascade its completions away and silently rewrite your
 * history — last month's perfect days would stop being perfect. Archiving hides
 * the task from the list while leaving the record of having done it intact.
 */
export async function removeTask(taskId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

export async function addGoal(id: string, title: string): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the goal a name." };
  if (trimmed.length > 200) return { error: "That goal name is too long." };
  if (!UUID.test(id)) return { error: "That goal id isn't valid." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("goals")
    .insert({ id, user_id: user.id, title: trimmed });

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Archives the goal. Its tasks stay exactly where they are and simply stop
 * being linked to anything — removing a goal should never quietly delete the
 * work that fed it.
 */
export async function removeGoal(goalId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", goalId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Re-points a task at a different goal, or at none.
 *
 * Only the edge moves. Completions are keyed on the task, so a goal picks up
 * the task's whole history the moment it is linked — and a bar can move
 * backwards when you unlink something, which is the honest answer.
 */
export async function setTaskGoal(
  taskId: string,
  goalId: string | null,
): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ goal_id: goalId })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}


/**
 * Drops a task at a new spot in its list.
 *
 * Only the one row moves. sortOrder is a fractional index computed in the
 * browser from the neighbours it landed between — the server has no opinion
 * about where things go, it just records the number.
 */
export async function moveTask(
  taskId: string,
  sortOrder: number,
): Promise<Result> {
  if (!Number.isFinite(sortOrder)) {
    return { error: "That position isn't a number." };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ sort_order: sortOrder })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/** Renames a task in place. Its completions are keyed on id, so history holds. */
export async function renameTask(
  taskId: string,
  title: string,
): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "A task needs a name." };
  if (trimmed.length > 500) return { error: "That title is too long." };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ title: trimmed })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/** Renames a goal in place. Its tasks point at the id, so links are unaffected. */
export async function renameGoal(
  goalId: string,
  title: string,
): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "A goal needs a name." };
  if (trimmed.length > 200) return { error: "That goal name is too long." };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("goals")
    .update({ title: trimmed })
    .eq("id", goalId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Moves the hour a day begins at.
 *
 * Nothing stored changes shape — completions keep the keys they were written
 * under. What changes is which day *future* ticks land on, and how the history
 * is bucketed when read back. Moving the boundary therefore re-reads the past
 * as well as the future, which is the intent: it is one answer to "when does my
 * day end", not a per-tick decision.
 */
export async function saveDayStart(
  hour: number,
  timezone: string,
): Promise<Result> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: "Pick an hour between 0 and 23." };
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("settings").upsert(
    {
      user_id: user.id,
      day_start_hour: hour,
      timezone: timezone || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Records that a week's review has been read, which is what clears its mark.
 *
 * Kept on the account rather than in the browser so reading it on one machine
 * settles it everywhere. Only ever moves forward in practice, but nothing here
 * enforces that — reopening an older week is a legitimate thing to do, and the
 * mark is about the newest week regardless.
 */
export async function markReviewSeen(weekKey: string): Promise<Result> {
  if (!/^\d{4}-W\d{2}$/.test(weekKey)) {
    return { error: "That isn't a week." };
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("settings").upsert(
    {
      user_id: user.id,
      review_seen_week: weekKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}
