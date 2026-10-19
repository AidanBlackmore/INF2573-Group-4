"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

export type WeatherHandle = { flash: () => void };

// Weather over every TV scene: a light drizzle, candle flicker and lightning flashes.
// The drizzle is a few dozen faint, short drops at slightly different speeds and
// sizes, drifting a little with the wind.
export function Weather({ ref }: { ref?: Ref<WeatherHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flashEl = useRef<HTMLElement>(null);

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
    const cv = canvas.current;
    if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d");
    if (!g) return;
    type Drop = { x: number; y: number; len: number; v: number; a: number; wd: number };
    const drops: Drop[] = [];
    const drop = (w: number, h: number, top: boolean): Drop => ({
      x: Math.random() * (w + 60),
      y: top ? -20 - Math.random() * 60 : Math.random() * h,
      len: 6 + Math.random() * 9,
      v: 260 + Math.random() * 220,
      a: 0.08 + Math.random() * 0.2,
      wd: Math.random() < 0.25 ? 1.4 : 1,
    });
    let last = performance.now();
    let frameId = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w && h) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
        const want = Math.round((w * h) / 14000);
        while (drops.length < want) drops.push(drop(w, h, false));
        drops.length = Math.min(drops.length, want);
        g.clearRect(0, 0, w, h);
        g.lineCap = "round";
        for (const d of drops) {
          d.y += d.v * dt;
          d.x -= d.v * 0.1 * dt;
          if (d.y - d.len > h || d.x < -10) Object.assign(d, drop(w, h, true));
          g.strokeStyle = `rgba(214,222,232,${d.a})`;
          g.lineWidth = d.wd;
          g.beginPath();
          g.moveTo(d.x, d.y);
          g.lineTo(d.x + d.len * 0.1, d.y - d.len);
          g.stroke();
        }
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="weather" aria-hidden="true">
      <canvas ref={canvas} />
      <i className="flicker" />
      <i className="flash" ref={flashEl} />
    </div>
  );
}
