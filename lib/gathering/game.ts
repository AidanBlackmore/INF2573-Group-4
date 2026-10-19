"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LockType, RoomKey } from "./content";
import { supabase } from "../supabase";

// What get_view() returns. The database decides what each screen may see:
// the TV gets the public picture; a phone also gets its own role, its side of
// its lock and its half of the note; only the murderer gets `secret`.
export type Phase = "lobby" | "roles" | "tasks" | "quiet" | "discuss" | "meeting" | "tally" | "revealed" | "ended";

export type Player = {
  id: string;
  name: string | null;
  portrait: number | null;
  answered: boolean;
  opened: boolean;
  ready: boolean;
  dead: "killed" | "ejected" | null;
  dead_at: string | null;
  voted: boolean;
};

export type Pair = { idx: number; members: string[]; room: RoomKey; lock_type: LockType; solved: boolean; tries: number };

export type Found = {
  round: number;
  room: RoomKey;
  found_by: string[];
  q: string;
  a: string;
  murderer: boolean;
  // Only once the game is over.
  owner?: string;
  forged?: boolean;
};

export type MyLock = {
  idx: number;
  room: RoomKey;
  members: string[];
  lock_type: LockType;
  lead: string;
  solved: boolean;
  tries: number;
  msg: string;
  side: "a" | "b";
  say?: string;
  strokes?: number[][][];
  lie_set?: boolean;
  lie?: number | null;
  wires?: string[];
  // Once opened: null if the lock was empty.
  note?: { q: string; murderer: boolean; half: number; words: string } | null;
};

export type VoteResult = { counts: { k: string; n: number }[]; ejected: string | null; tie: boolean; was_murderer?: boolean };

export type View = {
  room: { id: string; code: string; phase: Phase; round: number; phase_at: string; deadline: string | null; total_secs: number; version: number };
  server_now: string;
  me: string | null;
  is_tv: boolean;
  host_player: string | null;
  players: Player[];
  my_answers?: { q: string; a: string }[];
  role?: "murderer" | "detective";
  pairs?: Pair[];
  found?: Found[];
  stuck?: RoomKey[];
  report?: { victim: string; room: RoomKey; last_seen: string[] } | null;
  result?: VoteResult | null;
  murderer?: string;
  outcome?: "detectives" | "murderer";
  reason?: string;
  lost_forgery?: string | null;
  lock?: MyLock;
  secret?: {
    questions: string[];
    forged: { a: string; found: boolean } | null;
    can_kill: boolean;
    kill_state: "none" | "wait" | "struck";
    kill_target: string | null;
  };
};

export const TIMED: Phase[] = ["tasks", "discuss", "meeting"];

// Live view of one room. The database is the source of truth: on every Realtime
// event, on (re)subscribe, when the tab becomes visible again (phone unlocked),
// and every few seconds as a safety net, the screen reloads its view.
export function useGame(roomId: string | null) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Server clock minus this device's clock, so every timer agrees.
  const [skew, setSkew] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!roomId) return;
    const id = ++requestId.current;
    const sent = Date.now();
    const { data, error: err } = await supabase.rpc("get_view", { p_room_id: roomId });
    if (id !== requestId.current) return;
    if (err) {
      setError(err.message);
      return;
    }
    const next = data as View;
    setSkew(new Date(next.server_now).getTime() - (sent + Date.now()) / 2);
    setError(null);
    setView(next);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, () => void reload())
      // Database changes only start flowing a moment after SUBSCRIBED; reload then too.
      .on("system", {}, (message) => {
        if (message?.extension === "postgres_changes" && message?.status === "ok") void reload();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reload();
      });
    const onWake = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 4000);
    const first = setTimeout(() => void reload(), 0);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      void supabase.removeChannel(channel);
    };
  }, [roomId, reload]);

  const now = useCallback(() => Date.now() + skew, [skew]);
  const current = view && view.room.id === roomId ? view : null;
  return { view: current, error, reload, now };
}

// Calls a database action and reloads straight away, so this screen doesn't wait for Realtime.
export async function act(reload: () => Promise<void>, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  await reload();
  if (error) throw new Error(error.message);
  return data;
}

// Seconds left on the current timer, redrawn every quarter second.
export function useSecondsLeft(view: View | null, now: () => number) {
  const deadline = view?.room.deadline ? new Date(view.room.deadline).getTime() : null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now()) / 1000)) : 0;
}

// When a timer runs out, ask the database to move on (any screen can; it only acts once).
export function useAdvanceWhenDue(view: View | null, left: number, reload: () => Promise<void>) {
  const tried = useRef<string>("");
  const phase = view?.room.phase;
  const deadline = view?.room.deadline;
  const roomId = view?.room.id;
  useEffect(() => {
    if (!roomId || !phase || !TIMED.includes(phase) || !deadline || left > 0) return;
    const key = `${phase}:${deadline}`;
    if (tried.current === key) return;
    tried.current = key;
    const t = setTimeout(() => void act(reload, "advance_if_due", { p_room_id: roomId }).catch(() => {}), 700 + Math.random() * 600);
    return () => clearTimeout(t);
  }, [roomId, phase, deadline, left, reload]);
}

export const playerOf = (view: View, id: string | null | undefined) => view.players.find((p) => p.id === id);
export const nameOf = (view: View, id: string | null | undefined) => playerOf(view, id)?.name ?? "Someone";
export const alive = (view: View) => view.players.filter((p) => !p.dead);
export const isHost = (view: View) => view.is_tv || (view.me !== null && view.me === view.host_player);
// The murderer's notes to talk about: this round's, or all of them so far.
export function clues(view: View): Found[] {
  const mine = (view.found ?? []).filter((f) => f.murderer);
  const now = mine.filter((f) => f.round === view.room.round);
  return now.length ? now : mine;
}
