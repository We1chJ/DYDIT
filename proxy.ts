import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed middleware.ts to proxy.ts; the contract is otherwise the same.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/mcp is skipped entirely: it has no session to refresh, checks its own
    // secret, and would otherwise be redirected to /login.
    "/((?!_next/static|_next/image|api/mcp|favicon.ico|icon.svg|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
