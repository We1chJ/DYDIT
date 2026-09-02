"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  addGoal,
  addTask,
  moveTask,
  removeGoal,
  removeTask,
  renameGoal,
  removePushSubscription,
  saveDayStart,
  savePushSubscription,
  saveReminder,
  renameTask,
  setDone,
  setTaskGoal,
} from "@/app/actions";
import { AddTask } from "@/components/add-task";
import { GoalRows } from "@/components/goal-rows";
import { Heatmap } from "@/components/heatmap";
import { Logo } from "@/components/logo";
import { ReminderToggle } from "@/components/reminder-toggle";
import { SortableList } from "@/components/sortable-list";
import { StatStrip } from "@/components/stat-strip";
import { TaskRow } from "@/components/task-row";
import { TaskTabs, type TabMeta } from "@/components/task-tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { TodayDonut } from "@/components/today-donut";
import { TimeCurve } from "@/components/time-curve";
import { TrendChart } from "@/components/trend-chart";
import { compareTasks, orderForMove, sortOrderBetween } from "@/lib/order";
import {
  addDays,
  formatClock,
  formatDayLong,
  fromDayKey,
  logicalDayKey,
  minuteOfDay,
  monthKey,
  periodKey,
  toDayKey,
} from "@/lib/periods";
import {
  averageRatio,
  busiestHour,
  completionIndex,
  currentStreak,
  dailyStats,
  goalStats,
  inMonth,
  isDone,
  perfectDays,
  taskMinutes,
  timeOfDay,
} from "@/lib/stats";
import {
  ONCE,
  TABS,
  TAB_BY_CADENCE,
  type Cadence,
  type Completion,
  type Goal,
  type Settings,
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
  settings: Settings;
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
  settings,
  email,
}: DashboardProps) {
  // Mirrored so the change shows the instant it is picked, like everything else.
  const [dayStartHour, setDayStartHour] = useState(settings.day_start_hour);
  const [seenHour, setSeenHour] = useState(settings.day_start_hour);
  if (seenHour !== settings.day_start_hour) {
    setSeenHour(settings.day_start_hour);
    setDayStartHour(settings.day_start_hour);
  }
  /*
   * The current day is null until mount on purpose.
   *
   * Every period key depends on the viewer's local calendar day, which the
   * server cannot know. Deriving it during SSR would render a task unticked at
   * 7pm simply because the server had already rolled over. So the shell renders
   * immediately and anything date-dependent waits one frame for the browser.
   */
  const readToday = useCallback(
    () => logicalDayKey(new Date(), dayStartHour),
    [dayStartHour],
  );
  const todayKey = useSyncExternalStore(subscribeToClock, readToday, () => null);
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
   * Coming back to the tab re-reads the database before anything else happens.
   *
   * The same list is open on more than one machine, so what is on screen here
   * drifts the moment it is edited somewhere else. Returning to a tab is
   * exactly when that matters: it is when you are about to act on what you see,
   * and it is when the local copy has had the longest to go stale.
   *
   * The correction is allowed to be visible — rows can jump as the truth lands
   * — because a list that quietly disagrees with the database is worse than one
   * that visibly fixes itself.
   *
   * The read does not block anything. Freezing the page for it made every
   * return to the tab cost a visible pause, which is a poor trade for the rare
   * edit made in the few hundred milliseconds a refresh takes. A tick made
   * mid-read can be overwritten by the arriving data, but the write is already
   * on its way and revalidates on arrival, so the two converge — the cost is a
   * flicker rather than a lost tick.
   *
   * This is not a live subscription: it answers "is what I am looking at true?",
   * not "tell me the instant anything changes".
   */
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const lastSync = useRef(0);

  useEffect(() => {
    function resync() {
      if (document.visibilityState !== "visible") return;
      // Alt-tabbing through windows fires both listeners, repeatedly, and a
      // list that was true ten seconds ago is still true enough to act on.
      if (Date.now() - lastSync.current < 10_000) return;
      lastSync.current = Date.now();
      startSync(() => router.refresh());
    }

    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [router]);

  /*
   * Counts user-driven changes. The charts render statically for the first
   * paint and animate every change after it — motion belongs to the moment
   * something actually moved, and Recharts animates via requestAnimationFrame,
   * which a hidden tab suspends. Animating on mount leaves the charts drawing
   * no geometry at all until the tab is looked at. Verified, not theoretical.
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

  const goalRows = useMemo(() => {
    if (!today) return [];
    return goalStats(localGoals, localTasks, localComps, today, dayStartHour);
  }, [localGoals, localTasks, localComps, today, dayStartHour]);

  const stats = useMemo(() => {
    if (!today || !todayKey) return null;
    // A week of slack so the heatmap's first (Monday-aligned) column is covered.
    const fromKey = toDayKey(addDays(today, -(HEATMAP_WEEKS * 7 + 7)));
    const days = dailyStats(localTasks, localComps, fromKey, todayKey, dayStartHour);
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
      hours: timeOfDay(localComps),
    };
  }, [today, todayKey, localTasks, localComps, dayStartHour]);

  function handleToggle(task: Task, next: boolean) {
    if (!today) return;
    bumpChanges();
    const key = periodKey(task.cadence, today);
    const dayKey = toDayKey(today);
    // The wall-clock minute has to come from the browser for the same reason
    // the day key does — the server's clock is not standing where you are.
    const minute = minuteOfDay(new Date());

    setLocalComps((prev) =>
      next
        ? [
            ...prev,
            {
              id: `${OPTIMISTIC}${task.id}-${key}`,
              task_id: task.id,
              period_key: key,
              completed_on: dayKey,
              completed_minute: minute,
            },
          ]
        : prev.filter((c) => !(c.task_id === task.id && c.period_key === key)),
    );

    startTransition(async () => {
      try {
        const res = await setDone(task.id, key, dayKey, minute, next);
        if (res.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function handleAdd(cadence: Cadence, title: string, goalId: string | null) {
    if (!TAB_BY_CADENCE.has(cadence)) return;
    bumpChanges();

    // A new task lands at the foot of its own list, which the browser can work
    // out from what is already on screen without asking the server first.
    const last = localTasks.filter((t) => t.cadence === cadence).at(-1);
    const order = sortOrderBetween(last?.sort_order ?? null, null);

    // Shown immediately under a temporary id; its checkbox stays disabled until
    // the real row arrives, since a completion needs a real task id.
    const optimistic: Task = {
      id: `${OPTIMISTIC}${cadence}-${localTasks.length}-${title}`,
      title,
      cadence,
      goal_id: goalId,
      sort_order: order,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    setLocalTasks((prev) => [...prev, optimistic]);

    startTransition(async () => {
      try {
        const res = await addTask(cadence, title, goalId, order);
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

  /**
   * Moves where the day is cut. The timezone rides along because this is the
   * one moment we are certainly in the browser and can read it for free.
   */
  function handleDayStart(hour: number) {
    bumpChanges();
    const previous = dayStartHour;
    setDayStartHour(hour);

    startTransition(async () => {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
        const res = await saveDayStart(hour, zone);
        if (res.error) {
          setError(res.error);
          setDayStartHour(previous);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
        setDayStartHour(previous);
      }
    });
  }

  const [remindHour, setRemindHour] = useState(settings.remind_hour ?? 21);

  function zone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  }

  /** Reports an action's error without swallowing it into the console. */
  async function run(work: () => Promise<{ error?: string }>) {
    try {
      const res = await work();
      if (res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  function handleRenameGoal(goalId: string, title: string) {
    bumpChanges();
    const previous = localGoals.find((g) => g.id === goalId)?.title ?? title;
    const setTitle = (t: string) =>
      setLocalGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, title: t } : g)),
      );
    setTitle(title);
    if (goalId.startsWith(OPTIMISTIC)) return;

    startTransition(async () => {
      try {
        const res = await renameGoal(goalId, title);
        if (res.error) {
          setError(res.error);
          setTitle(previous);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't rename that goal.");
        setTitle(previous);
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

  /**
   * Drops a task at a new place in its list.
   *
   * `list` is the single list on screen, already filtered by cadence, because
   * that is what the drop index counts against. Only the moved row is written:
   * its new sort_order is the midpoint of the two it landed between.
   */
  function handleMove(list: Task[], id: string, to: number) {
    const from = list.findIndex((t) => t.id === id);
    if (from === -1 || from === to) return;
    bumpChanges();

    const previous = list[from].sort_order;
    const order = orderForMove(list, from, to);

    // Re-sorted rather than spliced, so the local mirror ends up in exactly the
    // order the server will send back — otherwise the row jumps once on save.
    const place = (value: number | null) =>
      setLocalTasks((prev) =>
        prev
          .map((t) => (t.id === id ? { ...t, sort_order: value } : t))
          .sort(compareTasks),
      );

    place(order);

    startTransition(async () => {
      try {
        const res = await moveTask(id, order);
        if (res.error) {
          setError(res.error);
          place(previous);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't move that.");
        place(previous);
      }
    });
  }

  function handleRename(task: Task, title: string) {
    bumpChanges();
    const previous = task.title;
    const setTitle = (t: string) =>
      setLocalTasks((prev) =>
        prev.map((x) => (x.id === task.id ? { ...x, title: t } : x)),
      );
    setTitle(title);

    startTransition(async () => {
      try {
        const res = await renameTask(task.id, title);
        if (res.error) {
          setError(res.error);
          setTitle(previous);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't rename that.");
        setTitle(previous);
      }
    });
  }

  /**
   * Re-links an existing task. Nothing about its completions changes, so the
   * goal bars redraw from history the moment the edge moves.
   */
  function handleSetGoal(task: Task, goalId: string | null) {
    bumpChanges();
    const relink = (id: string | null) =>
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, goal_id: id } : t)),
      );

    const previous = task.goal_id;
    relink(goalId);

    startTransition(async () => {
      try {
        const res = await setTaskGoal(task.id, goalId);
        if (res.error) {
          setError(res.error);
          relink(previous);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change that link.");
        relink(previous);
      }
    });
  }

  const answer = stats
    ? verdict(stats.todayStat.done, stats.todayStat.total)
    : null;

  return (
    <>
      {syncing ? (
        <div
          role="status"
          aria-label="Syncing with the server"
          className="fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden"
        >
          <div className="anim-sync h-full w-1/4 bg-primary" />
        </div>
      ) : null}

    <div
      aria-busy={syncing}
      className="mx-auto w-full max-w-[860px] px-5 pb-24 pt-5 sm:px-8"
    >
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

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Time of day
            </h2>
            {/*
              The headline reading, in words. The curve shows the shape; this
              says the one number you would otherwise squint for.
            */}
            <span className="text-[11.5px] text-faint">
              {stats && busiestHour(stats.hours) !== null
                ? `most often around ${formatClock(busiestHour(stats.hours)! * 60)}`
                : "no timed ticks yet"}
            </span>
          </div>
          {stats ? (
            <TimeCurve hours={stats.hours} animate={changes > 0} />
          ) : (
            <div className="h-[168px] animate-pulse rounded bg-muted/40" />
          )}
        </div>
      </section>

      <section className="mt-3">
        {stats ? (
          <GoalRows
            stats={goalRows}
            onAdd={handleAddGoal}
            onRename={handleRenameGoal}
            onRemove={handleRemoveGoal}
          />
        ) : (
          <div className="h-[92px] animate-pulse rounded-lg border border-border bg-muted/40" />
        )}
      </section>

      <section className="mt-8">
        {(() => {
          // Rows are identical wherever they appear; only the period key that
          // decides "done" differs between the lists.
          const rows = (list: Task[], key: string | null) => (
            <SortableList
              items={list}
              getId={(task) => task.id}
              getLabel={(task) => task.title}
              // A row that only exists locally has no id the server could move.
              isLocked={(task) => task.id.startsWith(OPTIMISTIC)}
              onMove={(id, to) => handleMove(list, id, to)}
            >
              {(task, { index, handle, dragging }) => (
                <TaskRow
                  index={index}
                  title={task.title}
                  done={stats && key ? isDone(stats.index, task.id, key) : false}
                  goals={liveGoals}
                  goalId={task.goal_id}
                  minutes={taskMinutes(localComps, task.id)}
                  pending={!today || task.id.startsWith(OPTIMISTIC)}
                  handle={handle}
                  dragging={dragging}
                  onToggle={(next) => handleToggle(task, next)}
                  onRename={(next) => handleRename(task, next)}
                  onSetGoal={(goalId) => handleSetGoal(task, goalId)}
                  onRemove={() => handleRemove(task)}
                />
              )}
            </SortableList>
          );

          const onceTasks = liveTasks.filter((t) => t.cadence === "once");
          const onceDone = stats
            ? onceTasks.filter((t) => isDone(stats.index, t.id, "once")).length
            : 0;

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
            resets:
              tab.cadence === "daily"
                ? `resets ${formatClock(dayStartHour * 60)}`
                : tab.resets,
            done,
            total: tasks.length,
          }));

          const panels = lists.map(({ tab, tasks, key }) => (
            <div key={tab.cadence} className="px-1">
              {tasks.length === 0 ? (
                <p className="py-2 pl-8 pr-2 text-[13px] text-faint">{tab.blurb}</p>
              ) : (
                rows(tasks, key)
              )}
              <AddTask
                goals={liveGoals}
                onAdd={(title, goalId) => handleAdd(tab.cadence, title, goalId)}
                placeholder={`Add to ${tab.label.toLowerCase()}`}
              />
            </div>
          ));

          return (
            <>
              {/*
                Its own card rather than a third tab, so what came up today is
                readable at the same time as the recurring lists instead of
                taking their place.
              */}
              <div className="mb-6 rounded-lg border border-border bg-card p-4">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {ONCE.label}
                  </h2>
                  <span className="tnum text-[11.5px] text-faint">
                    {onceTasks.length === 0
                      ? ONCE.resets
                      : `${onceDone}/${onceTasks.length} · ${ONCE.resets}`}
                  </span>
                </div>

                {/* Pulled back so the checkboxes line up with the heading. */}
                <div className="-mx-2">
                  {onceTasks.length === 0 ? (
                    <p className="py-1 pl-8 pr-2 text-[13px] text-faint">
                      {ONCE.blurb}
                    </p>
                  ) : (
                    rows(onceTasks, "once")
                  )}
                  <AddTask
                    goals={liveGoals}
                    onAdd={(title, goalId) => handleAdd("once", title, goalId)}
                    placeholder="Something that came up"
                  />
                </div>
              </div>

              <TaskTabs tabs={meta} panels={panels} />
            </>
          );
        })()}
      </section>

      {/*
        The one setting there is. It lives at the foot rather than behind a gear
        because there is exactly one of it, and hiding a single control behind a
        screen of its own costs more than it saves.
      */}
      <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-faint">
        <label htmlFor="day-start">My day starts at</label>
        <select
          id="day-start"
          value={dayStartHour}
          onChange={(e) => handleDayStart(Number(e.target.value))}
          className="rounded-md border border-border bg-card px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {formatClock(h * 60)}
            </option>
          ))}
        </select>
        <span>— anything ticked before then counts for the night before</span>
      </footer>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-faint">
        <ReminderToggle
          enabled={settings.remind_enabled}
          hour={remindHour}
          onSetHour={(h) => {
            setRemindHour(h);
            startTransition(() => {
              void run(() => saveReminder(true, h, zone()));
            });
          }}
          onSubscribe={async (sub) => {
            await run(() => savePushSubscription(sub));
            await run(() => saveReminder(true, remindHour, zone()));
          }}
          onUnsubscribe={async (endpoint) => {
            await run(() => removePushSubscription(endpoint));
            await run(() => saveReminder(false, remindHour, zone()));
          }}
          onError={setError}
        />
      </div>
    </div>
    </>
  );
}
