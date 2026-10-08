import posthog from "posthog-js";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// No key configured: analytics is skipped and nothing else changes.
export function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break the game.
  }
}

// Turns an id into part of an event name: "mall-night" -> "mall_night".
export function eventPart(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
