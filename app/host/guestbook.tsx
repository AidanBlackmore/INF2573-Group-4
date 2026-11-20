"use client";

// Marlowe Manor's guest book on the TV (the first part of the manor's onboarding; see
// lib/gathering/onboarding.ts). The book opens with its pages fluttering past; as each guest signs
// on their phone, a quill writes their signature in, stroke by stroke, next to their portrait.
// When the last guest has signed (rooms.book_at), the pages flutter back, the book shuts, slides to
// the middle and is sealed with wax. The TV moves on to the intro BOOK_CLOSE_MS after that.
//
// The book is a fixed 1000 × 600 scene scaled to fit, with real 3D: page blocks and board covers
// with thickness, a front cover that swings on the spine, and loose pages that flip over.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Player, Stroke, View } from "@/lib/gathering/game";
import { sound } from "@/lib/gathering/sound";
import { Line } from "../_ui/bits";

const W = 1000, H = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(r));
const firstName = (p: Player) => (p.name ?? "Guest").split(" ")[0];
const picOf = (p: Player) => p.portrait_url ?? `/figma/av-${p.portrait ?? 1}.jpg`;
// Arrival times in the book, as if it were 1891: one guest every two minutes from 7:40.
const arrived = (i: number) => `7:${String(40 + i * 2).padStart(2, "0")} pm`;

