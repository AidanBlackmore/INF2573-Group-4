"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Sky } from "@/lib/gathering/content";

export type WeatherHandle = { flash: () => void };

type Speck = { x: number; y: number; len: number; v: number; a: number; wd: number; ph: number };
const R = Math.random;
// How each sky makes a speck, and how many per pixel of screen.
const MAKE: Record<Sky, (w: number, h: number, top: boolean) => Speck> = {
  // A light drizzle: faint, short drops at slightly different speeds, drifting with the wind.
  rain: (w, h, top) => ({ x: R() * (w + 60), y: top ? -20 - R() * 60 : R() * h, len: 6 + R() * 9, v: 260 + R() * 220, a: 0.08 + R() * 0.2, wd: R() < 0.25 ? 1.4 : 1, ph: 0 }),
  // Station Zero: dust drifting up through the dark.
  dust: (w, h, top) => ({ x: R() * w, y: top ? h + 10 : R() * h, len: 0, v: 8 + R() * 22, a: 0.12 + R() * 0.4, wd: 0.6 + R() * 1.8, ph: R() * 6.3 }),
  // The lobby: a still, twinkling night sky.
  stars: (w, h) => ({ x: R() * w, y: R() * h, len: 0, v: 0.4 + R() * 1.4, a: 0.15 + R() * 0.35, wd: R() < 0.15 ? 1.6 : 0.9, ph: R() * 6.3 }),
};
const DENSITY: Record<Sky, number> = { rain: 14000, dust: 9000, stars: 5200 };

// Weather over every TV scene: the sky, candle flicker (rain only) and lightning flashes.
export function Weather({ ref, sky = "rain" }: { ref?: Ref<WeatherHandle>; sky?: Sky }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flashEl = useRef<HTMLElement>(null);
  const skyRef = useRef(sky);

  useImperativeHandle(ref, () => ({
    flash() {
      const el = flashEl.current;
      if (!el) return;
      el.classList.remove("on");
      void el.offsetWidth;
      el.classList.add("on");
    },
  }));

  useEffect(() => {
    skyRef.current = sky;
  }, [sky]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let specks: Speck[] = [];
    let mode = skyRef.current;
    let last = performance.now();
    let frameId = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000), ts = now / 1000;
      last = now;
      if (mode !== skyRef.current) {
        mode = skyRef.current;
        specks = [];
      }
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w && h) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
          specks = [];
        }
        const want = Math.round((w * h) / DENSITY[mode]);
        while (specks.length < want) specks.push(MAKE[mode](w, h, false));
        specks.length = Math.min(specks.length, want);
        g.clearRect(0, 0, w, h);
        g.lineCap = "round";
        for (const d of specks) {
          if (mode === "rain") {
            d.y += d.v * dt;
            d.x -= d.v * 0.1 * dt;
            if (d.y - d.len > h || d.x < -10) Object.assign(d, MAKE.rain(w, h, true));
            g.strokeStyle = `rgba(214,222,232,${d.a})`;
            g.lineWidth = d.wd;
            g.beginPath();
            g.moveTo(d.x, d.y);
            g.lineTo(d.x + d.len * 0.1, d.y - d.len);
            g.stroke();
          } else if (mode === "dust") {
            d.y -= d.v * dt;
            d.x += Math.sin(ts * 0.6 + d.ph) * 6 * dt;
            if (d.y < -10) Object.assign(d, MAKE.dust(w, h, true));
            g.fillStyle = `rgba(190,235,228,${d.a * (0.6 + 0.4 * Math.sin(ts * 1.3 + d.ph))})`;
            g.beginPath();
            g.arc(d.x, d.y, d.wd, 0, 6.29);
            g.fill();
          } else {
            g.fillStyle = `rgba(237,237,239,${d.a * (0.65 + 0.35 * Math.sin(ts * d.v + d.ph))})`;
            g.beginPath();
            g.arc(d.x, d.y, d.wd, 0, 6.29);
            g.fill();
          }
        }
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className={`weather ${sky}`} aria-hidden="true">
      <canvas ref={canvas} />
      <i className="flicker" />
      <i className="flash" ref={flashEl} />
    </div>
  );
}
