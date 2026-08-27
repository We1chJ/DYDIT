/*
 * Supabase renamed the browser-safe key from "anon" to "publishable" partway
 * through 2025, and existing projects still show the old name in their
 * dashboard. Accepting both means the setup step works whichever name your
 * project's settings page shows you.
 */
export const NOT_CONFIGURED =
  "Supabase is not configured. Copy .env.local.example to .env.local and " +
  "fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
  "from your project's API settings.";

/** Credentials if present, or null. Lets callers show setup help, not a crash. */
export function supabaseEnvOrNull() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return url && key ? { url, key } : null;
}

export function supabaseEnv() {
  const env = supabaseEnvOrNull();
  if (!env) throw new Error(NOT_CONFIGURED);
  return env;
}
