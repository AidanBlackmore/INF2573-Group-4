import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lookProblem, portraitPrompt, PROMPT_VERSION } from "@/lib/gathering/look";
import { reportPortrait, type PortraitRun } from "@/lib/gathering/observe";

// Draws a player's portrait with FLUX.1 schnell on Cloudflare Workers AI, on its free plan
// (10,000 neurons a day; one portrait is about 58, so roughly 170 a day). Past the free
// allowance Cloudflare just refuses, so this can never cost money; the phone then uses a
// pre-drawn portrait instead (see `fallback` below).
//
// Needs two server-only environment variables in Vercel:
//   CLOUDFLARE_ACCOUNT_ID  the account id from the Cloudflare dashboard
//   CLOUDFLARE_API_TOKEN   an API token with the "Workers AI" permission
//
// The request carries the player's Supabase session, and use_draw() in the database checks
// they're in a room that's still joining and haven't used up their drawings.
//
// Every drawing (or failed attempt) is also reported to PostHog AI observability once the
// response has gone, so the Evaluations tab can score it (lib/gathering/observe.ts).

export const maxDuration = 30;

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const STEPS = 4;
const CLOUDFLARE = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";

// `fallback: true` tells the phone to use a pre-drawn portrait; otherwise it shows the message.
// `left` is how many drawings the player has left, once one has been counted.
const OUT_OF_DRAWINGS = "out of drawings";

const fail = (status: number, error: string, fallback = false, left?: number) => Response.json({ error, fallback, left }, { status });

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let body: { roomId?: unknown; look?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Bad request");
  }
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const look = typeof body.look === "string" ? body.look : "";
  if (!token || !roomId) return fail(401, "Not signed in");
  const problem = lookProblem(look);
  if (problem) return fail(400, problem);

  const account = process.env.CLOUDFLARE_ACCOUNT_ID, key = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !key) return fail(503, "Drawing isn't set up", true);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: left, error } = await db.rpc("use_draw", { p_room_id: roomId });
  // Out of drawings: the phone may not know (it was reloaded), so it gets the closest pre-drawn
  // portrait instead of an error it can't get past.
  if (error) return /last drawing/i.test(error.message) ? fail(429, OUT_OF_DRAWINGS, true, 0) : fail(429, error.message);

  const prompt = portraitPrompt(look);
  const started = performance.now();
  const report = (r: Pick<PortraitRun, "status" | "image" | "error">) => {
    const run = { roomId, model: MODEL, promptVersion: PROMPT_VERSION, prompt, steps: STEPS, ms: Math.round(performance.now() - started), ...r };
    after(() => reportPortrait(run));
  };

  try {
    const res = await fetch(`${CLOUDFLARE}/accounts/${account}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, steps: STEPS }),
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) {
      // 429 or a "free allocation" error once today's allowance is used up.
      const said = (await res.text()).slice(0, 300);
      console.warn("portrait: Workers AI said", res.status, said);
      report({ status: res.status, error: `Workers AI ${res.status}: ${said}` });
      return fail(502, "The drawing service is busy", true, left);
    }
    const json = (await res.json()) as { result?: { image?: string } };
    const image = json.result?.image;
    if (!image) {
      report({ status: res.status, error: "No image in the response" });
      return fail(502, "The drawing service sent nothing back", true, left);
    }
    const url = `data:image/jpeg;base64,${image}`;
    report({ status: res.status, image: url });
    return Response.json({ image: url, left });
  } catch (e) {
    console.warn("portrait: Workers AI failed", e);
    report({ error: `Timed out or failed: ${String(e).slice(0, 200)}` });
    return fail(504, "The drawing service is slow", true, left);
  }
}
