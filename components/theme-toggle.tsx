"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

/*
 * The theme lives on <html> as a class, put there before first paint by the
 * inline script in app/layout.tsx. That class is the source of truth, so this
 * button subscribes to it rather than keeping a second copy in React state.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/** Follows the system until you touch it, then stays where you put it. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("dydit-theme", next ? "dark" : "light");
    } catch {
      // Storage blocked — the toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {dark ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
    </button>
  );
}
