"use client";

import type { ReactNode } from "react";
import { PLAN, ROOM_NAMES, type RoomKey } from "@/lib/gathering/content";
import type { View } from "@/lib/gathering/game";
import { colorOf } from "./bits";

const KEYS = Object.keys(PLAN) as RoomKey[];

// Rooms are next door when they share a stretch of wall; that wall has a door.
type Door = { v: boolean; x: number; y: number };
function sharedWall(a: RoomKey, b: RoomKey): Door | null {
  const [ax, ay, aw, ah] = PLAN[a], [bx, by, bw, bh] = PLAN[b];
  const ov = (s1: number, e1: number, s2: number, e2: number) => Math.min(e1, e2) - Math.max(s1, s2);
  if (ax + aw === bx || bx + bw === ax) {
    const o = ov(ay, ay + ah, by, by + bh);
    if (o > 30) return { v: true, x: ax + aw === bx ? bx : ax, y: Math.max(ay, by) + o / 2 };
  }
  if (ay + ah === by || by + bh === ay) {
    const o = ov(ax, ax + aw, bx, bx + bw);
    if (o > 30) return { v: false, y: ay + ah === by ? by : ay, x: Math.max(ax, bx) + o / 2 };
  }
  return null;
}
const DOORS: Door[] = KEYS.flatMap((a, i) => KEYS.slice(i + 1).map((b) => sharedWall(a, b)).filter((d): d is Door => d !== null));

// Furniture, drawn in pencil.
const FURN: Record<RoomKey, (x: number, y: number, w: number, h: number) => ReactNode> = {
  library: (x, y, w, h) => (
    <>
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} className="furn" x={x + 14 + i * 26} y={y + 10} width="22" height="10" />)}
      <circle className="furn" cx={x + w - 30} cy={y + h - 30} r="12" />
    </>
  ),
  study: (x, y, w, h) => (
    <>
      <rect className="furn" x={x + 20} y={y + h - 50} width="60" height="28" />
      <circle className="furn" cx={x + 50} cy={y + h - 12} r="7" />
    </>
  ),
  conservatory: (x, y, w, h) =>
    [30, 80, 200, 220].map((dx, i) => <circle key={i} className="furn" cx={x + dx} cy={y + (i % 2 ? 30 : h - 30)} r={10 + (i % 2) * 4} />),
  ballroom: (x, y, w, h) => (
    <>
      <circle className="furn" cx={x + w / 2} cy={y + h / 2 + 10} r="38" strokeDasharray="4 5" />
      <path className="furn" d={`M${x + 14} ${y + 14} h40 q16 0 16 22 v8 h-56 z`} />
    </>
  ),
  hall: (x, y, w, h) => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} className="furn" x1={x + w - 50} y1={y + 16 + i * 9} x2={x + w - 12} y2={y + 16 + i * 9} />)}
      <rect className="furn" x={x + 30} y={y + h - 50} width={w - 110} height="30" />
    </>
  ),
  dining: (x, y, w, h) => (
    <>
      <rect className="furn" x={x + 40} y={y + h / 2 - 2} width={w - 80} height="34" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect className="furn" x={x + 50 + i * 30} y={y + h / 2 - 14} width="12" height="9" />
          <rect className="furn" x={x + 50 + i * 30} y={y + h / 2 + 37} width="12" height="9" />
        </g>
      ))}
    </>
  ),
  cellar: (x, y, w, h) => [0, 1, 2].map((i) => <circle key={i} className="furn" cx={x + 28 + i * 34} cy={y + h - 26} r="13" />),
  kitchen: (x, y, w, h) => (
    <>
      <path className="furn" d={`M${x + 12} ${y + 12} h${w - 24} v20 h-${w - 54} v${h - 44} h-30 z`} />
      <rect className="furn" x={x + w - 70} y={y + h - 46} width="44" height="32" />
      <circle className="furn" cx={x + w - 58} cy={y + h - 30} r="6" />
      <circle className="furn" cx={x + w - 38} cy={y + h - 30} r="6" />
    </>
  ),
  billiards: (x, y, w, h) => (
    <>
      <rect className="furn" x={x + 40} y={y + h / 2 - 4} width={w - 80} height="44" rx="4" />
      {[[40, -4], [w - 40, -4], [40, 40], [w - 40, 40]].map(([dx, dy], i) => (
        <circle key={i} className="furn" cx={x + dx} cy={y + h / 2 + dy} r="4" />
      ))}
    </>
  ),
};

// The paper floor plan of Marlowe Manor, with each pair's portraits in their room.
export function HousePlan({ view }: { view: View }) {
  return (
    <svg className="house" viewBox="0 0 620 470" role="img" aria-label="Floor plan of Marlowe Manor">
      {KEYS.map((key) => {
        const [x, y, w, h] = PLAN[key], cy = y + h / 2;
        const pair = view.pairs?.find((p) => p.room === key);
        return (
          <g key={key}>
            <rect className="floor" x={x} y={y} width={w} height={h} />
            {FURN[key](x, y, w, h)}
            <rect className="wall" x={x} y={y} width={w} height={h} />
            <text className="label" x={x + w / 2} y={cy - 6}>
              {ROOM_NAMES[key]}
            </text>
            {pair?.members.map((m, i) => {
              const p = view.players.find((pl) => pl.id === m);
              const cx = x + w / 2 + (i - (pair.members.length - 1) / 2) * 34;
              return (
                <g key={m} className={`tok${p?.dead ? " ghost" : ""}`}>
                  <rect className="tokframe" x={cx - 15} y={cy + 2} width="30" height="44" />
                  <image href={`/figma/av-${p?.portrait ?? 1}.jpg`} x={cx - 13} y={cy + 4} width="26" height="32" preserveAspectRatio="xMidYMid slice" />
                  <rect x={cx - 13} y={cy + 36} width="26" height="8" style={{ fill: colorOf(view, m) }} />
                  <text className="token" x={cx} y={cy + 43} textAnchor="middle">
                    {(p?.name ?? "").slice(0, 3).toUpperCase()}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {DOORS.map((d, i) =>
        d.v ? (
          <g key={i}>
            <line className="door" x1={d.x} y1={d.y - 12} x2={d.x} y2={d.y + 12} />
            <path className="swing" d={`M${d.x} ${d.y - 12} a24 24 0 0 1 24 24`} />
          </g>
        ) : (
          <g key={i}>
            <line className="door" x1={d.x - 12} y1={d.y} x2={d.x + 12} y2={d.y} />
            <path className="swing" d={`M${d.x - 12} ${d.y} a24 24 0 0 0 24 24`} />
          </g>
        ),
      )}
      <rect className="outer" x="10" y="10" width="600" height="420" />
      <line className="door" x1="275" y1="430" x2="325" y2="430" style={{ strokeWidth: 9 }} />
      <text className="tb" x="14" y="455">
        MARLOWE MANOR · GROUND FLOOR · SCALE 1:100
      </text>
      <text className="tb" x="606" y="455" textAnchor="end">
        FRONT DOOR ↓ · N ↑
      </text>
    </svg>
  );
}
