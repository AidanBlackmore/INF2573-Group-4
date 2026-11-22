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

// Two layers of events (see the README, Analytics):
// - Game-wide events (`game_started`, `game_ended`, ...) have the same name and the same
//   core properties in every story, so a chart can compare stories with a `story` breakdown.
// - Story events start with the story's prefix (`marlowe_`, `trapped_`) and carry that
//   story's own details (locks, repairs, air...), so each story gets its own charts.
export const STORY_NAMES: Record<string, string> = { marlowe: "Murder at Marlowe Manor", station: "Trapped Below" };
export const storyProps = (story: string | null | undefined) => ({ story: story ?? null, story_name: (story && STORY_NAMES[story]) ?? story ?? null });

// Every story has a group side and a hidden traitor; `winner` says which side won in the same words for all of them.
const WINNERS: Record<string, "group" | "traitor"> = { detectives: "group", murderer: "traitor", crew: "group", saboteur: "traitor" };
export const winnerOf = (outcome: string | null | undefined) => (outcome && WINNERS[outcome]) ?? null;

// Whole seconds since a moment, for durations.
export const secondsSince = (ms: number) => Math.max(0, Math.round((Date.now() - ms) / 1000));
