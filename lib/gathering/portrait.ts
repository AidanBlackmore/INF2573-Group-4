"use client";

import { supabase } from "../supabase";
import { lookProblem, matchLibrary } from "./look";

// Drawing a player's portrait on the phone:
// 1. /api/portrait asks Cloudflare Workers AI for a pen-and-ink drawing of the description.
// 2. The phone turns it into ink on old paper with a hand-drawn border, so every portrait
//    matches the house style whatever the model sends back.
// 3. It goes to the public "portraits" bucket in Supabase Storage; the player row keeps the link.
// If any step fails (no key set up, out of today's free allowance, too slow), the phone uses the
// closest pre-drawn portrait from public/portraits instead, so joining never gets stuck.

// `left`: drawings the player has left, when the server counted this one.
export type Drawn = { url: string; engine: "ai" | "library"; ms: number; reason?: string; left?: number };

// A problem the player can fix (rude words, out of drawings): shown on the phone.
export class LookError extends Error {}

const W = 420, H = 588; // 5:7, the shape of the cards in the design
const PAPER: [number, number, number] = [233, 220, 192];
const INK: [number, number, number] = [26, 22, 18];

export async function drawPortrait(roomId: string, look: string): Promise<Drawn> {
  const problem = lookProblem(look);
  if (problem) throw new LookError(problem);
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let left: number | undefined;
  const fallback = (reason: string): Drawn => ({ url: matchLibrary(look, roomId), engine: "library", ms: ms(), reason, left });

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return fallback("no session");

  let image: string;
  try {
    const res = await fetch("/api/portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ roomId, look }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { image?: string; error?: string; fallback?: boolean; left?: number };
    left = json.left;
    if (!res.ok || !json.image) {
      if (json.error && !json.fallback) throw new LookError(json.error);
      return fallback(json.error ?? `status ${res.status}`);
    }
    image = json.image;
  } catch (e) {
    if (e instanceof LookError) throw e;
    return fallback("timeout");
  }

  try {
    const blob = await inkOnPaper(image, hashOf(look));
    const path = `${session.user.id}/${roomId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("portraits").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) return fallback(`upload: ${error.message}`);
    return { url: supabase.storage.from("portraits").getPublicUrl(path).data.publicUrl, engine: "ai", ms: ms(), left };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "processing");
  }
}

// The model's drawing, redrawn as ink on old paper inside a wobbly pen border.
async function inkOnPaper(src: string, seed: number): Promise<Blob> {
  const img = await loadImage(src);
  const rand = rng(seed);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;

  // The drawing, cropped from the middle of the square to the card's shape.
  const sw = Math.min(img.width, (img.height * W) / H), sh = (sw * H) / W;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H);
  const d = px.data;

  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % W, y = Math.floor(i / 4 / W);
    // Paper: warm, grainy, a little darker towards the edges.
    const dx = x / W - 0.5, dy = y / H - 0.5;
    const edge = Math.min(1, (dx * dx + dy * dy) * 2.2);
    const grain = (rand() - 0.5) * 14 - edge * 34;
    // Ink: dark lines stay, light greys and colour wash out to paper.
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const a = Math.pow(Math.min(1, Math.max(0, (222 - lum) / 150)), 0.85);
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((PAPER[k] + grain) * (1 - a) + INK[k] * a);
  }
  g.putImageData(px, 0, 0);

  // The border: two loose pen strokes, like the cards in the design.
  g.strokeStyle = `rgb(${INK.join(",")})`;
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const [inset, width] of [[7, 6], [10, 2.5]] as const) {
    g.lineWidth = width;
    g.beginPath();
    const corners = [[inset, inset], [W - inset, inset], [W - inset, H - inset], [inset, H - inset], [inset, inset]];
    g.moveTo(corners[0][0] + (rand() - 0.5) * 3, corners[0][1] + (rand() - 0.5) * 3);
    for (let s = 1; s < corners.length; s++) {
      const [x0, y0] = corners[s - 1], [x1, y1] = corners[s];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24);
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        g.lineTo(x0 + (x1 - x0) * f + (rand() - 0.5) * 2.4, y0 + (y1 - y0) * f + (rand() - 0.5) * 2.4);
      }
    }
    g.stroke();
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.86));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
