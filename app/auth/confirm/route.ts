import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Primary magic-link landing point.
 *
 * Verifies a token_hash directly, which means the link works even if you open
 * it in a different browser from the one you requested it in — the PKCE
 * /auth/callback flow cannot, because it needs a code verifier stored in the
 * requesting browser. Requires the one-line email-template change in the README.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
