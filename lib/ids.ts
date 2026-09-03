/**
 * A row's id, made in the browser.
 *
 * The database can generate these perfectly well — `default gen_random_uuid()`
 * is still on every table, and any other caller can go on relying on it. The
 * reason to make one here is that an optimistically rendered row needs an
 * identity *before* the insert returns, and inventing a placeholder means
 * swapping it for the real one a second later. React keys on that id, so the
 * swap destroys the row and builds a new one, which replays its entrance
 * animation and reads as a flicker.
 *
 * Deciding the id up front removes the swap entirely. It is the same version-4
 * UUID with the same 122 random bits either way; only the machine rolling the
 * dice changes. The primary key remains the backstop: a duplicate is rejected
 * outright rather than overwriting anything.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  /*
   * randomUUID needs a secure context, and `next dev` advertises a plain-http
   * LAN address that is otherwise perfectly usable. getRandomValues has no such
   * requirement, so the fallback is the same entropy laid out by hand.
   */
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
