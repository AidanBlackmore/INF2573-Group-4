import posthog from "posthog-js";
import { POSTHOG_KEY } from "./lib/analytics";

// PostHog: only pageviews (including client-side navigation) and the events we
// send ourselves with track(). Everything PostHog would capture on its own is
// switched off. Skipped without a key.
if (POSTHOG_KEY) {
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      defaults: "2025-05-24",
      autocapture: false,
      capture_pageleave: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
    });
  } catch {
    // Analytics must never break the game.
  }
}
