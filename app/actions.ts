"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TAB_BY_CADENCE, type Cadence } from "@/lib/types";

type Result = { error?: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

export async function addTask(
  cadence: Cadence,
  title: string,
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
  });

  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/**
 * Tick or untick a task for one period.
 *
 * periodKey and completedOn are computed in the browser because they depend on
 * the user's local calendar day — see lib/periods.ts.
 */
export async function setDone(
  taskId: string,
  periodKey: string,
  completedOn: string,
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
