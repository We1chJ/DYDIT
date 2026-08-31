"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatClock } from "@/lib/periods";

type ReminderToggleProps = {
  enabled: boolean;
  hour: number;
  onSubscribe: (sub: {
    endpoint: string;
    p256dh: string;
    auth: string;
    label: string;
  }) => Promise<void>;
  onUnsubscribe: (endpoint: string) => Promise<void>;
  onSetHour: (hour: number) => void;
  onError: (message: string) => void;
};

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function decodeKey(base64Url: string): BufferSource {
  const padded = base64Url.padEnd(
    base64Url.length + ((4 - (base64Url.length % 4)) % 4),
    "=",
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Built over a plain ArrayBuffer so the type is the one subscribe() wants.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/*
 * Push support can only be answered in a browser, so it is read the same way
 * the dashboard reads the clock: an external store whose server snapshot is
 * null. That keeps "unknown" distinct from "unsupported", which matters —
 * rendering "can't do reminders" during SSR would flash the wrong answer on
 * every load.
 */
const noop = () => () => {};

function readSupport(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** A name for this machine, so the list of subscriptions is readable. */
function describeBrowser(): string {
  const ua = navigator.userAgent;
  const os = /Macintosh|Mac OS/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
      ? "Windows"
      : /Linux/.test(ua)
        ? "Linux"
        : "this device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "browser";
  return `${browser} on ${os}`;
}

/**
 * Switches reminders on for *this* browser.
 *
 * A push subscription belongs to a browser profile on a machine, not to an
 * account, so this has to be done once per machine — which is why the control
 * reports what it thinks the current one is rather than a single global switch.
 */
export function ReminderToggle({
  enabled,
  hour,
  onSubscribe,
  onUnsubscribe,
  onSetHour,
  onError,
}: ReminderToggleProps) {
  const supported = useSyncExternalStore(noop, readSupport, () => null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Whether *this* browser already holds a subscription is genuinely async.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(Boolean(sub));
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        onError(
          permission === "denied"
            ? "Notifications are blocked for this site — allow them in your browser's site settings, then try again."
            : "Notifications weren't allowed.",
        );
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        onError("This deployment has no VAPID public key configured.");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        // Required by every browser: a push must always be visible to you.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key),
      });

      const json = sub.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        onError("The browser returned an incomplete subscription.");
        return;
      }

      await onSubscribe({
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        label: describeBrowser(),
      });
      setSubscribed(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't turn reminders on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await onUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't turn reminders off.");
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <span className="text-faint">
        This browser can&rsquo;t do reminders
      </span>
    );
  }

  return (
    <>
      <span>Remind me at</span>
      <select
        aria-label="Reminder time"
        value={hour}
        onChange={(e) => onSetHour(Number(e.target.value))}
        className="rounded-md border border-border bg-card px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {formatClock(h * 60)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        className="rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-[var(--hover)] hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {busy
          ? "…"
          : subscribed
            ? `on for ${describeBrowser()} — turn off`
            : `turn on for ${describeBrowser()}`}
      </button>
      {enabled && !subscribed ? (
        <span className="text-faint">
          on for another machine, not this one
        </span>
      ) : null}
    </>
  );
}
