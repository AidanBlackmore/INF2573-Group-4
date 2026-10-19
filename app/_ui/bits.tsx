"use client";

import type { CSSProperties } from "react";
import { fmt } from "@/lib/gathering/content";
import type { Player, View } from "@/lib/gathering/game";

// Each player's colour is the one they picked in the lobby (join order until they pick).
export function colorOf(view: View, id: string | null | undefined) {
  const i = view.players.findIndex((p) => p.id === id);
  return `var(--player-${view.players[i]?.color ?? (i < 0 ? 0 : i) + 1})`;
}

// A negative animation delay = time already passed, so animations pick up where
// they left off when a screen redraws.
export const since = (at: string | number | null | undefined, now = Date.now()) =>
  `-${Math.max(0, now - (at ? new Date(at).getTime() : 0))}ms`;

type AvatarProps = {
  view: View;
  player: Player | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  extra?: string;
  // Override the name band (the lobby picker shows "Open").
  label?: string;
  portrait?: number | null;
  color?: string;
};

// Detective portrait: ink frame, the picture, a name band in the player's colour.
// Ghosts get a faded portrait and a red X, stamped on as they die (the stamp
// animation starts at the moment of death, so later redraws show it already landed).
export function Avatar({ view, player, size = "sm", extra = "", label, portrait, color }: AvatarProps) {
  const dead = Boolean(player?.dead);
  const style = { "--pc": color ?? colorOf(view, player?.id), "--st": since(player?.dead_at) } as CSSProperties;
  const pic = portrait ?? player?.portrait ?? 1;
  return (
    <span className={`av ${size}${dead ? " dead" : ""}${extra ? ` ${extra}` : ""}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/figma/av-${pic}.jpg`} alt="" />
      <b>{label ?? player?.name ?? "…"}</b>
    </span>
  );
}

// Clue art from the design system (Figma: Gothic Inked Clue Collection).
export function Art({ name, className = "" }: { name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`art ${className}`} src={`/figma/${name}.jpg`} alt="" />;
}

// Timer ring: the arc is the time left.
export function Ring({ left, total, big = false }: { left: number; total: number; big?: boolean }) {
  const style = { "--frac": total ? Math.min(1, left / total) : 0 } as CSSProperties;
  return (
    <span className={`ring${big ? "" : " sm"}`} style={style} role="timer" aria-label={`${fmt(left)} left`}>
      <span>{fmt(left)}</span>
    </span>
  );
}

// A narrated line on the TV. The narrator reads every [data-line] on screen.
export function Line({ id, text }: { id: string; text: string }) {
  return (
    <p className="narration" data-line={id}>
      {text}
    </p>
  );
}

// The murderer's card art: a hand-drawn kitchen knife in the design system's ink style.
export function KnifeSvg() {
  return (
    <svg className="knife-svg" viewBox="0 0 160 240" role="img" aria-label="A kitchen knife">
      <g transform="rotate(32 80 120)" stroke="#141414" strokeLinecap="round" strokeLinejoin="round">
        <path d="M80 6c9 30 17 72 15 128H63c-1-46 5-92 17-128z" fill="#f4ecdb" strokeWidth="4" />
        <path d="M80 10c3 36 4 82 3 122" fill="none" strokeWidth="1.6" />
        <path
          d="M71 40l-4 5m6 9l-5 6m4 10l-5 6m4 10l-5 6m4 10l-5 6m4 10l-5 6m26-76l3 5m-2 12l3 5m-2 12l3 5m-2 12l3 5m-2 12l3 5"
          fill="none"
          strokeWidth="1.1"
          opacity=".7"
        />
        <path d="M93 64l-5 3 5 4m-1 26l-5 3 5 3" fill="none" strokeWidth="1.6" />
        <path d="M84 92c3 5 3 10 0 13-2-4-3-9 0-13zm-6 22c3 4 2 9-1 11-2-4-2-8 1-11z" fill="#b3261e" strokeWidth="1.2" />
        <rect x="58" y="134" width="44" height="12" rx="2" fill="#c9b48a" strokeWidth="4" />
        <path d="M62 146h36l-2 80c-10 9-22 9-32 0z" fill="#5b4636" strokeWidth="4" />
        <path d="M71 152c4 24 4 48 0 68m19-68c-3 24-3 48 0 68" fill="none" stroke="#2a211a" strokeWidth="1.4" opacity=".8" />
        <circle cx="80" cy="170" r="5.5" fill="#e8d9b8" strokeWidth="2.6" />
        <circle cx="80" cy="204" r="5.5" fill="#e8d9b8" strokeWidth="2.6" />
      </g>
    </svg>
  );
}

// How long ago something happened, in milliseconds.
export const ageOf = (at: string | number | null | undefined) => Date.now() - (at ? new Date(at).getTime() : 0);

// A name tag in the player's colour (The Gathering lobby: names and colours only, no characters yet).
export function Tag({ view, player, style, className = "" }: { view: View; player: Player; style?: CSSProperties; className?: string }) {
  return (
    <span className={`tag pp ${className}`} style={{ "--pc": colorOf(view, player.id), ...style } as CSSProperties}>
      <i />
      {player.name}
    </span>
  );
}
