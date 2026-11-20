"use client";

// Marlowe Manor's guest book on the phone: sign with a finger, and the TV writes the signature into
// the visitors' book (app/host/guestbook.tsx). Strokes are sent fitted to the book's 230 × 56 line.

import { useEffect, useRef, useState } from "react";
import { names } from "@/lib/gathering/content";
import type { Stroke, View } from "@/lib/gathering/game";

type Run = (fn: string, args?: Record<string, unknown>) => Promise<boolean>;
type Pt = { x: number; y: number };
const BOX_W = 230, BOX_H = 56, MAX_POINTS = 1400;

export function SignBook({ view, run, busy, error }: { view: View; run: Run; busy: boolean; error: string | null }) {
  const pad = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const [count, setCount] = useState(0);

  // Draw at the screen's real resolution, with ink that follows the finger.
  useEffect(() => {
    const c = pad.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      redraw(c, strokes.current);
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    strokes.current.push([at(e)]);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = strokes.current.at(-1);
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = at(e), q = s.at(-1)!;
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1.5) return;
    s.push(p);
    const c = e.currentTarget, g = c.getContext("2d")!, k = c.width / c.getBoundingClientRect().width;
    ink(g, k);
    g.beginPath();
    g.moveTo(q.x * k, q.y * k);
    g.lineTo(p.x * k, p.y * k);
    g.stroke();
    if (s.length === 2) setCount((n) => n + 1);
  };
  const clear = () => {
    strokes.current = [];
    setCount(0);
    if (pad.current) redraw(pad.current, []);
  };
  const sign = () => {
    const fitted = fitStrokes(strokes.current.filter((s) => s.length > 1));
    if (fitted.length) void run("sign_book", { p_strokes: fitted });
  };

  const waiting = view.players.filter((p) => p.joined && !p.signed_at && p.id !== view.me).map((p) => p.name ?? "Someone");
  return (
    <div className="ob sign-book">
      <span className="p-eyebrow">Marlowe Manor · the visitors&apos; book</span>
      <h2>Sign the guest book</h2>
      <p className="p-small">Lord Fenwick asks every guest to sign. Your signature goes into the book on the TV.</p>
      <canvas ref={pad} className="sign-pad" aria-label="Sign here with your finger" onPointerDown={down} onPointerMove={move} />
      <span className="sign-x" aria-hidden>
        ✕ sign above the line
      </span>
      {error && <div className="err">{error}</div>}
      <div className="spacer" />
      {waiting.length > 0 && <p className="p-small">Also signing: {names(waiting)}.</p>}
      <div className="row sign-row">
        <button className="p-btn2" disabled={!count || busy} onClick={clear}>
          Clear
        </button>
        <button className="p-btn" disabled={!count || busy} onClick={sign}>
          Sign
        </button>
      </div>
    </div>
  );
}

// After signing: their signature, and who's still to sign.
export function Signed({ view }: { view: View }) {
  const me = view.players.find((p) => p.id === view.me);
  const waiting = view.players.filter((p) => p.joined && !p.signed_at).map((p) => p.name ?? "Someone");
  return (
    <div className="p-msg signed">
      <h2>Signed</h2>
      {me?.signature && (
        <svg className="signed-sig" viewBox={`0 0 ${BOX_W + 12} ${BOX_H + 4}`} aria-label="Your signature">
          {me.signature.map((s, i) => (
            <path key={i} d={s.map(([x, y], j) => `${j ? "L" : "M"}${6 + x} ${2 + y}`).join(" ")} />
          ))}
        </svg>
      )}
      <p className="p-small">{waiting.length ? `Waiting for ${names(waiting)} to sign.` : "Everyone's signed. Watch the book close."}</p>
    </div>
  );
}

function ink(g: CanvasRenderingContext2D, k: number) {
  g.lineWidth = 3.2 * k;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "#1d1630";
}

function redraw(c: HTMLCanvasElement, strokes: Pt[][]) {
  const g = c.getContext("2d")!, k = c.width / (c.getBoundingClientRect().width || 1);
  g.clearRect(0, 0, c.width, c.height);
  ink(g, k);
  for (const s of strokes) {
    g.beginPath();
    s.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)));
    g.stroke();
  }
}

// Fit the signature to the book's line, keeping its shape, rounded to tenths, at most MAX_POINTS points.
function fitStrokes(strokes: Pt[][]): Stroke[] {
  const all = strokes.flat();
  if (all.length < 2) return [];
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const k = Math.min(BOX_W / Math.max(maxX - minX, 1), (BOX_H - 4) / Math.max(maxY - minY, 1));
  const dy = (BOX_H - (maxY - minY) * k) / 2;
  const every = Math.max(1, Math.ceil(all.length / MAX_POINTS));
  return strokes
    .slice(0, 40)
    .map((s) => s.filter((_, i) => i % every === 0 || i === s.length - 1).map((p): [number, number] => [Math.round((p.x - minX) * k * 10) / 10, Math.round(((p.y - minY) * k + dy) * 10) / 10]))
    .filter((s) => s.length > 1);
}
