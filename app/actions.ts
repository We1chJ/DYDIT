"use server";

import { revalidatePath } from "next/cache";
import { isAllowed } from "@/lib/allowlist";
import { createClient } from "@/lib/supabase/server";
import { TAB_BY_CADENCE, type Cadence } from "@/lib/types";

type Result = { error?: string };

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
  cadence: Cadence,
  title: string,
  goalId: string | null = null,
): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the task a name." };
  if (trimmed.length > 500) return { error: "That title is too long." };

  // Checked against the known tabs so an arbitrary string can't reach the
  // insert and trip the CHECK constraint.
  if (!TAB_BY_CADENCE.has(cadence)) return { error: "Unknown list." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: trimmed,
    cadence,
    goal_id: goalId,
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

export async function addGoal(title: string): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the goal a name." };
  if (trimmed.length > 200) return { error: "That goal name is too long." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("goals")
    .insert({ user_id: user.id, title: trimmed });

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
