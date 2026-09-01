# DYDIT — setup and internals

Everything the README used to carry: how to run it, how the recurrence
works, and what each chart measures.

---

## What it does

- **Two recurring lists as swipeable tabs** — Daily and Weekly — one at a time.
  Swipe, drag, arrow-key, or click a tab; the underline tracks the scroll.
- **A To-do list card above them**, for whatever came up. It is a card rather
  than a third tab so it stays readable alongside the recurring lists instead
  of taking their place. Tick it and it stays ticked until you clear it.
- **Checkboxes that reset on their own**, at an hour you choose. The default is
  3am, so working past midnight still counts for the night you were working —
  a task ticked at 1am belongs to the day before. Weekly rolls over on Monday
  at the same hour. The to-do list never resets.
- **Editable in place.** Click a task's text to rename it; Enter commits,
  Escape reverts.
- **Long-term goals as counts.** A goal is never checked off. Link tasks to it
  and it reports the days you actually fed it, out of the days since you
  started.
- **A contribution heatmap** over the last 12 months, shaded by what share of
  that day's daily tasks you finished.
- **Today's donut**, a 30-day completion trend, and a stat strip with your current
  streak and this month's average.
- **A time-of-day curve** — when in the day you actually tick things off. Each
  row also has a clock button on hover showing that one task's times.
- **Linking by number.** Goals are numbered; end a new task's title with `#2`
  and it links to goal 2, dropping the token from the saved title. Clicking a
  task's goal label re-links it afterwards.
- **Desktop reminders.** Web push, so a notification arrives at an hour you
  pick if anything is still outstanding — with the browser closed, on Mac and
  Windows alike. Granted once per browser, since a push subscription belongs to
  a browser profile rather than to an account.
- **Magic-link sign-in**, so the same list follows you between computers.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui on Base
UI · Supabase (Postgres + Auth).

Charts are shadcn's `ChartContainer` / `ChartTooltip` / `ChartTooltipContent`
over Recharts, with colours driven by `ChartConfig` so they follow the light and
dark tokens with no JavaScript. The contribution heatmap is hand-built — shadcn
ships no heatmap primitive — but shares the same tooltip styling.

---

## Setup

### 1. Create a Supabase project

