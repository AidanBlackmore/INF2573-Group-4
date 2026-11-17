import { createClient } from "@supabase/supabase-js";
import { lookProblem, portraitPrompt } from "@/lib/gathering/look";

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

export const maxDuration = 30;

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const CLOUDFLARE = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";

// `fallback: true` tells the phone to use a pre-drawn portrait; otherwise it shows the message.
// `left` is how many drawings the player has left, once one has been counted.
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
  if (error) return fail(429, error.message);

  try {
    const res = await fetch(`${CLOUDFLARE}/accounts/${account}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: portraitPrompt(look), steps: 4 }),
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) {
      // 429 or a "free allocation" error once today's allowance is used up.
      console.warn("portrait: Workers AI said", res.status, (await res.text()).slice(0, 300));
      return fail(502, "The drawing service is busy", true, left);
    }
    const json = (await res.json()) as { result?: { image?: string } };
    const image = json.result?.image;
    if (!image) return fail(502, "The drawing service sent nothing back", true, left);
    return Response.json({ image: `data:image/jpeg;base64,${image}`, left });
  } catch (e) {
    console.warn("portrait: Workers AI failed", e);
    return fail(504, "The drawing service is slow", true, left);
  }
}
