"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Choice, Player, Room } from "./game";

// Live view of one room. The database is the source of truth: on every
// Realtime event, on (re)subscribe, and whenever the tab becomes visible
// again (phone unlocked), the whole room state is reloaded.
export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!roomId) return;
    const id = ++requestId.current;

    const [roomRes, playersRes] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("players").select("*").eq("room_id", roomId).order("created_at"),
    ]);
    const nextRoom = roomRes.data as Room | null;

    // Choices are only readable once revealed (enforced by RLS). Load the
    // whole current playthrough so the ending recap can compare acts.
    let nextChoices: Choice[] = [];
    if (nextRoom?.phase === "revealed" || nextRoom?.phase === "ended") {
      const { data } = await supabase
        .from("choices")
        .select("*")
        .eq("room_id", roomId)
        .gte("round", nextRoom.run_start_round)
        .lte("round", nextRoom.round);
      nextChoices = (data as Choice[]) ?? [];
    }

    // A newer reload started while this one was in flight; drop stale results.
    if (id !== requestId.current) return;
    setRoom(nextRoom);
    setPlayers((playersRes.data as Player[]) ?? []);
    setChoices(nextChoices);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        () => void reload(),
      )
      // Database changes only start flowing a moment after SUBSCRIBED.
      // Reload again then, so nothing that happened in between is missed.
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

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      void supabase.removeChannel(channel);
    };
  }, [roomId, reload]);

  return { room, players, choices, reload };
}
