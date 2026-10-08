import posthog from "posthog-js";
import { POSTHOG_KEY } from "./lib/analytics";

// PostHog pageviews (including client-side navigation). Skipped without a key.
if (POSTHOG_KEY) {
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      defaults: "2025-05-24",
    });
  } catch {
    // Analytics must never break the game.
  }
}
