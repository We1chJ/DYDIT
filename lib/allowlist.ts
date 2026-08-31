/**
 * Who is allowed to use this instance.
 *
 * The real lock is in Supabase — with "Allow new users to sign up" turned off,
 * no new account can be created in the first place, and RLS scopes every row to
 * its owner regardless. This is the second lock: if that switch is ever flipped
 * back on, an account that manages to exist still cannot reach the app.
 *
 * Set ALLOWED_EMAILS to a comma-separated list. It is deliberately *not* a
 * NEXT_PUBLIC_ variable, which is what keeps the list out of the browser
 * bundle — so this must only ever be called from server code, where the
 * variable actually has a value.
 *
 * Left unset, everyone signed in is allowed. That keeps a fresh clone working
 * out of the box rather than locking its owner out of their own install — the
 * account gate above is what makes that safe.
 */
export function isAllowed(email: string | null | undefined): boolean {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return true;
  if (!email) return false;

  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.toLowerCase());
}