export function GuestBook({ view, busy, onClose }: { view: View; busy: boolean; onClose: () => void }) {
  const signed = view.players.filter((p) => p.joined && p.signed_at).sort((a, b) => a.signed_at!.localeCompare(b.signed_at!));
  const waiting = view.players.filter((p) => p.joined && !p.signed_at);
  const closedAt = view.room.book_at;

  // Scale the scene to the space it has.
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(Math.min(e.contentRect.width / W, e.contentRect.height / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scene = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const quill = useRef<HTMLDivElement>(null);
  const flips = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const sigs = useRef(new Map<string, SVGSVGElement>());
  const sigRef = useCallback(
    (id: string) => (el: SVGSVGElement | null) => {
      if (el) sigs.current.set(id, el);
      else sigs.current.delete(id);
    },
    [],
  );

  // Everything that happens over time runs through one queue, so signatures are written one at a time
  // and the book only closes once the last one is in.
  const engine = useRef({ alive: true, queue: Promise.resolve(), drawn: new Set<string>(), closing: false, started: false, at: { x: 980, y: 600 } });

  useLayoutEffect(() => {
    const e = engine.current;
    e.alive = true;
    const b = book.current!;
    if (!e.started) {
      e.started = true;
      // Coming back to this screen after the book closed (a refresh): show it shut and sealed.
      if (closedAt && Date.now() - new Date(closedAt).getTime() > 1500) {
        b.className = "gb-book instant closed centred sealed";
        e.closing = true;
      } else {
        b.className = "gb-book instant closed centred";
        const mountedAt = new Date(view.room.phase_at).getTime();
        e.queue = e.queue.then(() => openBook(e, mountedAt));
      }
    }
    return () => {
      e.alive = false;
    };
    // Runs once: the book's state lives in the DOM from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New signatures: write each one in, in the order they came.
  const signedKey = signed.map((p) => p.id).join();
  useEffect(() => {
    const e = engine.current;
    for (const p of signed) {
      if (e.drawn.has(p.id) || !p.signature) continue;
      e.drawn.add(p.id);
      const strokes = p.signature;
      if (e.closing) {
        drawNow(sigs.current.get(p.id), strokes);
        continue;
      }
      e.queue = e.queue.then(() => writeIn(e, p.id, strokes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedKey]);

  // Everyone's in (or the host closed the book): shut it.
  useEffect(() => {
    const e = engine.current;
    if (!closedAt || e.closing) return;
    e.closing = true;
    e.queue = e.queue.then(() => shutBook(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedAt]);

  // ---------- the moves ----------

  function stagePoint(svg: SVGSVGElement, x: number, y: number) {
    const ctm = svg.getScreenCTM(), s = scene.current?.getBoundingClientRect();
    if (!ctm || !s) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(ctm);
    const scale = s.width / W || 1;
    return { x: (p.x - s.left) / scale, y: (p.y - s.top) / scale };
  }
  function putQuill(p: { x: number; y: number }, tilt = -6) {
    if (quill.current) quill.current.style.transform = `translate(${p.x - 10}px, ${p.y - 182}px) rotate(${tilt}deg)`;
  }
  async function glide(e: typeof engine.current, to: { x: number; y: number }, ms: number) {
    const from = e.at, t0 = performance.now();
    for (;;) {
      if (!e.alive) return;
      const t = Math.min(1, (performance.now() - t0) / ms), ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease - Math.sin(t * Math.PI) * 40 };
      putQuill(p, -4 + 10 * Math.sin(t * Math.PI));
      e.at = p;
      if (t >= 1) return;
      await frame();
    }
  }

  async function openBook(e: typeof engine.current, mountedAt: number) {
    const b = book.current!;
    await frame();
    b.classList.remove("instant");
    // Let the manor fade up first (the TV's "entering" title card), so the book is seen shut.
    await sleep(Math.max(900, 3600 - (Date.now() - mountedAt)));
    if (!e.alive) return;
    b.classList.remove("closed", "centred");
    sound().whoosh(-1);
    await sleep(950);
    if (!e.alive) return;
    await flutter(e, 1, 6, 150, 760);
    if (flips.current) flips.current.style.display = "none";
    quill.current?.classList.add("on");
  }

  async function writeIn(e: typeof engine.current, id: string, strokes: Stroke[]) {
    const svg = sigs.current.get(id);
    if (!svg || !e.alive) return;
    const row = svg.closest(".gb-row");
    row?.classList.add("pinned");
    quill.current?.classList.add("on");
    const ns = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    const paths = strokes.map((pts) => {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", pts.map(([x, y], i) => `${i ? "L" : "M"}${(6 + x).toFixed(1)} ${(2 + y).toFixed(1)}`).join(" "));
      p.setAttribute("class", "wet");
      svg.appendChild(p);
      const len = p.getTotalLength() || 1;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      return { p, len };
    });
    // A long, fussy signature still goes in within about 2.5 s.
    const total = paths.reduce((t, x) => t + x.len, 0);
    const speed = Math.max(4.2, total / 2200);
    for (const { p, len } of paths) {
      const start = p.getPointAtLength(0);
      await glide(e, stagePoint(svg, start.x, start.y), 240);
      const dur = Math.max(120, len * (4.2 / speed) * 1), sc = sound().scratch(), t0 = performance.now();
      for (;;) {
        if (!e.alive) return sc.stop();
        const t = Math.min(1, (performance.now() - t0) / dur);
        p.style.strokeDashoffset = `${len * (1 - t)}`;
        const q = p.getPointAtLength(len * t), at = stagePoint(svg, q.x, q.y);
        putQuill(at);
        e.at = at;
        sc.set(0.7);
        if (t >= 1) break;
        await frame();
      }
      sc.stop();
    }
    row?.classList.add("done");
    await sleep(350);
  }

  // Loose pages turning over: right to left (dir 1, opening) or back (dir -1, closing). Each has the
  // blank register on its front and the title page on its back, so landing pages look like what's
  // already there and can be taken away.
  async function flutter(e: typeof engine.current, dir: 1 | -1, n: number, gap: number, dur: number) {
    const host = flips.current, tp = title.current;
    if (!host || !tp) return;
    host.innerHTML = "";
    host.style.display = "";
    const anims: Promise<unknown>[] = [];
    for (let i = 0; i < n; i++) {
      const f = document.createElement("div");
      f.className = "gb-flip";
      f.innerHTML = `<div class="gb-fface ff"><i class="gb-fshade"></i></div><div class="gb-fface fb"><i class="gb-fshade"></i></div>`;
      f.querySelector(".fb")!.insertBefore(tp.cloneNode(true), f.querySelector(".fb .gb-fshade"));
      host.appendChild(f);
      const z = 1 + (dir > 0 ? n - i : i) * 0.5, a0 = dir > 0 ? 0 : -180, a1 = dir > 0 ? -180 : 0;
      const at = (t: number) => a0 + (a1 - a0) * t;
      const opts: KeyframeAnimationOptions = { duration: dur * (0.9 + Math.random() * 0.2), delay: i * gap, easing: "cubic-bezier(.4,.05,.3,1)", fill: "both" };
      f.querySelectorAll(".gb-fshade").forEach((s) => s.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.5 }, { opacity: 0 }], opts));
      setTimeout(() => e.alive && sound().pageTurn(), i * gap + 60);
      anims.push(
        f.animate(
          [
            { transform: `translateZ(${z}px) rotateY(${a0}deg)` },
            { transform: `translateZ(${z + 16}px) rotateY(${at(0.35)}deg) skewY(${-3 * dir}deg)`, offset: 0.35 },
            { transform: `translateZ(${z + 18}px) rotateY(${at(0.62)}deg) skewY(${2.5 * dir}deg)`, offset: 0.62 },
            { transform: `translateZ(${z}px) rotateY(${a1}deg)` },
          ],
          opts,
        ).finished,
      );
    }
    await Promise.all(anims).catch(() => {});
  }

  async function shutBook(e: typeof engine.current) {
    const b = book.current!, q = quill.current;
    if (!e.alive) return;
    await glide(e, { x: 990, y: 590 }, 500);
    q?.classList.remove("on");
    await sleep(500);
    if (!e.alive) return;
    const pages = flutter(e, -1, 5, 130, 720);
    await sleep(520);
    if (!e.alive) return;
    sound().whoosh(1);
    b.classList.add("closed");
    await pages;
    await sleep(900);
    if (!e.alive) return;
    if (flips.current) flips.current.style.display = "none";
    sound().bookShut();
    scene.current?.classList.add("shake");
    setTimeout(() => scene.current?.classList.remove("shake"), 400);
    puff(dust.current, 700, 470, 70);
    await sleep(500);
    b.classList.add("centred");
    await sleep(1100);
    if (!e.alive) return;
    b.classList.add("sealed");
    setTimeout(() => {
      if (!e.alive) return;
      sound().seal();
      puff(dust.current, 500, 420, 40);
    }, 500);
  }

  const shown = signed.length;
  return (
    <>
      <span className="eyebrow">{closedAt ? "Everyone is here" : "Sign the guest book"}</span>
      <div className="gb-box" ref={box}>
        <div className="gb-scene" ref={scene} style={{ transform: `translate(-50%, -50%) scale(${k})`, visibility: k ? "visible" : "hidden" }}>
          <div className="gb-desk">
            <div className="gb-book" ref={book}>
              <div className="gb-shadow" />
              <div className="gb-right">
                <div className="gb-skin gb-base" />
                <i className="gb-blk bot" />
                <i className="gb-blk fore" />
                <div className="gb-pages">
                  <div className="gb-tex" />
                  <div className="gb-spine" />
                  <div className="gb-reg">
                    <div className="gb-reg-head">
                      <span />
                      <span>Signature</span>
                      <span>Arrived</span>
                    </div>
                    {signed.map((p, i) => (
                      <div className="gb-row" key={p.id}>
                        <i className="gb-pic" style={{ backgroundImage: `url(${picOf(p)})` }} />
                        <svg className="gb-sig" viewBox="0 0 250 60" preserveAspectRatio="xMinYMid meet" ref={sigRef(p.id)} />
                        <span className="gb-when">{arrived(i)}</span>
                        <span className="gb-who">{firstName(p)}</span>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 6 - shown) }, (_, i) => (
                      <div className="gb-row" key={`blank${i}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="gb-leaf">
                <div className="gb-skin gb-inner" />
                <i className="gb-blk bot" />
                <i className="gb-blk fore" />
                <div className="gb-face front">
                  <div className="gb-pages">
                    <div className="gb-tex" />
                    <div className="gb-spine" />
                    <div className="gb-title" ref={title}>
                      <span className="k">MARLOWE MANOR</span>
                      <div className="h">Visitors&apos; Book</div>
                      <div className="rule" />
                      <div className="d">
                        Lord Fenwick&apos;s birthday dinner
                        <br />
                        Saturday, the 14th of November, 1891
                      </div>
                      <div className="gb-kindly">Kindly sign upon arrival</div>
                      <span className="num">— 1 —</span>
                    </div>
                  </div>
                </div>
                <div className="gb-face back">
                  <div className="gb-skin" />
                  <Cover />
                  <div className="gb-glint" />
                  <div className="gb-seal" />
                </div>
              </div>
              <div className="gb-flips" ref={flips} />
              <div className="gb-ribbon" />
            </div>
          </div>
          <div className="gb-quill" ref={quill}>
            <Quill />
          </div>
          <canvas className="gb-dust" ref={dust} width={W} height={H} />
        </div>
      </div>
      <div className="gb-foot">
        <Line
          id={closedAt ? "book-2" : "book-1"}
          text={closedAt ? "Everyone is here. The doors are locked, and the night begins." : "Before dinner, Lord Fenwick asks each guest to sign his visitors' book. Sign it on your phone."}
        />
        {!closedAt && signed.length > 0 && waiting.length > 0 && (
          <button className="btn quiet" disabled={busy} onClick={onClose}>
            Close the book without {waiting.length === 1 ? firstName(waiting[0]) : `${waiting.length} guests`}
          </button>
        )}
      </div>
    </>
  );
}

// Signatures already in when the TV (re)loads go straight in, without the quill.
function drawNow(svg: SVGSVGElement | undefined, strokes: Stroke[]) {
  if (!svg) return;
  svg.closest(".gb-row")?.classList.add("pinned", "done");
  svg.innerHTML = strokes
    .map((pts) => `<path d="${pts.map(([x, y], i) => `${i ? "L" : "M"}${(6 + x).toFixed(1)} ${(2 + y).toFixed(1)}`).join(" ")}"/>`)
    .join("");
}

type Mote = { x: number; y: number; vx: number; vy: number; life: number; r: number };
function puff(canvas: HTMLCanvasElement | null, x: number, y: number, n: number) {
  const c = canvas?.getContext("2d");
  if (!c || !canvas) return;
  const motes: Mote[] = Array.from({ length: n }, () => ({
    x: x + (Math.random() - 0.5) * 420, y: y + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6 - 0.2, life: 1, r: 1 + Math.random() * 2.4,
  }));
  const step = () => {
    c.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const m of motes) {
      if (m.life <= 0) continue;
      alive++;
      m.x += m.vx; m.y += m.vy; m.vy += 0.01; m.life -= 0.012;
      c.fillStyle = `rgba(240,220,180,${m.life * 0.5})`;
      c.beginPath();
      c.arc(m.x, m.y, m.r, 0, 7);
      c.fill();
    }
    if (alive) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// The front cover, drawn like the game's art: ink frame and corners, the candle sketch, a taped label.
function Cover() {
  const corner = (cls: string) => (
    <svg className={`gb-corner ${cls}`} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M4 60 V4 H60" fill="none" stroke="#141414" strokeWidth="4" />
      <path d="M4 4 L22 22 M12 4 C 12 14, 14 16, 22 22 C 16 14, 14 12, 4 12" fill="none" stroke="#141414" strokeWidth="2" />
      <path d="M8 8 l6 0 M8 11 l4 0 M30 10 c 6 -4 12 -4 18 0 M10 30 c -4 6 -4 12 0 18" fill="none" stroke="#141414" strokeWidth="1.6" />
      <circle cx="22" cy="22" r="3" fill="#141414" />
    </svg>
  );
  return (
    <div className="gb-cover">
      <div className="gb-frame" />
      {corner("tl")}
      {corner("tr")}
      {corner("bl")}
      {corner("br")}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gb-emblem" src="/figma/sketch-candle.jpg" alt="" />
      <div className="gb-label">
        <i className="gb-tape" />
        <span className="t1">MARLOWE MANOR</span>
        <span className="t2">VISITORS&apos; BOOK</span>
        <span className="t3">Lord Fenwick&apos;s guests, 1891</span>
      </div>
      <span className="t4">KINDLY SIGN UPON ARRIVAL</span>
    </div>
  );
}

function Quill() {
  return (
    <svg viewBox="0 0 120 190" aria-hidden="true">
      <path d="M14 178 C 30 140, 52 96, 108 8 C 96 40, 86 58, 70 80 C 84 72, 92 66, 100 58 C 84 92, 62 116, 38 140 C 30 150, 22 162, 14 178 Z" fill="#efe6d2" stroke="#141414" strokeWidth="2.2" />
      <path d="M14 178 C 40 128, 70 70, 108 8" fill="none" stroke="#141414" strokeWidth="1.8" />
      <path d="M60 96 l10 -2 M52 110 l11 -3 M45 123 l10 -3 M72 74 l10 -3 M82 56 l9 -4 M66 86 l9 -3" stroke="#141414" strokeWidth="1.1" />
      <path d="M8 186 L14 172 L19 175 Z" fill="#141414" />
    </svg>
  );
}
