import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnvOrNull } from "./env";

const PUBLIC_PATHS = [
  "/login",
  "/auth",
  /*
   * The reminder endpoint is called by the scheduler, which has no session and
   * never will. Left out of this list it is redirected to /login before it ever
   * runs, which is a redirect the caller reads as success — the route carries
   * its own bearer-token check, which is the guard that actually fits a caller
   * that is a machine rather than a person.
   */
  "/api/reminders",
  // The design harness at /preview needs no session, and 404s in production.
  ...(process.env.NODE_ENV === "production" ? [] : ["/preview"]),
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  /*
   * With no credentials there is no session to refresh and nothing to protect —
   * every page will render its own setup instructions. Guarding here would only
   * turn that into a 500 on the very first run.
   */
  const env = supabaseEnvOrNull();
  if (!env) return response;
  const { url, key } = env;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not put anything between createServerClient and getUser(). Anything that
  // touches cookies in between desynchronises the browser and the server, which
  // shows up as random logouts that are very hard to trace.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    return NextResponse.redirect(target);
  }

  if (user && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    return NextResponse.redirect(target);
  }

  // Must be returned as-is so the refreshed auth cookies reach the browser.
  return response;
}
