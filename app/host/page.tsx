"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { CheckIcon } from "../check-icon";
import { MIN_PLAYERS, SCENARIO, hasSubmitted, tally, type Player } from "@/lib/game";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { useRoom } from "@/lib/useRoom";

// The host's current room survives a laptop refresh.
const STORAGE_KEY = "mall-night:host-room-id";

export default function HostPage() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { room, players, choices, reload } = useRoom(roomId);

  useEffect(() => {
    (async () => {
      try {
        const userId = await ensureSignedIn();
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const { data } = await supabase
            .from("rooms")
            .select("id, host_id")
            .eq("id", saved)
            .maybeSingle();
          if (data && data.host_id === userId) setRoomId(saved);
          else localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const createGame = () =>
    run(async () => {
      const { data, error } = await supabase.rpc("create_room");
      if (error) throw error;
      localStorage.setItem(STORAGE_KEY, data.id);
      setRoomId(data.id);
    });

  const callRoom = (fn: "start_round" | "reveal_now") =>
    run(async () => {
      const { error } = await supabase.rpc(fn, { p_room_id: roomId });
      if (error) throw error;
    });

  const newGame = () => {
    if (!confirm("End this game and create a new room?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRoomId(null);
  };

  // Still signing in, or the saved room is loading.
  if (!ready || (roomId && !room)) return <HostShell />;

  if (!room) {
    return (
      <HostShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-12 text-center">
          <h1 className="text-7xl font-semibold tracking-tight">Mall Night</h1>
          <p className="max-w-3xl text-3xl text-stone-400">
            Show this screen on the TV. Players join with their phones.
          </p>
          <BigButton onClick={createGame} disabled={busy}>
            Create game
          </BigButton>
          <ErrorText error={error} />
        </div>
      </HostShell>
    );
  }

  const joinUrl = `${window.location.origin}/play/${room.code}`;
  const submittedCount = players.filter((p) => hasSubmitted(p, room)).length;

  return (
    <HostShell
      header={
        <>
          <span className="text-2xl font-semibold">Mall Night</span>
          {room.phase !== "lobby" && (
            <span className="text-2xl text-stone-400">
              Join with code <span className="font-semibold text-white">{room.code}</span>
            </span>
          )}
        </>
      }
      footer={
        <button onClick={newGame} className="text-lg text-stone-500 underline underline-offset-4">
          New game
        </button>
      }
    >
      {room.phase === "lobby" && (
        <div className="grid flex-1 grid-cols-1 gap-16 lg:grid-cols-2">
          <section className="flex flex-col items-center justify-center gap-8 text-center">
            <div className="rounded-3xl bg-white p-6">
              <QRCodeSVG value={joinUrl} size={300} />
            </div>
            <div>
              <p className="text-2xl text-stone-400">Scan to join, or enter this code</p>
              <p className="mt-2 text-9xl font-bold tracking-widest">{room.code}</p>
              <p className="mt-4 break-all text-xl text-stone-500">{joinUrl}</p>
            </div>
          </section>

          <section className="flex flex-col gap-8">
            <h2 className="text-4xl font-semibold">
              Players <span className="text-stone-500">{players.length}</span>
            </h2>
            {players.length === 0 ? (
              <p className="text-3xl text-stone-500">Waiting for players to join…</p>
            ) : (
              <ul className="flex flex-wrap gap-4">
                {players.map((p) => (
                  <li key={p.id} className="rounded-2xl bg-stone-800 px-6 py-4 text-4xl font-medium">
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex flex-col items-start gap-4">
              <BigButton
                onClick={() => callRoom("start_round")}
                disabled={busy || players.length < MIN_PLAYERS}
              >
                Start round
              </BigButton>
              {players.length < MIN_PLAYERS && (
                <p className="text-2xl text-stone-500">At least {MIN_PLAYERS} players are needed.</p>
              )}
              <ErrorText error={error} />
            </div>
          </section>
        </div>
      )}

      {room.phase === "choosing" && (
        <div className="flex flex-1 flex-col gap-12">
          <p className="text-2xl font-medium uppercase tracking-widest text-amber-400">
            Round {room.round}
          </p>
          <p className="max-w-6xl text-6xl font-semibold leading-tight">{SCENARIO}</p>
          <div className="flex flex-col gap-6">
            <p className="text-3xl text-stone-400">
              {submittedCount} of {players.length} have chosen
            </p>
            <ul className="flex flex-wrap gap-4">
              {players.map((p) => (
                <SubmissionChip key={p.id} player={p} done={hasSubmitted(p, room)} />
              ))}
            </ul>
          </div>
          <div className="mt-auto flex items-center gap-8">
            <BigButton onClick={() => callRoom("reveal_now")} disabled={busy}>
              Reveal now
            </BigButton>
            <ErrorText error={error} />
          </div>
        </div>
      )}

      {room.phase === "revealed" && (
        <Reveal
          round={room.round}
          picks={choices.map((c) => ({
            from: players.find((p) => p.id === c.player_id),
            to: players.find((p) => p.id === c.chosen_player_id),
          }))}
          counts={tally(choices, players)}
          missing={players.filter((p) => !choices.some((c) => c.player_id === p.id))}
          action={
            <>
              <BigButton onClick={() => callRoom("start_round")} disabled={busy}>
                New round
              </BigButton>
              <ErrorText error={error} />
            </>
          }
        />
      )}
    </HostShell>
  );
}

function Reveal({
  round,
  picks,
  counts,
  missing,
  action,
}: {
  round: number;
  picks: { from?: Player; to?: Player }[];
  counts: { player: Player; count: number }[];
  missing: Player[];
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-12">
      <p className="text-2xl font-medium uppercase tracking-widest text-amber-400">
        Round {round} choices
      </p>
      <div className="grid flex-1 grid-cols-1 gap-16 lg:grid-cols-2">
        <section className="flex flex-col gap-6">
          {counts.length === 0 && <p className="text-4xl text-stone-500">No one chose.</p>}
          {counts.map(({ player, count }) => (
            <p key={player.id} className="text-6xl font-semibold">
              {count} chose {player.name}
            </p>
          ))}
        </section>
        <section className="flex flex-col gap-4">
          {picks.map(({ from, to }, i) => (
            <p key={i} className="text-4xl">
              <span className="font-semibold">{from?.name ?? "Someone"}</span>
              <span className="text-stone-500"> chose </span>
              <span className="font-semibold">{to?.name ?? "someone"}</span>
            </p>
          ))}
          {missing.map((p) => (
            <p key={p.id} className="text-4xl text-stone-500">
              {p.name} did not choose
            </p>
          ))}
        </section>
      </div>
      <div className="flex items-center gap-8">{action}</div>
    </div>
  );
}

function SubmissionChip({ player, done }: { player: Player; done: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-6 py-4 text-4xl font-medium ${
        done ? "bg-emerald-500 text-stone-950" : "border-2 border-stone-700 text-stone-500"
      }`}
    >
      {done && <CheckIcon className="h-9 w-9" />}
      {player.name}
    </li>
  );
}

function HostShell({
  header,
  footer,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col gap-12 bg-stone-950 px-16 py-12 text-white">
      {header && <header className="flex items-center justify-between">{header}</header>}
      {children}
      {footer && <footer className="flex justify-end">{footer}</footer>}
    </main>
  );
}

function BigButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-2xl bg-amber-400 px-12 py-6 text-4xl font-semibold text-stone-950 transition-opacity disabled:opacity-30"
    />
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-2xl text-red-400">{error}</p>;
}
