"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/*
 * localStorage is an external store, so it's read through useSyncExternalStore
 * rather than an effect: no cascading render on mount, correct SSR snapshot,
 * and cross-tab updates come free via the storage event.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A JSON value persisted to localStorage.
 *
 * `fallback` must be a stable reference (a module constant), not an inline
 * literal, or the parsed value changes identity on every render.
 */
export function useStoredJson<T>(key: string, fallback: T) {
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      // Storage blocked (private mode). Behaves as "nothing stored".
      return null;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const value = useMemo<T>(() => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback]);

  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Non-persistent is a fine degradation.
      }
      emit();
    },
    [key],
  );

  return [value, set] as const;
}
