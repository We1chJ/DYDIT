"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { addGoal, addTask, removeGoal, removeTask, setDone } from "@/app/actions";
import { AddTask } from "@/components/add-task";
import { GoalBars } from "@/components/goal-bars";
import { Heatmap } from "@/components/heatmap";
import { Logo } from "@/components/logo";
import { StatStrip } from "@/components/stat-strip";
import { TaskRow } from "@/components/task-row";
import { TaskTabs, type TabMeta } from "@/components/task-tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { TodayDonut } from "@/components/today-donut";
import { TrendChart } from "@/components/trend-chart";
import {
  addDays,
  formatDayLong,
  fromDayKey,
  monthKey,
  periodKey,
  toDayKey,
} from "@/lib/periods";
import {
  averageRatio,
  completionIndex,
  currentStreak,
  dailyStats,
  goalProgress,
  inMonth,
  isDone,
  perfectDays,
} from "@/lib/stats";
import {
  GOAL_WINDOW_DAYS,
  TABS,
  TAB_BY_CADENCE,
  type Cadence,
  type Completion,
  type Goal,
  type Task,
} from "@/lib/types";

const HEATMAP_WEEKS = 52;
const TREND_DAYS = 30;
const OPTIMISTIC = "optimistic-";

/*
 * The clock is an external store. Polling it through useSyncExternalStore keeps
 * the current day out of React state, so there is no mount-time cascade and the
 * page rolls over on its own if it is left open past midnight.
 */
function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

type DashboardProps = {
  tasks: Task[];
  completions: Completion[];
  goals: Goal[];
  email: string;
};

function verdict(done: number, total: number) {
  if (total === 0) {
    return {
      title: "Nothing due today.",
      sub: "Add a daily task and the charts start filling in.",
    };
  }
  if (done === total) {
    return {
      title: "Yes — that’s all of them.",
      sub: `${total} for ${total}. Come back tomorrow.`,
    };
  }
  if (done === 0) {
    return {
      title: "Not yet.",
      sub: `${total} daily ${total === 1 ? "task" : "tasks"} waiting.`,
    };
  }
  return { title: "Almost.", sub: `${total - done} to go.` };
}

