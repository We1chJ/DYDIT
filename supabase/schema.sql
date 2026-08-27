-- DYDIT schema.  Paste this into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is guarded.
--
-- NOTE: `create table if not exists` will NOT alter a table that already
-- exists.  If you ran an earlier version of this file (the one with a `section`
-- column), drop both tables first and re-run:
--     drop table if exists public.completions, public.tasks;

-- ---------------------------------------------------------------------------
-- tasks — the templates you edit
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 500),
  -- Cadence is also the list a task appears in: Daily, Weekly, Long-term.
  cadence     text not null check (cadence in ('daily','weekly','once')),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- completions — the append-only log every chart reads from
--
-- period_key is what makes recurrence work.  A daily task's key is the calendar
-- day ('2026-08-26'), a weekly task's is the ISO week ('2026-W35'), and a
-- long-term task's is the literal 'once'.
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
  created_at   timestamptz not null default now(),
  unique (task_id, period_key)
);

create index if not exists tasks_user_cadence_idx
  on public.tasks (user_id, cadence, created_at);
create index if not exists completions_user_day_idx
  on public.completions (user_id, completed_on);

-- ---------------------------------------------------------------------------
-- Row Level Security — the only thing standing between accounts.
-- Without these policies an authenticated user could read every row in the
-- table, so they are not optional even for a single-user app.
-- ---------------------------------------------------------------------------
alter table public.tasks       enable row level security;
alter table public.completions enable row level security;

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
