-- DYDIT schema.  Paste this into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is guarded.
--
-- NOTE: `create table if not exists` will NOT alter a table that already
-- exists.  If you ran an earlier version of this file, drop the tables first
-- and re-run:
--     drop table if exists public.completions, public.tasks, public.goals;

-- ---------------------------------------------------------------------------
-- goals — the long-term things daily and weekly tasks feed into
--
-- A goal is not itself checkable.  Its progress is derived entirely from the
-- tasks that point at it, so "Learn Japanese" advances because you did the Anki
-- reps, not because anyone ticked the goal.
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 200),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — the templates you edit
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 500),
  -- Cadence is also the list a task appears in, and how often it resets.
  -- 'once' never resets: it is ticked one time and stays ticked.
  cadence     text not null check (cadence in ('daily','weekly','once')),
  -- Optional edge to a long-term goal.  Nulled rather than cascaded, so
  -- dropping a goal never takes its tasks (or their history) with it.
  goal_id     uuid references public.goals on delete set null,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- completions — the append-only log every chart reads from
--
-- period_key is what makes recurrence work.  A daily task's key is the calendar
-- day ('2026-08-26') and a weekly task's is the ISO week ('2026-W35').
-- Paired with the unique index below, that means a task can be completed at
-- most once per period, and yesterday's tick never satisfies today.
--
-- completed_on is the local calendar day the box was ticked, stored separately
-- so the heatmap can bucket by day regardless of cadence.
-- ---------------------------------------------------------------------------
create table if not exists public.completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  task_id      uuid not null references public.tasks on delete cascade,
  period_key   text not null,
  completed_on date not null,
  -- Minutes since local midnight (0-1439), computed in the browser like
  -- completed_on is. created_at below is the server's UTC clock, which cannot
  -- tell you what time it was where you were standing.
  completed_minute smallint check (completed_minute between 0 and 1439),
  created_at   timestamptz not null default now(),
  unique (task_id, period_key)
);

create index if not exists tasks_user_cadence_idx
  on public.tasks (user_id, cadence, created_at);
create index if not exists tasks_goal_idx
  on public.tasks (goal_id);
create index if not exists completions_user_day_idx
  on public.completions (user_id, completed_on);

-- ---------------------------------------------------------------------------
-- Row Level Security — the only thing standing between accounts.
-- Without these policies an authenticated user could read every row in the
-- table, so they are not optional even for a single-user app.
-- ---------------------------------------------------------------------------
alter table public.goals       enable row level security;
alter table public.tasks       enable row level security;
alter table public.completions enable row level security;

drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own completions" on public.completions;
create policy "own completions" on public.completions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);



-- ---------------------------------------------------------------------------
-- settings — one row per person
--
-- day_start_hour is when a new day begins for you. Ticking something at 1am
-- after working through the night should count for the night before, not for
-- the day that just started, so the whole app treats "today" as beginning at
-- this hour rather than at midnight.
--
-- timezone is an IANA name captured from the browser. Nothing in the app needs
-- it today, because every date is computed client-side; it is here so that
-- anything running on a schedule later can work out which day it is for you
-- without a browser to ask.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id        uuid primary key references auth.users on delete cascade,
  day_start_hour smallint not null default 3
                   check (day_start_hour between 0 and 23),
  timezone       text,
  updated_at     timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions — one row per browser, not per person
--
-- A push subscription belongs to a browser profile on a machine, so Chrome on
-- the laptop and Chrome on the desktop are two separate rows for the same
-- person. endpoint is the URL the browser vendor gave us to push to, and is
-- unique because re-subscribing the same browser must update the row rather
-- than accumulate duplicates.
--
-- last_notified_key is the period key of the most recent reminder sent to this
-- subscription. It is what stops the scheduler nagging every hour: a reminder
-- is only sent if the current period is not the one already notified.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  endpoint          text not null unique,
  p256dh            text not null,
  auth              text not null,
  -- Free-text, just so the UI can say which machine a row belongs to.
  label             text,
  last_notified_key text,
  created_at        timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reminder preferences live alongside the day boundary.
alter table public.settings
  add column if not exists remind_hour smallint
    check (remind_hour is null or remind_hour between 0 and 23);
alter table public.settings
  add column if not exists remind_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- Upgrades for databases created before these columns existed.
--
-- `create table if not exists` above will not alter a table that is already
-- there, so anything added after the first release has to be repeated here.
-- Both statements are guarded and safe to run repeatedly.
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_cadence_check;
alter table public.tasks add constraint tasks_cadence_check
  check (cadence in ('daily','weekly','once'));

alter table public.completions
  add column if not exists completed_minute smallint;
alter table public.completions drop constraint if exists completions_completed_minute_check;
alter table public.completions add constraint completions_completed_minute_check
  check (completed_minute is null or completed_minute between 0 and 1439);
