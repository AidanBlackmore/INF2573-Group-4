import posthog from "posthog-js";
import type { Universe } from "@/content/universes";

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

// Identifies one act of one universe, shared by every round and vote event so
// they can be joined in PostHog. act_id is stable across games, e.g.
// "mall-night:act_1"; room_id plus play_round pin down one play of that act.
export function actProperties(
  universe: Universe,
  actNumber: number,
  room?: { id: string; round: number },
) {
  const act = universe.acts[actNumber - 1];
  return {
    universe_id: universe.id,
    universe_title: universe.title,
    act_id: `${universe.id}:act_${actNumber}`,
    act_number: actNumber,
    act_title: act?.title,
    act_kind: act?.kind,
    round: actNumber,
    total_rounds: universe.acts.length,
    ...(room ? { room_id: room.id, play_round: room.round } : {}),
  };
}
