"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckIcon } from "../../check-icon";
import { candidatesFor, currentAct, currentUniverse, hasSubmitted } from "@/lib/game";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { useRoom } from "@/lib/useRoom";

type Status = "loading" | "not-found" | "error" | "ready";

export default function PlayerScreen() {
  const { code } = useParams<{ code: string }>();
  const roomCode = decodeURIComponent(code).trim().toUpperCase();

  const [status, setStatus] = useState<Status>("loading");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find the room, and whether this device has already joined it (reconnect).
  useEffect(() => {
    (async () => {
      try {
        const userId = await ensureSignedIn();
        const { data: room } = await supabase
          .from("rooms")
          .select("id")
          .eq("code", roomCode)
          .maybeSingle();
        if (!room) {
          setStatus("not-found");
          return;
        }
        const { data: me } = await supabase
          .from("players")
          .select("id")
          .eq("room_id", room.id)
          .eq("user_id", userId)
          .maybeSingle();
        setRoomId(room.id);
        setMyPlayerId(me?.id ?? null);
        setStatus("ready");
      } catch (e) {
        setError(errorMessage(e));
        setStatus("error");
      }
    })();
  }, [roomCode]);

  if (status === "loading") return <PhoneShell />;

  if (status === "not-found" || status === "error") {
    return (
      <PhoneShell>
        <Message
          title={status === "not-found" ? `No room called ${roomCode}` : "Could not connect"}
          body={error ?? "Check the code on the shared screen and try again."}
        />
        <Link href="/" className={primaryButton}>
          Enter another code
        </Link>
      </PhoneShell>
    );
  }

  if (!myPlayerId) {
    return <JoinForm roomCode={roomCode} onJoined={setMyPlayerId} />;
  }

  return <Controller roomId={roomId!} roomCode={roomCode} myPlayerId={myPlayerId} />;
}

function JoinForm({ roomCode, onJoined }: { roomCode: string; onJoined: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("join_room", { p_code: roomCode, p_name: name });
    setBusy(false);
    if (error) setError(error.message);
    else onJoined(data.id);
  }

  return (
    <PhoneShell roomCode={roomCode}>
      <form onSubmit={join} className="flex flex-1 flex-col gap-4">
        <label htmlFor="name" className="text-3xl font-semibold">
          What should we call you?
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoComplete="off"
          autoFocus
          placeholder="Your name"
          className="h-16 rounded-2xl border border-stone-300 bg-white px-5 text-2xl outline-none focus:border-stone-900"
        />
        {error && <p className="text-lg text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className={`${primaryButton} mt-auto`}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </PhoneShell>
  );
}

function Controller({
  roomId,
  roomCode,
  myPlayerId,
}: {
  roomId: string;
  roomCode: string;
  myPlayerId: string;
}) {
  const { room, players, reload } = useRoom(roomId);
  // Selections and local submit state are tied to a round, so they reset
  // automatically when the host starts the next act.
  const [selection, setSelection] = useState<{ round: number; key: string } | null>(null);
  const [submittedRound, setSubmittedRound] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = players.find((p) => p.id === myPlayerId);
  if (!room || !me) return <PhoneShell roomCode={roomCode} />;

  const universe = currentUniverse(room);
  const act = currentAct(room);
  const selected = selection?.round === room.round ? selection.key : null;
  const submitted = hasSubmitted(me, room) || submittedRound === room.round;

  async function submit() {
    if (!room || !act || !selected || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(
      "submit_choice",
      act.kind === "player"
        ? { p_room_id: room.id, p_chosen_player_id: selected }
        : { p_room_id: room.id, p_chosen_option: selected },
    );
    if (error) setError(error.message);
    else setSubmittedRound(room.round);
    await reload();
    setBusy(false);
  }

  return (
    <PhoneShell roomCode={roomCode} name={me.name}>
      {room.phase === "lobby" && (
        <Message title={`You're in, ${me.name}.`} body="The host is choosing a universe…" />
      )}

      {room.phase === "choosing" && submitted && (
        <Message title="Waiting for others…" body="Your choice is locked in and kept secret." />
      )}

      {room.phase === "choosing" && !submitted && universe && act && (
        <div className="flex flex-1 flex-col gap-5">
          <p className="text-sm font-medium uppercase tracking-widest text-stone-500">
            {universe.title} · Act {room.act} · {act.title}
          </p>
          <p className="text-lg leading-snug text-stone-700">{act.scenario}</p>
          <p className="text-2xl font-semibold">
            {act.kind === "player" ? "Pick one person." : "Pick one option."}
          </p>
          <ul className="flex flex-col gap-3">
            {candidatesFor(act, players).map((c) => {
              const isSelected = c.key === selected;
              return (
                <li key={c.key}>
                  <button
                    onClick={() => setSelection({ round: room.round, key: c.key })}
                    aria-pressed={isSelected}
                    className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-3 text-left text-xl font-medium ${
                      isSelected
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    <span>
                      {c.label}
                      {c.key === me.id && <span className="ml-2 text-base opacity-60">(you)</span>}
                    </span>
                    {isSelected && <CheckIcon className="h-7 w-7 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-lg text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={!selected || busy}
            className={`${primaryButton} sticky bottom-6 mt-auto`}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}

      {room.phase === "revealed" && (
        <Message title="Choices revealed" body="Look at the shared screen." />
      )}

      {room.phase === "ended" && (
        <Message
          title={`The end of ${universe?.title ?? "this universe"}`}
          body="Look at the shared screen and talk it over."
        />
      )}
    </PhoneShell>
  );
}

const primaryButton =
  "flex h-16 w-full items-center justify-center rounded-2xl bg-stone-900 text-xl font-semibold text-white disabled:opacity-30";

function PhoneShell({
  roomCode,
  name,
  children,
}: {
  roomCode?: string;
  name?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 py-6">
      <header className="flex items-center justify-between text-base text-stone-500">
        <span className="font-semibold tracking-widest text-stone-900">{roomCode}</span>
        {name && <span>{name}</span>}
      </header>
      {children}
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-xl text-stone-600">{body}</p>
    </div>
  );
}
