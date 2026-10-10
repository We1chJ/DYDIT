import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  formatClock,
  fromDayKey,
  isoWeekKey,
  logicalDayKey,
  minuteOfDay,
  periodKey,
  toDayKey,
  wallClockIn,
} from "@/lib/periods";
import { sortOrderBetween } from "@/lib/order";
import { createOwnerClient } from "@/lib/supabase/admin";
import type { Cadence } from "@/lib/types";

/*
 * The tools Claude gets, served from app/api/mcp/[secret]/route.ts.
 *
 * These mirror app/actions.ts rather than calling it: the actions read the
 * signed-in user from the browser's cookies, and a request from Claude has no
 * cookies. So the same rules are restated here against a secret-key client —
 * and because that client skips Row Level Security, EVERY query below filters
 * on ownerId. That filter is the only thing keeping these tools inside your
 * own rows, so a new query without it is a bug.
 *
 * Nothing here hard-deletes. Archiving keeps history, exactly as in the app.
 */

type Owner = ReturnType<typeof createOwnerClient>;

/*
 * The app stores the to-do list as cadence "once" (see ONCE in lib/types.ts),
 * which is accurate but means nothing to a reader. Tools speak "todo" and
 * translate at the edge.
 */
const LISTS = ["todo", "daily", "weekly"] as const;
type List = (typeof LISTS)[number];
const toCadence = (list: List): Cadence => (list === "todo" ? "once" : list);
const toList = (cadence: Cadence): List => (cadence === "once" ? "todo" : cadence);

const TaskTitle = z.string().trim().min(1).max(500);
const GoalTitle = z.string().trim().min(1).max(200);

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function reply(value: unknown): ToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { content: [{ type: "text", text }] };
}

/**
 * Runs a tool body and turns any failure into an error result.
 *
 * A thrown error would also reach Claude, but as whatever the SDK makes of it.
 * Saying it plainly lets Claude correct itself — fix the id, shorten the title —
 * rather than give up.
 */
async function run(body: (owner: Owner) => Promise<unknown>): Promise<ToolResult> {
  try {
    return reply(await body(createOwnerClient()));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...reply(message), isError: true };
  }
}

/** Throws a Supabase error as a readable one. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * What "now" means for you: today's day key, this week's key, and the minute.
 *
 * This is the server-side half of what the dashboard does in handleToggle. It
 * needs your timezone because the server's own clock is not where you are —
 * which is why the dashboard records it on every visit.
 */
async function yourClock({ db, ownerId }: Owner) {
  const settings = check(
    await db
      .from("settings")
      .select("day_start_hour, timezone")
      .eq("user_id", ownerId)
      .maybeSingle(),
  );
  if (!settings?.timezone) {
    throw new Error(
      "Dydit doesn't know your timezone yet. Open Dydit in a browser once so " +
        "it can record it, then try again.",
    );
  }

  const now = wallClockIn(settings.timezone);
  const today = fromDayKey(logicalDayKey(now, settings.day_start_hour));
  return {
    today,
    minute: minuteOfDay(now),
    dayStartHour: settings.day_start_hour as number,
    timezone: settings.timezone as string,
  };
}

/** Refuses a goal id that is not one of yours, or is archived. */
async function requireGoal({ db, ownerId }: Owner, goalId: string) {
  const goal = check(
    await db
      .from("goals")
      .select("id")
      .eq("user_id", ownerId)
      .eq("id", goalId)
      .is("archived_at", null)
      .maybeSingle(),
  );
  if (!goal) throw new Error(`No active goal with id ${goalId}.`);
}

/** An update that touched nothing means the id was wrong; say so. */
function requireOne<T>(rows: T[] | null, what: string, id: string): T {
  if (!rows?.length) throw new Error(`No active ${what} with id ${id}.`);
  return rows[0];
}

const INSTRUCTIONS = `Dydit is the user's personal to-do and habit tracker.

There are three lists: "todo" (one-off tasks that stay ticked once done), "daily" (resets every day) and "weekly" (resets every Monday). The day begins at the user's chosen hour, not midnight, so a tick at 1am can still count for the day before; the server works this out, so never pass dates.

Goals are long-term aims. They are never ticked; tasks link to them and their progress comes from those tasks.

Always call list_tasks first to get ids, and refer to tasks and goals by id. Removing a task or goal archives it and keeps its history; there is no hard delete.`;

