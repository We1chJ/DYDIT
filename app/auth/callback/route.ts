import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Fallback magic-link landing point, for Supabase's default email template.
 *
 * Works with zero dashboard configuration but only in the browser that
 * requested the link, since the PKCE code verifier lives in that browser's
 * cookies. /auth/confirm is the more robust path.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const base =
        process.env.NODE_ENV === "development" || !forwardedHost
          ? origin
          : `https://${forwardedHost}`;
      return NextResponse.redirect(`${base}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
