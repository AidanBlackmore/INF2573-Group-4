// Reports each portrait drawing to PostHog AI observability as an `$ai_generation`, so the
// Evaluations tab in PostHog can score it (an LLM judge looks at the picture and the prompt).
// Server only: called from app/api/portrait/route.ts after the response has gone back to the
// phone, so it never slows a player down. Skipped without a PostHog key, and it never throws.
//
// What it sends: the full prompt (the fixed style text plus the player's own description,
// already checked against the word list), the picture Cloudflare drew, how long it took, and
// any error. That's the only place a player's words reach PostHog; see "Analytics" in the README.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// PostHog drops events over 1 MB. A FLUX picture is usually 100 to 300 KB as base64.
const MAX_IMAGE = 700_000;

export type PortraitRun = {
  roomId: string;
  model: string;
  promptVersion: string;
  prompt: string;
  steps: number;
  ms: number;
  status?: number;
  image?: string; // a data: URL
  error?: string;
};

export async function reportPortrait(run: PortraitRun) {
  if (!KEY) return;
  const tooBig = !!run.image && run.image.length > MAX_IMAGE;
  const output = run.image && !tooBig
    ? [{ role: "assistant", content: [{ type: "image", image: run.image }] }]
    : [{ role: "assistant", content: run.error ?? (tooBig ? "(picture too large to attach)" : "") }];
  try {
    await fetch(`${HOST.replace(/\/$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event: "$ai_generation",
        distinct_id: `room-${run.roomId}`,
        properties: {
          $process_person_profile: false,
          $ai_trace_id: crypto.randomUUID(),
          $ai_session_id: null,
          $ai_span_name: "portrait",
          $ai_provider: "cloudflare-workers-ai",
          $ai_model: run.model,
          $ai_input: [{ role: "user", content: run.prompt }],
          $ai_output_choices: output,
          $ai_latency: run.ms / 1000,
          $ai_http_status: run.status,
          $ai_is_error: !!run.error,
          $ai_error: run.error,
          $ai_total_cost_usd: 0, // Workers AI free plan
          prompt_version: run.promptVersion,
          steps: run.steps,
          room_id: run.roomId,
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    console.warn("portrait: couldn't report to PostHog", e);
  }
}
