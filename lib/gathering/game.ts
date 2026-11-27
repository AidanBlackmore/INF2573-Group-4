"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LockType, RoomKey } from "./content";
import { supabase } from "../supabase";

// What get_view() returns. The database decides what each screen may see:
// the TV gets the public picture; a phone also gets its own role, its side of
// its lock and its half of the note; only the murderer gets `secret`.
export type Phase = "join" | "browse" | "lobby" | "roles" | "tasks" | "quiet" | "discuss" | "meeting" | "tally" | "revealed" | "ended"
  // Trapped Below.
  | "tb_brief" | "tb_dive" | "tb_crew" | "tb_orders" | "tb_watch" | "tb_hands" | "tb_talk" | "tb_vote" | "tb_verdict" | "tb_end";

export type Player = {
  id: string;
  name: string | null;
  // The colour given on joining (1 to 6), and whether they tapped "I'm in".
  color: number | null;
  joined: boolean;
  // Their portrait: an uploaded drawing or a pre-drawn one in /portraits.
  portrait_url: string | null;
  portrait: number | null;
  // Picked their detective inside Marlowe Manor.
  picked: boolean;
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

// Trapped Below's slice of the view (see tb_view() in the database).
export type TbRepair = {
  idx: number; kind: "wires" | "guide"; members: string[]; lead: string; place: string; solved: boolean; result: "ok" | "fail" | null;
  tries: number; solved_at: string | null;
  // Who it was about, once it's done.
  target: string | null;
};
// A crew file field: favourite colour, lucky number, what they'd bring, the deeper answer.
export type TbField = "colour" | "num" | "bring" | "deep";
export type TbView = {
  stage: "talk" | "hatch" | "sealed"; brief_secs: number; skip: string[]; holds: string[];
  seal_at: string | null; sealed_at: string | null; slips: number; slip_at: string | null; dive_at: string | null;
  air: number; air_running: boolean; air_at: string | null; depth: number; saboteur_mode: boolean;
  bolt_report: string | null; fixes: number; logs: { watch: number; text: string; field: TbField; value: string }[]; due_at: string | null;
  // The evidence board: answers checked against the crew file, and who an identity check cleared.
  facts: { player: string; field: TbField; value: string; source: "wires" | "guide" | "riddle"; watch: number }[]; cleared: string[];
  crew_done: string[]; voted: string[] | null; result: (VoteResult & { was_saboteur?: boolean }) | null;
  repairs: TbRepair[];
  hands?: {
    kind: "riddle" | "pipes" | "leak"; done: boolean; ok: boolean | null; tries: number;
    riddle: string[] | null; guessed: string[]; subject: string | null; guesses: Record<string, string> | null;
    rot: number[]; water: number; leak_at: string; floods: number; hatch_held: boolean; rate: number;
    roles: Record<string, { leak: string; rows: [number, number] }>;
  };
  outcome?: "crew" | "saboteur"; reason?: string; saboteur?: string | null;
  files?: { player: string; colour: string; num: number; bring: string; q: string; a: string }[];
  mine?: {
    role: "crew" | "saboteur" | null;
    crew: { colour: string; num: number; bring: string; q: string; a: string } | null;
    bolt?: string | null; can_bolt?: boolean;
    repair?: {
      kind: "wires" | "guide"; place: string; members: string[]; lead: string; lead_name: string; solved: boolean; result: "ok" | "fail" | null;
      tries: number; msg: string; is_lead: boolean; target_name: string | null;
      hint: { not: string[]; parity: "odd" | "even" } | null;
      question: string | null; options: string[] | null; wrong: number[]; max_wrong: number;
      struck: { a: string; owner: string } | null;
    };
    guess?: string | null; see?: number; turn?: number; leak?: string;
  };
};

export type VoteResult = { counts: { k: string; n: number }[]; ejected: string | null; tie: boolean; was_murderer?: boolean };

export type View = {
  room: {
    id: string; code: string; phase: Phase; round: number; phase_at: string; deadline: string | null; total_secs: number; version: number;
    // The story browser: which story is on screen, which way the last swipe went, and when.
    focus: number; focus_dir: 1 | -1; focus_at: string; story: string | null;
  };
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
  tb?: TbView | null;
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

// Trapped Below: when something is due (the briefing ends, the hatch seals, a watch runs out,
// the water rises...), any screen asks the database to move on. It only acts once.
export function useTbTick(view: View | null, now: () => number, reload: () => Promise<void>) {
  const due = view?.tb?.due_at ? new Date(view.tb.due_at).getTime() : null;
  const roomId = view?.room.id;
  const version = view?.room.version;
  useEffect(() => {
    if (!roomId || due === null) return;
    let t: ReturnType<typeof setTimeout>;
    let tries = 0;
    const fire = () => {
      void act(reload, "tb_tick", { p_room_id: roomId }).catch(() => {});
      // Still due a moment later (the call lost a race, or the network dropped it): try again.
      if (++tries < 20) t = setTimeout(fire, 2000 + Math.random() * 500);
    };
    t = setTimeout(fire, Math.max(0, due - now()) + 150 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [roomId, due, version, now, reload]);
}
