import posthog from "posthog-js";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Every event says which screen sent it: the shared TV (/ or /host) or a phone (/play, /join).
// Group events (the game itself) come from the TV only, so each is counted once
// per room; phones only send what happens to that one player.
// No key configured: analytics is skipped and nothing else changes.
// `leaving` sends with the browser's beacon, so it still arrives as the tab closes.
export function track(event: string, properties?: Record<string, unknown>, leaving = false) {
  if (!POSTHOG_KEY) return;
  try {
    const screen = /^\/(play|join)(\/|$)/.test(location.pathname) ? "phone" : "tv";
    posthog.capture(event, { screen, ...properties }, leaving ? { transport: "sendBeacon" } : undefined);
  } catch {
    // Analytics must never break the game.
  }
}

// Whole seconds since a moment, for durations.
export const secondsSince = (ms: number) => Math.max(0, Math.round((Date.now() - ms) / 1000));