/** A fresh server per request — the route is stateless, as Vercel needs. */
export function buildServer() {
  const server = new McpServer(
    { name: "dydit", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Every active task in the todo, daily and weekly lists, in the order shown in the app, " +
        "with whether each is done for the current period. Also returns active goals. " +
        "Call this first: the other tools take ids from here.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async (owner) => {
        const { db, ownerId } = owner;
        const clock = await yourClock(owner);
        const dayKey = toDayKey(clock.today);
        const weekKey = isoWeekKey(clock.today);

        const [tasks, goals, done] = await Promise.all([
          db
            .from("tasks")
            .select("id, title, cadence, goal_id")
            .eq("user_id", ownerId)
            .is("archived_at", null)
            // Same order as app/page.tsx, so "the third one" means the same thing.
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true })
            .then(check),
          db
            .from("goals")
            .select("id, title")
            .eq("user_id", ownerId)
            .is("archived_at", null)
            .order("created_at", { ascending: true })
            .then(check),
          db
            .from("completions")
            .select("task_id, period_key")
            .eq("user_id", ownerId)
            .in("period_key", [dayKey, weekKey, "once"])
            .then(check),
        ]);

        const ticked = new Set((done ?? []).map((c) => `${c.task_id}|${c.period_key}`));
        const goalTitle = new Map((goals ?? []).map((g) => [g.id, g.title]));
        const lists: Record<List, unknown[]> = { todo: [], daily: [], weekly: [] };
        for (const t of tasks ?? []) {
          const cadence = t.cadence as Cadence;
          lists[toList(cadence)].push({
            id: t.id,
            title: t.title,
            done: ticked.has(`${t.id}|${periodKey(cadence, clock.today)}`),
            goal: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null,
            goal_id: t.goal_id,
          });
        }

        return {
          today: dayKey,
          week: weekKey,
          day_starts_at: formatClock(clock.dayStartHour * 60),
          timezone: clock.timezone,
          ...lists,
          goals: goals ?? [],
        };
      }),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description:
        'Add a task to the bottom of a list. "todo" is the plain to-do list and the default; ' +
        '"daily" and "weekly" are recurring. Optionally link it to a goal by id.',
      inputSchema: z.object({
        title: TaskTitle,
        list: z.enum(LISTS).default("todo"),
        goal_id: z.uuid().nullable().optional(),
      }),
    },
    ({ title, list, goal_id }) =>
      run(async (owner) => {
        const { db, ownerId } = owner;
        const cadence = toCadence(list);
        if (goal_id) await requireGoal(owner, goal_id);

        // The foot of its list, as the dashboard places a new row — see lib/order.ts.
        const last = check(
          await db
            .from("tasks")
            .select("sort_order")
            .eq("user_id", ownerId)
            .eq("cadence", cadence)
            .is("archived_at", null)
            .order("sort_order", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
        );

        const task = check(
          await db
            .from("tasks")
            .insert({
              user_id: ownerId,
              title,
              cadence,
              goal_id: goal_id ?? null,
              sort_order: sortOrderBetween(last?.sort_order ?? null, null),
            })
            .select("id, title")
            .single(),
        );
        return { added: { ...task, list } };
      }),
  );

  server.registerTool(
    "set_done",
    {
      title: "Tick or untick a task",
      description:
        "Mark a task done (or not done) for the current period: today for daily, this week " +
        "for weekly, for good for todo. The server works out the period from the user's clock.",
      inputSchema: z.object({ task_id: z.uuid(), done: z.boolean() }),
      annotations: { idempotentHint: true },
    },
    ({ task_id, done }) =>
      run(async (owner) => {
        const { db, ownerId } = owner;
        const task = check(
          await db
            .from("tasks")
            .select("id, title, cadence")
            .eq("user_id", ownerId)
            .eq("id", task_id)
            .is("archived_at", null)
            .maybeSingle(),
        );
        if (!task) throw new Error(`No active task with id ${task_id}.`);

        const clock = await yourClock(owner);
        const key = periodKey(task.cadence as Cadence, clock.today);

        if (done) {
          check(
            await db.from("completions").upsert(
              {
                user_id: ownerId,
                task_id,
                period_key: key,
                completed_on: toDayKey(clock.today),
                completed_minute: clock.minute,
              },
              { onConflict: "task_id,period_key", ignoreDuplicates: true },
            ),
          );
        } else {
          check(
            await db
              .from("completions")
              .delete()
              .eq("user_id", ownerId)
              .eq("task_id", task_id)
              .eq("period_key", key),
          );
        }
        return { task: task.title, done, period: key };
      }),
  );

  server.registerTool(
    "rename_task",
    {
      title: "Rename task",
      description: "Change a task's title. Its history is kept.",
      inputSchema: z.object({ task_id: z.uuid(), title: TaskTitle }),
      annotations: { idempotentHint: true },
    },
    ({ task_id, title }) =>
      run(async ({ db, ownerId }) => {
        const rows = check(
          await db
            .from("tasks")
            .update({ title })
            .eq("user_id", ownerId)
            .eq("id", task_id)
            .is("archived_at", null)
            .select("id"),
        );
        requireOne(rows, "task", task_id);
        return { renamed: { id: task_id, title } };
      }),
  );

  server.registerTool(
    "archive_task",
    {
      title: "Remove task",
      description:
        "Remove a task from its list. It is archived, not deleted: its past completions stay " +
        "in the history and charts. This is what removing a task in the app does.",
      inputSchema: z.object({ task_id: z.uuid() }),
      annotations: { destructiveHint: true },
    },
    ({ task_id }) =>
      run(async ({ db, ownerId }) => {
        const rows = check(
          await db
            .from("tasks")
            .update({ archived_at: new Date().toISOString() })
            .eq("user_id", ownerId)
            .eq("id", task_id)
            .is("archived_at", null)
            .select("id, title"),
        );
        return { archived: requireOne(rows, "task", task_id) };
      }),
  );

  server.registerTool(
    "set_task_goal",
    {
      title: "Link task to goal",
      description:
        "Link a task to a goal by id, or pass goal_id null to unlink it. The goal picks up " +
        "the task's whole history.",
      inputSchema: z.object({ task_id: z.uuid(), goal_id: z.uuid().nullable() }),
      annotations: { idempotentHint: true },
    },
    ({ task_id, goal_id }) =>
      run(async (owner) => {
        const { db, ownerId } = owner;
        if (goal_id) await requireGoal(owner, goal_id);
        const rows = check(
          await db
            .from("tasks")
            .update({ goal_id })
            .eq("user_id", ownerId)
            .eq("id", task_id)
            .is("archived_at", null)
            .select("id"),
        );
        requireOne(rows, "task", task_id);
        return { task_id, goal_id };
      }),
  );

  server.registerTool(
    "add_goal",
    {
      title: "Add goal",
      description: "Create a long-term goal. Goals are never ticked; link tasks to them instead.",
      inputSchema: z.object({ title: GoalTitle }),
    },
    ({ title }) =>
      run(async ({ db, ownerId }) => {
        const goal = check(
          await db
            .from("goals")
            .insert({ user_id: ownerId, title })
            .select("id, title")
            .single(),
        );
        return { added: goal };
      }),
  );

  server.registerTool(
    "rename_goal",
    {
      title: "Rename goal",
      description: "Change a goal's title. Linked tasks stay linked.",
      inputSchema: z.object({ goal_id: z.uuid(), title: GoalTitle }),
      annotations: { idempotentHint: true },
    },
    ({ goal_id, title }) =>
      run(async ({ db, ownerId }) => {
        const rows = check(
          await db
            .from("goals")
            .update({ title })
            .eq("user_id", ownerId)
            .eq("id", goal_id)
            .is("archived_at", null)
            .select("id"),
        );
        requireOne(rows, "goal", goal_id);
        return { renamed: { id: goal_id, title } };
      }),
  );

  server.registerTool(
    "archive_goal",
    {
      title: "Remove goal",
      description:
        "Archive a goal. Its tasks are kept exactly as they are and simply stop counting " +
        "towards it.",
      inputSchema: z.object({ goal_id: z.uuid() }),
      annotations: { destructiveHint: true },
    },
    ({ goal_id }) =>
      run(async ({ db, ownerId }) => {
        const rows = check(
          await db
            .from("goals")
            .update({ archived_at: new Date().toISOString() })
            .eq("user_id", ownerId)
            .eq("id", goal_id)
            .is("archived_at", null)
            .select("id, title"),
        );
        return { archived: requireOne(rows, "goal", goal_id) };
      }),
  );

  return server;
}