export function Dashboard({
  tasks,
  completions,
  goals,
  email,
}: DashboardProps) {
  /*
   * The current day is null until mount on purpose.
   *
   * Every period key depends on the viewer's local calendar day, which the
   * server cannot know. Deriving it during SSR would render a task unticked at
   * 7pm simply because the server had already rolled over. So the shell renders
   * immediately and anything date-dependent waits one frame for the browser.
   */
  const todayKey = useSyncExternalStore(
    subscribeToClock,
    () => toDayKey(new Date()),
    () => null,
  );
  const today = useMemo(
    () => (todayKey ? fromDayKey(todayKey) : null),
    [todayKey],
  );

  // Local mirrors so a tick lands instantly; server revalidation resyncs them.
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localComps, setLocalComps] = useState(completions);

  // Re-sync when the server sends fresh rows. This is React's sanctioned
  // "adjust state when props change" pattern — an effect here would render the
  // stale list first and then immediately render again.
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (seenTasks !== tasks) {
    setSeenTasks(tasks);
    setLocalTasks(tasks);
  }
  const [seenComps, setSeenComps] = useState(completions);
  if (seenComps !== completions) {
    setSeenComps(completions);
    setLocalComps(completions);
  }
  const [localGoals, setLocalGoals] = useState(goals);
  const [seenGoals, setSeenGoals] = useState(goals);
  if (seenGoals !== goals) {
    setSeenGoals(goals);
    setLocalGoals(goals);
  }

  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
   * Counts user-driven changes. The charts stay static for the first paint and
   * animate every change after it — motion belongs to the moment something
   * actually moved, and a mount animation would leave the charts blank in a
   * background tab where requestAnimationFrame is suspended.
   */
  const [changes, setChanges] = useState(0);
  const bumpChanges = useCallback(() => setChanges((n) => n + 1), []);

  const liveTasks = useMemo(
    () => localTasks.filter((t) => !t.archived_at),
    [localTasks],
  );

  const liveGoals = useMemo(
    () => localGoals.filter((g) => !g.archived_at),
    [localGoals],
  );

  const goalTitles = useMemo(
    () => new Map(liveGoals.map((g) => [g.id, g.title])),
    [liveGoals],
  );

  const goalRows = useMemo(() => {
    if (!today) return [];
    return goalProgress(
      localGoals,
      localTasks,
      localComps,
      today,
      GOAL_WINDOW_DAYS,
    );
  }, [localGoals, localTasks, localComps, today]);

  const stats = useMemo(() => {
    if (!today || !todayKey) return null;
    // A week of slack so the heatmap's first (Monday-aligned) column is covered.
    const fromKey = toDayKey(addDays(today, -(HEATMAP_WEEKS * 7 + 7)));
    const days = dailyStats(localTasks, localComps, fromKey, todayKey);
    const todayStat = days[days.length - 1];
    const month = inMonth(days, monthKey(today));

    return {
      todayKey,
      days,
      trend: days.slice(-TREND_DAYS),
      todayStat,
      streak: currentStreak(days, todayKey),
      monthAvg: averageRatio(month),
      monthPerfect: perfectDays(month),
      index: completionIndex(localComps),
    };
  }, [today, todayKey, localTasks, localComps]);

  function handleToggle(task: Task, next: boolean) {
    if (!today) return;
    bumpChanges();
    const key = periodKey(task.cadence, today);
    const dayKey = toDayKey(today);

    setLocalComps((prev) =>
      next
        ? [
            ...prev,
            {
              id: `${OPTIMISTIC}${task.id}-${key}`,
              task_id: task.id,
              period_key: key,
              completed_on: dayKey,
            },
          ]
        : prev.filter((c) => !(c.task_id === task.id && c.period_key === key)),
    );

    startTransition(async () => {
      try {
        const res = await setDone(task.id, key, dayKey, next);
        if (res.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function handleAdd(cadence: Cadence, title: string, goalId: string | null) {
    if (!TAB_BY_CADENCE.has(cadence)) return;
    bumpChanges();

    // Shown immediately under a temporary id; its checkbox stays disabled until
    // the real row arrives, since a completion needs a real task id.
    const optimistic: Task = {
      id: `${OPTIMISTIC}${cadence}-${localTasks.length}-${title}`,
      title,
      cadence,
      goal_id: goalId,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    setLocalTasks((prev) => [...prev, optimistic]);

    startTransition(async () => {
      try {
        const res = await addTask(cadence, title, goalId);
        if (res.error) {
          setError(res.error);
          setLocalTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
        setLocalTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
      }
    });
  }

  function handleAddGoal(title: string) {
    bumpChanges();
    const optimistic: Goal = {
      id: `${OPTIMISTIC}goal-${localGoals.length}-${title}`,
      title,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    setLocalGoals((prev) => [...prev, optimistic]);

    startTransition(async () => {
      try {
        const res = await addGoal(title);
        if (res.error) {
          setError(res.error);
          setLocalGoals((prev) => prev.filter((g) => g.id !== optimistic.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that goal.");
        setLocalGoals((prev) => prev.filter((g) => g.id !== optimistic.id));
      }
    });
  }

  function handleRemoveGoal(goalId: string) {
    bumpChanges();
    setLocalGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (goalId.startsWith(OPTIMISTIC)) return;

    startTransition(async () => {
      try {
        const res = await removeGoal(goalId);
        if (res.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove that goal.");
      }
    });
  }

  function handleRemove(task: Task) {
    bumpChanges();
    setLocalTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (task.id.startsWith(OPTIMISTIC)) return;

    startTransition(async () => {
      try {
        const res = await removeTask(task.id);
        if (res.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove that.");
      }
    });
  }

  const answer = stats
    ? verdict(stats.todayStat.done, stats.todayStat.total)
    : null;

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 pb-24 pt-5 sm:px-8">
      <header className="flex items-center gap-2.5">
        <Logo className="size-[19px] text-foreground" />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">
          dydit
        </span>
        <span className="ml-auto hidden text-[13px] text-faint sm:block">
          {today ? formatDayLong(today) : ""}
        </span>
        <div className="ml-auto flex items-center gap-1 sm:ml-3">
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title={`Signed in as ${email}`}
              className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* The page answers its own name. */}
      <section className="mt-9">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]">
          {answer ? answer.title : <span className="opacity-0">Not yet.</span>}
        </h1>
        <p className="mt-1 text-[14.5px] text-muted-foreground">
          {answer ? answer.sub : " "}
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 underline underline-offset-2 opacity-80"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="mt-7 space-y-3">
        {stats ? (
          <StatStrip
            stats={[
              {
                label: "Today",
                value:
                  stats.todayStat.total === 0
                    ? "—"
                    : `${stats.todayStat.done}/${stats.todayStat.total}`,
                hint: "daily tasks",
              },
              {
                label: "Streak",
                value: `${stats.streak}`,
                hint: stats.streak === 1 ? "perfect day" : "perfect days",
              },
              {
                label: "This month",
                value:
                  stats.monthAvg === null
                    ? "—"
                    : `${Math.round(stats.monthAvg * 100)}%`,
                hint: "average completion",
              },
              {
                label: "Perfect days",
                value: `${stats.monthPerfect}`,
                hint: "this month",
              },
            ]}
          />
        ) : (
          <div className="h-[86px] animate-pulse rounded-lg border border-border bg-muted/40" />
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Last 12 months
          </h2>
          {stats ? (
            <Heatmap
              days={stats.days}
              todayKey={stats.todayKey}
              weeks={HEATMAP_WEEKS}
            />
          ) : (
            <div className="h-[120px] animate-pulse rounded bg-muted/40" />
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Today
            </h2>
            {stats ? (
              <TodayDonut
                done={stats.todayStat.done}
                total={stats.todayStat.total}
                animate={changes > 0}
              />
            ) : (
              <div className="mx-auto mt-2 size-[168px] animate-pulse rounded-full bg-muted/40" />
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Daily completion &middot; last {TREND_DAYS} days
            </h2>
            {stats ? (
              <TrendChart days={stats.trend} animate={changes > 0} />
            ) : (
              <div className="h-[168px] animate-pulse rounded bg-muted/40" />
            )}
          </div>
        </div>
      </section>

      <section className="mt-3">
        {stats ? (
          <GoalBars
            progress={goalRows}
            windowDays={GOAL_WINDOW_DAYS}
            onAdd={handleAddGoal}
            onRemove={handleRemoveGoal}
          />
        ) : (
          <div className="h-[92px] animate-pulse rounded-lg border border-border bg-muted/40" />
        )}
      </section>

      <section className="mt-8">
        {(() => {
          const lists = TABS.map((tab) => {
            const tasks = liveTasks.filter((t) => t.cadence === tab.cadence);
            const key = today ? periodKey(tab.cadence, today) : null;
            const done =
              stats && key
                ? tasks.filter((t) => isDone(stats.index, t.id, key)).length
                : 0;
            return { tab, tasks, key, done };
          });

          const meta: TabMeta[] = lists.map(({ tab, tasks, done }) => ({
            key: tab.cadence,
            label: tab.label,
            resets: tab.resets,
            done,
            total: tasks.length,
          }));

          const panels = lists.map(({ tab, tasks, key }) => (
            <div key={tab.cadence} className="px-1">
              {tasks.length === 0 ? (
                <p className="px-2 py-2 text-[13px] text-faint">{tab.blurb}</p>
              ) : (
                tasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    index={i}
                    title={task.title}
                    done={stats && key ? isDone(stats.index, task.id, key) : false}
                    goalTitle={task.goal_id ? goalTitles.get(task.goal_id) : null}
                    pending={!today || task.id.startsWith(OPTIMISTIC)}
                    onToggle={(next) => handleToggle(task, next)}
                    onRemove={() => handleRemove(task)}
                  />
                ))
              )}
              <AddTask
                goals={liveGoals}
                onAdd={(title, goalId) => handleAdd(tab.cadence, title, goalId)}
                placeholder={`Add to ${tab.label.toLowerCase()}`}
              />
            </div>
          ));

          return <TaskTabs tabs={meta} panels={panels} />;
        })()}
      </section>
    </div>
  );
}
