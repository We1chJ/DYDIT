import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * A client for requests that arrive with no browser session behind them —
 * today, only the MCP endpoint.
 *
 * It holds the secret key, which skips Row Level Security entirely. The
 * per-account wall that RLS gives every other query is therefore gone here,
 * and has to be rebuilt by hand: every query made with this client must filter
 * on `ownerId`. Pinning the schema to dydit at least keeps it out of the other
 * apps that share this Supabase project.
 *
 * Supabase renamed the service-role key to "secret" in 2025, the same way it
 * renamed anon to publishable (see env.ts), so either name is accepted.
 */
export function createOwnerClient() {
  const { url } = supabaseEnv();
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.DYDIT_OWNER_ID;
  if (!key || !ownerId) {
    throw new Error(
      "The MCP endpoint is not configured. Set SUPABASE_SECRET_KEY and " +
        "DYDIT_OWNER_ID — see docs/SETUP.md.",
    );
  }

  const db = createClient(url, key, {
    db: { schema: "dydit" },
    // A secret key is not a session: there is nothing to persist or refresh.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, ownerId };
}