[database.new](https://database.new) → new project. Any region, any name.

### 2. Create the tables

Open the project's **SQL Editor**, paste the whole of
[`supabase/schema.sql`](../supabase/schema.sql), and run it. That creates both
tables, their indexes, and the row-level security policies.

The RLS policies are not optional. Without them any signed-in user could read
every row in the table.

### 3. Point the app at it

```bash
cp .env.local.example .env.local
```

Fill in the two values from **Project Settings → API**:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The browser-safe key — labelled **publishable** on newer projects, **anon public** on older ones. Either works. |

Never put the `service_role` key in here. It bypasses RLS.

### 4. Allow the sign-in redirect

**Authentication → URL Configuration**, add to *Redirect URLs*:

```
http://localhost:3000/**
```

Add your deployed URL there too once you have one.

### 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, enter your email, click the link in your inbox.

> Before you've done the steps above, `/` shows setup instructions instead of
> crashing, and **`/preview`** renders the full interface driven by a year of
> generated data — no database, no sign-in. It's a development-only route and
> 404s in production.

### 6. Lock it to you

Once you're signed in, go to **Authentication → Sign In / Providers** and turn
off **Allow new users to sign up**. Otherwise anyone who finds your deployed URL
can create an account. Their data stays private to them thanks to RLS, but
there's no reason to let them in.

### Optional: sign-in links that work in any browser

Out of the box the magic link uses Supabase's PKCE flow, which only completes in
the browser that requested it — open the link on your phone after requesting it
on your laptop and it fails.

To fix that, go to **Authentication → Email Templates → Magic Link** and replace
the body with:

```html
<h2>Sign in to DYDIT</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
```

That routes to `/auth/confirm`, which verifies the token directly and works from
anywhere. Both routes ship, so this is safe to do at any point — or not at all.

---

## How the recurrence works

Two tables:

**`goals`** are the long-term things. A goal is not itself checkable.

**`tasks`** are the templates you edit. Each has a `cadence`, which is both how
often it resets *and* which of the two tabs it appears in — a list is its reset
rule, so there is no separate `section` column to keep in sync. Each task also
has an optional `goal_id`, the edge that makes it count toward a goal.

**`completions`** is an append-only log. Each row says *this task was completed
for this period*:

| cadence | list | `period_key` |
| --- | --- | --- |
| daily | Daily | `2026-08-26` |
| weekly | Weekly | `2026-W35` (ISO week) |

A unique index on `(task_id, period_key)` is the whole mechanism. Yesterday's
tick is stored under yesterday's key, so it can't satisfy today — which is what
makes the checkbox appear to reset, without any scheduled job.

Unchecking deletes the row. Removing a task **archives** it rather than deleting
it, so last month's perfect days stay perfect. Removing a goal archives it too
and simply unlinks its tasks — it never takes the work with it.

### What a goal reports

Days on which at least one of its linked tasks was ticked, out of the days since
the goal was created. Plus the current run of consecutive such days, when there
is one, and what's due right now.

Counts rather than a percentage, and no bar. A percentage needs a denominator,
and an open-ended goal has none — "learn Japanese" has no total to be a fraction
of, so any bar drawn against it has to invent a finish line and then imply you
are approaching it. Days kept at it is something that can be said honestly.

A day counts if *any* linked task was ticked, whatever its cadence: the question
is whether the goal got attention that day, not whether it got all of it. Ticking
four linked tasks on one day is still one day. An untouched today does not break
a run — it hasn't finished yet — so the streak holds until a day passes with
nothing on it.

### Everything is computed in local time

Period keys are derived in the browser, never on the server. A server in UTC has
already rolled over to tomorrow while it's still 7pm where you are, and a task
you just ticked would render unticked. `lib/periods.ts` does all the date math in
local time and the server stores whatever key the client computed.

The cost is that the charts wait one frame after mount before rendering, which is
why they briefly show a skeleton.

### What the heatmap actually measures

Each cell is the share of that day's **daily** tasks you completed, bucketed into
five levels. Weekly and monthly items are deliberately excluded from the shade —
including them would make Mondays look better than Tuesdays purely because
weeklies reset — but they still show in the cell's tooltip.

A day with no daily tasks at all reads as "no data", not as a zero. Tasks only
count from the day they were created, so adding a task today doesn't retroactively
ruin last week.

---

## Deploying

Live at [dydit.vercel.app](https://dydit.vercel.app), deployed from `main` on
every push.

To stand up your own: push to GitHub, import at
[vercel.com/new](https://vercel.com/new), and add the same two environment
variables there — `.env.local` is gitignored, so the build has no other way to
get them. Then add your production URL to Supabase's Redirect URLs alongside
the localhost one (step 4), or the magic link will refuse to come back.

---

## Project map

```
app/
  page.tsx            auth guard, fetches raw rows
  actions.ts          add / tick / rename / re-link / archive
  login/              magic-link form
  preview/            dev-only design harness with sample data
  auth/confirm/       token_hash verification  (works in any browser)
  auth/callback/      PKCE code exchange       (zero-config fallback)
proxy.ts              session refresh + route guard
lib/
  periods.ts          local-time period keys, ISO weeks, clock formatting
  stats.ts            heatmap buckets, streaks, goal counts, time of day — pure
  supabase/           browser, server, and proxy clients
components/           dashboard, charts, tabs, goal rows, task rows
supabase/schema.sql   tables, indexes, RLS
scripts/stats.test.ts fixture check for the date and streak math
```

`lib/stats.ts` is pure functions over plain arrays, so the awkward parts — streak
edges, archived tasks, ISO week boundaries — are checked without a database:

```bash
npx tsx scripts/stats.test.ts
```

---

## The name

DYDIT — *did you do it today?* The mark is a to-do box with its top-right corner
left open, and the check sweeping out through the gap.

---

## Reminders

Web push. The browser vendor's push service does the delivery — Google's for
Chrome and Edge, Mozilla's for Firefox, Apple's for Safari — so there is no
per-platform code: the same subscription works on macOS and Windows.

`public/sw.js` is the only part of the app that runs with no tab open. A push
wakes it, it draws the notification, it sleeps again.

The scheduling lives in Postgres, not in the app — run `supabase/reminders.sql`
once. `pg_cron` runs hourly; a SQL function asks, for each person with reminders
on, whether it is their chosen hour on their own clock and whether anything is
outstanding for the current period; `pg_net` posts the finished list to
`/api/reminders`, which does nothing but sign and send.

That split exists to keep one credential from existing. Working out who is
behind means reading across every account, which from outside the database needs
the `service_role` key — and that key bypasses every RLS policy in the project.
Inside the database it needs no key at all, so the app never has to hold one.

The token Postgres presents is generated in the database and stored in Vault.
Only its SHA-256 is deployed, as `CRON_SECRET_SHA256`; the endpoint compares
digests, so the token itself never has to be pasted anywhere.

A reminder goes out at most once per period per browser, recorded in
`last_notified_key`. That is marked *before* the push is sent, because the
endpoint holds no database credentials and cannot report back — so a push lost
in transit costs one missed reminder rather than an hourly retry, which is how
people learn to turn notifications off. Endpoints the push service reports as
gone come back in the response as `dead`, but nothing prunes them automatically
any more.

`/api/reminders` is in `PUBLIC_PATHS` in `lib/supabase/proxy.ts`. It has to be:
the scheduler has no session, and without that exemption every call is redirected
to `/login` before the route runs — a redirect the caller reads as success.

The to-do list is deliberately excluded: a one-off has no deadline, and being
nagged about it every evening is how notifications end up muted.

### Environment

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Identifies your server to the push services. Public by design. |
| `VAPID_PRIVATE_KEY` | Signs pushes. Secret. |
| `VAPID_SUBJECT` | A `mailto:` the push services can contact. |
| `CRON_SECRET_SHA256` | SHA-256 of the token Postgres presents. A digest, so it is safe to copy anywhere. `supabase/reminders.sql` prints it. |

Generate the VAPID pair with `npx web-push generate-vapid-keys`. There is no
`SUPABASE_SERVICE_ROLE_KEY` here, and there should not be.
