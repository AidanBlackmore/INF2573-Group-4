"use client";

import { useCallback, useEffect, useState } from "react";
import type { Mystery, Universe } from "@/content/universes";
import type { Player, Room } from "./game";
import { supabase } from "./supabase";

// What get_mystery() returns. The database decides what each screen may see:
// only the murderer gets you_are_murderer, their body_room and my_action;
// everyone gets body_room and the clue once the body is found, and
// murderer_id once the game is decided.
export type MysterySearch = {
  act: number;
  round: number;
  room_key: string;
  result: "empty" | "evidence" | "body";
  framed_player_id: string | null;
  // The murderer moved the body during this act.
  dragged: boolean;
};

export type MysteryState = {
  you_are_murderer: boolean;
  move_available: boolean | null;
  my_action: { kind: "plant" | "move" | "lie_low"; room_key: string | null; framed_player_id: string | null } | null;
  searches: MysterySearch[];
  max_searches: number;
  found_act: number | null;
  body_room: string | null;
  clue: { question: string; answer: string } | null;
  murderer_id: string | null;
  accused_id: string | null;
  outcome: "detectives" | "murderer" | null;
};

// Live mystery state for a room playing the murder mystery. Reloads whenever
// the room changes (every mystery action touches the room row).
export function useMystery(room: Room | null, universe: Universe | undefined) {
  const [state, setState] = useState<{ roomId: string; mystery: MysteryState | null } | null>(null);
  const roomId = room?.id ?? null;
  const active = Boolean(room && universe?.mystery && room.phase !== "lobby");
  // Anything on the room that changes after a mystery action.
  const changeKey = room ? `${room.round}:${room.phase}:${room.stage}:${room.tie_pick}:${room.act}` : "";

  // Bumped to force a reload, e.g. after the murderer acts (that doesn't touch the room).
  const [bump, setBump] = useState(0);
  const refresh = useCallback(() => setBump((n) => n + 1), []);

  useEffect(() => {
    if (!roomId || !active) return;
    let cancelled = false;
    void supabase.rpc("get_mystery", { p_room_id: roomId }).then(({ data, error }) => {
      if (!cancelled && !error) setState({ roomId, mystery: (data as MysteryState | null) ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, active, changeKey, bump]);

  const current = active && state?.roomId === roomId ? state.mystery : null;
  return { mystery: current, refresh };
}

export function roomName(mystery: Mystery, key: string | null | undefined): string {
  return mystery.rooms.find((r) => r.key === key)?.name ?? "somewhere";
}

// What a search found, as the screen tells it.
export function searchText(mystery: Mystery, search: MysterySearch, players: Player[]): string {
  const room = mystery.rooms.find((r) => r.key === search.room_key);
  if (search.result === "body") return mystery.bodyFound.replaceAll("{room}", room?.name ?? "room");
  if (search.result === "evidence") {
    const framed = players.find((p) => p.id === search.framed_player_id)?.name ?? "someone";
    return (room?.evidence ?? "Evidence against {framed}.").replaceAll("{framed}", framed);
  }
  return room?.empty ?? "Nothing here.";
}
