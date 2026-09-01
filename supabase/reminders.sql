-- DYDIT reminders.  Paste this into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is guarded.
--
-- This is the whole scheduler.  Postgres works out who is behind, and posts the
-- finished list to /api/reminders, which does nothing but sign and send.
--
-- The reason it lives here rather than in the app: deciding who to remind means
-- reading across every account.  From outside the database that needs the
-- service role key, which bypasses every RLS policy in the project.  Inside the
-- database it needs no key at all, so the credential never has to exist in a
-- deployment environment where it could leak.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- The token Postgres presents to the endpoint.
--
-- Generated here and stored encrypted, so the only copy lives in this database.
-- The deployment gets the SHA-256 of it instead: the endpoint compares hashes,
-- so the token itself never has to be pasted into an environment variable, a
-- terminal, or a chat window.  Two UUIDs give 256 bits without needing pgcrypto.
-- ---------------------------------------------------------------------------
select vault.create_secret(
         replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         'dydit_cron_secret',
         'Bearer token presented to /api/reminders'
       )
where not exists (select 1 from vault.secrets where name = 'dydit_cron_secret');

-- ---------------------------------------------------------------------------
-- due_reminders — who is behind, right now, on their own clock
--
-- Mirrors lib/periods.ts.  A daily task's period key is the calendar day and a
-- weekly task's is the ISO week, and a day begins at day_start_hour rather than
-- at midnight, so a tick at 1am counts for the night before.
--
-- The to-do list is deliberately absent: a one-off has no deadline, and
-- nagging about it forever is how notifications get muted.
-- ---------------------------------------------------------------------------
create or replace function public.due_reminders()
returns table (
  subscription_id uuid,
  endpoint        text,
  p256dh          text,
  auth            text,
  period_key      text,
  body            text
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select
      s.user_id,
      -- The day this moment counts for, on their wall clock.
      ((now() at time zone s.timezone)
        - make_interval(hours => s.day_start_hour))::date as logical_day
    from settings s
    where s.remind_enabled
      and s.timezone is not null
      and s.remind_hour is not null
      and extract(hour from (now() at time zone s.timezone))::int = s.remind_hour
  ),
  keys as (
    select
      d.user_id,
      to_char(d.logical_day, 'YYYY-MM-DD')   as day_key,
      to_char(d.logical_day, 'IYYY-"W"IW')   as week_key
    from due d
  ),
  outstanding as (
    select
      k.user_id,
      k.day_key,
      count(*) filter (
        where t.cadence = 'daily'
          and not exists (
            select 1 from completions c
            where c.task_id = t.id and c.period_key = k.day_key
          )
      ) as open_daily,
      count(*) filter (
        where t.cadence = 'weekly'
          and not exists (
            select 1 from completions c
            where c.task_id = t.id and c.period_key = k.week_key
          )
      ) as open_weekly
    from keys k
    join tasks t on t.user_id = k.user_id
    where t.archived_at is null
      and t.cadence in ('daily', 'weekly')
    group by k.user_id, k.day_key
  )
  select
    p.id,
    p.endpoint,
    p.p256dh,
    p.auth,
    o.day_key,
    concat_ws(
      ' and ',
      case when o.open_daily  > 0 then o.open_daily  || ' daily'  end,
      case when o.open_weekly > 0 then o.open_weekly || ' weekly' end
    ) || ' still waiting.'
  from outstanding o
  join push_subscriptions p on p.user_id = o.user_id
  where (o.open_daily > 0 or o.open_weekly > 0)
    -- One reminder per period, however many times the hour is checked.
    and p.last_notified_key is distinct from o.day_key;
$$;

-- ---------------------------------------------------------------------------
-- send_reminders — what the schedule actually calls
-- ---------------------------------------------------------------------------
create or replace function public.send_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  token   text;
begin
  select jsonb_agg(to_jsonb(d)) into payload from public.due_reminders() d;
  if payload is null then return; end if;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'dydit_cron_secret';

  perform net.http_post(
    url     := 'https://dydit.vercel.app/api/reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || token
               ),
    body    := jsonb_build_object('reminders', payload)
  );

  /*
   * Marked as sent before the push is known to have arrived, because the
   * endpoint holds no database credentials and cannot report back. This fails
   * towards silence: a push that dies in transit costs one missed reminder.
   * Marking afterwards would fail the other way and re-send every hour until
   * something worked, which is how people learn to turn notifications off.
   */
  update push_subscriptions p
  set last_notified_key = d.period_key
  from jsonb_to_recordset(payload)
    as d(subscription_id uuid, period_key text)
  where p.id = d.subscription_id;
end;
$$;

-- Both functions read every account's rows by design, so nothing that reaches
-- the database through PostgREST may call them. Only the owner, which is what
-- the scheduled job runs as.
revoke all on function public.due_reminders()  from public, anon, authenticated;
revoke all on function public.send_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The schedule.  Hourly, because the hour that matters is a local one and
-- everybody's differs; the function itself decides whether this is the hour.
-- ---------------------------------------------------------------------------
select cron.unschedule('dydit-reminders')
where exists (select 1 from cron.job where jobname = 'dydit-reminders');

select cron.schedule(
  'dydit-reminders',
  '7 * * * *',
  $job$ select public.send_reminders() $job$
);

-- ---------------------------------------------------------------------------
-- Finally: the value to set as CRON_SECRET_SHA256 in the deployment.
-- It is a hash, so it is safe to copy anywhere.
-- ---------------------------------------------------------------------------
select encode(sha256(decrypted_secret::bytea), 'hex') as cron_secret_sha256
from vault.decrypted_secrets
where name = 'dydit_cron_secret';
