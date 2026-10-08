"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { CheckIcon } from "../check-icon";
import { UNIVERSES, UNIVERSE_META, type Act, type Universe } from "@/content/universes";
import { track } from "@/lib/analytics";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_HINT,
  actConfig,
  actOutcome,
  candidatesFor,
  computeRecap,
  currentAct,
  currentUniverse,
  hasSubmitted,
  resolveAct,
  universeVotes,
  type Choice,
  type Player,
  type Room,
} from "@/lib/game";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { useRoom } from "@/lib/useRoom";
import { BigButton, ErrorText, Eyebrow, HostShell, SecondaryButton, SubmissionChip } from "./ui";

// The host's current room survives a laptop refresh.
const STORAGE_KEY = "mall-night:host-room-id";

export default function HostScreen({ feedbackUrl }: { feedbackUrl: string | null }) {
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

  async function rpc(fn: string, args: Record<string, unknown>) {
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
  }

  const createGame = () =>
    run(async () => {
      const { data, error } = await supabase.rpc("create_room");
      if (error) throw error;
      localStorage.setItem(STORAGE_KEY, data.id);
      setRoomId(data.id);
    });

  const newGame = () => {
    if (!confirm("End this game and create a new room?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRoomId(null);
    createGame();
  };

  // Still signing in, or the saved room is loading.
  if (!ready || (roomId && !room)) return <HostShell />;

  const feedbackLink = feedbackUrl && (
    <a
      href={feedbackUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-lg text-stone-500 underline underline-offset-4"
    >
      Give feedback
    </a>
  );

  if (!room) {
    return (
      <HostShell footer={feedbackLink}>
        <div className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
          <h1 className="text-7xl font-semibold tracking-tight">Alternate Universes</h1>
          <p className="max-w-3xl text-3xl text-stone-400">{PLAYER_HINT}</p>
          <BigButton onClick={createGame} disabled={busy}>
            Create game
          </BigButton>
          <ErrorText error={error} />
        </div>
      </HostShell>
    );
  }

  const universe = currentUniverse(room);
  const act = currentAct(room);

  const startUniverse = (u: Universe, isReplay = false) =>
    run(async () => {
      await rpc("start_universe", { p_room_id: room.id, p_universe_id: u.id, ...actConfig(u.acts[0]) });
      if (!isReplay) track("universe_selected", { universe_id: u.id });
      track("act_started", { universe_id: u.id, act: 1 });
    });

  const nextAct = () =>
    run(async () => {
      if (!universe) return;
      const next = universe.acts[room.act];
      if (!next) {
        await rpc("end_universe", { p_room_id: room.id });
        return;
      }
      await rpc("next_act", { p_room_id: room.id, ...actConfig(next) });
      track("act_started", { universe_id: universe.id, act: room.act + 1 });
    });

  return (
    <HostShell
      header={
        <>
          <span className="text-2xl font-semibold">{universe?.title ?? "Alternate Universes"}</span>
          {room.phase !== "lobby" && (
            <span className="text-2xl text-stone-400">
              Join with code <span className="font-semibold text-white">{room.code}</span>
            </span>
          )}
        </>
      }
      footer={
        <>
          {feedbackLink}
          <button onClick={newGame} className="text-lg text-stone-500 underline underline-offset-4">
            New game
          </button>
        </>
      }
    >
      {room.phase === "lobby" && (
        <Lobby
          room={room}
          players={players}
          busy={busy}
          error={error}
          onStart={(u) => startUniverse(u)}
        />
      )}

      {room.phase === "choosing" && universe && act && (
        <div className="flex flex-1 flex-col gap-10">
          <Eyebrow>
            Act {room.act} of {universe.acts.length} · {act.title}
            {room.stage === 1 && " · Tie-break vote"}
          </Eyebrow>
          {room.stage === 1 ? (
            <div className="flex flex-col gap-6">
              <p className="text-5xl font-semibold leading-tight">
                It&apos;s a tie. Everyone votes again on their phones.
              </p>
              <ul className="flex flex-col gap-3">
                {candidatesFor(act, players)
                  .filter((c) => room.tie_options.includes(c.key))
                  .map((c) => (
                    <li key={c.key} className="text-4xl text-stone-300">
                      {c.label}
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="max-w-6xl text-5xl font-semibold leading-tight">{act.scenario}</p>
          )}
          {act.kind === "option" && room.stage === 0 && (
            <ul className="flex flex-col gap-3">
              {act.options.map((o) => (
                <li key={o.key} className="text-3xl text-stone-300">
                  <span className="font-semibold text-white">{o.key})</span> {o.label}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-5">
            <p className="text-2xl text-stone-400">
              {players.filter((p) => hasSubmitted(p, room)).length} of {players.length} have chosen
            </p>
            <ul className="flex flex-wrap gap-4">
              {players.map((p) => (
                <SubmissionChip key={p.id} name={p.name} done={hasSubmitted(p, room)} />
              ))}
            </ul>
          </div>
          <div className="mt-auto flex items-center gap-8">
            <BigButton onClick={() => run(() => rpc("reveal_now", { p_room_id: room.id }))} disabled={busy}>
              Reveal now
            </BigButton>
            <ErrorText error={error} />
          </div>
        </div>
      )}

      {room.phase === "revealed" && universe && act && (
        <Reveal
          room={room}
          universe={universe}
          act={act}
          players={players}
          choices={choices.filter((c) => c.round === room.round)}
          busy={busy}
          error={error}
          onRevote={(keys) => run(() => rpc("start_revote", { p_room_id: room.id, p_tied: keys }))}
          onPickTie={(key) => run(() => rpc("resolve_tie", { p_room_id: room.id, p_pick: key }))}
          onNext={nextAct}
        />
      )}

      {room.phase === "ended" && universe && (
        <Ending
          room={room}
          universe={universe}
          players={players}
          choices={choices}
          busy={busy}
          error={error}
          onAnother={() => run(() => rpc("back_to_picker", { p_room_id: room.id }))}
          onReplay={() => startUniverse(universe, true)}
        />
      )}

      {room.phase !== "lobby" && !universe && (
        <div className="flex flex-1 flex-col items-start justify-center gap-8">
          <p className="text-4xl">This universe is no longer available.</p>
          <BigButton onClick={() => run(() => rpc("back_to_picker", { p_room_id: room.id }))} disabled={busy}>
            Back to universes
          </BigButton>
          <ErrorText error={error} />
        </div>
      )}
    </HostShell>
  );
}

function Lobby({
  room,
  players,
  busy,
  error,
  onStart,
}: {
  room: Room;
  players: Player[];
  busy: boolean;
  error: string | null;
  onStart: (u: Universe) => void;
}) {
  const enough = players.length >= MIN_PLAYERS;
  const joinUrl = `${window.location.origin}/play/${room.code}`;
  const { counts, leaders } = universeVotes(players);
  const leading = UNIVERSES.filter((u) => leaders.includes(u.id));

  return (
    <div className="grid flex-1 grid-cols-1 gap-14 lg:grid-cols-[380px_1fr]">
      <aside className="flex flex-col gap-6">
        <div className="self-start rounded-3xl bg-white p-5">
          <QRCodeSVG value={joinUrl} size={enough ? 200 : 300} />
        </div>
        <div>
          <p className="text-xl text-stone-400">Scan to join, or enter this code</p>
          <p className={`font-bold tracking-widest ${enough ? "text-6xl" : "text-8xl"}`}>{room.code}</p>
          <p className="mt-2 break-all text-lg text-stone-500">{joinUrl}</p>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">
            Players{" "}
            <span className="text-stone-500">
              {players.length} / {MAX_PLAYERS}
            </span>
          </h2>
          <ul className="flex flex-wrap gap-3">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-2xl font-medium"
              >
                {p.universe_vote && <CheckIcon className="h-6 w-6 text-emerald-400" />}
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {!enough ? (
        <section className="flex flex-col justify-center gap-6">
          <p className="text-5xl font-semibold">Waiting for players to join…</p>
          <p className="text-3xl text-stone-400">{PLAYER_HINT}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-8">
          <div>
            <h2 className="text-4xl font-semibold">Vote for a universe on your phone</h2>
            <p className="mt-2 text-2xl text-stone-400">You can change your vote until the game starts.</p>
          </div>
          <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {UNIVERSES.map((u) => {
              const votes = counts.get(u.id) ?? 0;
              const isLeading = leaders.includes(u.id);
              return (
                <li
                  key={u.id}
                  className={`flex flex-col gap-3 rounded-3xl border-2 p-7 ${
                    isLeading ? "border-amber-400 bg-stone-800" : "border-stone-800 bg-stone-900"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-lg font-medium uppercase tracking-widest text-amber-400">
                      {u.tone}
                    </span>
                    <span className={`text-2xl font-semibold ${votes ? "text-white" : "text-stone-600"}`}>
                      {votes} {votes === 1 ? "vote" : "votes"}
                    </span>
                  </div>
                  <span className="text-4xl font-semibold">{u.title}</span>
                  <span className="text-2xl text-stone-300">{u.tagline}</span>
                  <span className="mt-auto text-xl text-stone-500">{UNIVERSE_META}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-6">
            {leading.length === 0 && <p className="text-2xl text-stone-500">Waiting for votes…</p>}
            {leading.length === 1 && (
              <BigButton onClick={() => onStart(leading[0])} disabled={busy}>
                Start {leading[0].title}
              </BigButton>
            )}
            {leading.length > 1 && (
              <>
                <p className="text-2xl text-stone-300">Tied. Click the one to play:</p>
                {leading.map((u) => (
                  <SecondaryButton key={u.id} onClick={() => onStart(u)} disabled={busy}>
                    Start {u.title}
                  </SecondaryButton>
                ))}
              </>
            )}
            <ErrorText error={error} />
          </div>
        </section>
      )}
    </div>
  );
}

function Reveal({
  room,
  universe,
  act,
  players,
  choices,
  busy,
  error,
  onRevote,
  onPickTie,
  onNext,
}: {
  room: Room;
  universe: Universe;
  act: Act;
  players: Player[];
  choices: Choice[];
  busy: boolean;
  error: string | null;
  onRevote: (keys: string[]) => void;
  onPickTie: (key: string) => void;
  onNext: () => void;
}) {
  const result = resolveAct(act, room, choices, players);
  const outcome = actOutcome(act, result);
  const isLast = room.act >= universe.acts.length;
  const mainChoices = choices.filter((c) => c.stage === 0);
  const answerLabel = (c: Choice) =>
    act.kind === "player"
      ? (players.find((p) => p.id === c.chosen_player_id)?.name ?? "someone")
      : `${c.chosen_option})`;
  // "Mary and Alex", "Mary, Alex and Sam"
  const names = (cs: { label: string }[]) => {
    const labels = cs.map((c) => c.label);
    return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels.join("");
  };

  return (
    <div className="flex flex-1 flex-col gap-10">
      <Eyebrow>
        Act {room.act} of {universe.acts.length} · {act.title}
      </Eyebrow>

      <div className="grid flex-1 grid-cols-1 gap-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            {result.main.counts.length === 0 && <p className="text-3xl text-stone-500">No one chose.</p>}
            {result.main.counts.map(({ candidate, count }) => (
              <p key={candidate.key} className="text-4xl font-semibold">
                {count} chose {candidate.label}
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-1 text-2xl">
            {players.map((p) => {
              const c = mainChoices.find((x) => x.player_id === p.id);
              return c ? (
                <p key={p.id}>
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-stone-500"> chose </span>
                  <span className="font-semibold">{answerLabel(c)}</span>
                </p>
              ) : (
                <p key={p.id} className="text-stone-500">
                  {p.name} did not choose
                </p>
              );
            })}
          </div>
          {result.revote && (
            <div className="flex flex-col gap-2">
              <p className="text-xl font-medium uppercase tracking-widest text-stone-500">Re-vote</p>
              {result.revote.counts.length === 0 && <p className="text-3xl text-stone-500">No one chose.</p>}
              {result.revote.counts.map(({ candidate, count }) => (
                <p key={candidate.key} className="text-3xl font-semibold">
                  {count} chose {candidate.label}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-8">
          {result.status === "needs-revote" && (
            <div className="flex flex-col items-start gap-6">
              <p className="text-5xl font-semibold leading-tight">
                It&apos;s a tie between {names(result.main.tied)}. Everyone votes again.
              </p>
              <BigButton onClick={() => onRevote(result.main.tied.map((c) => c.key))} disabled={busy}>
                Vote again
              </BigButton>
            </div>
          )}
          {result.status === "needs-pick" && result.revote && (
            <div className="flex flex-col gap-6">
              <p className="text-4xl font-semibold">Still tied. Click the one that wins.</p>
              <div className="flex flex-wrap gap-4">
                {result.revote.tied.map((c) => (
                  <SecondaryButton key={c.key} onClick={() => onPickTie(c.key)} disabled={busy}>
                    {c.label}
                  </SecondaryButton>
                ))}
              </div>
            </div>
          )}
          {outcome && (
            <div className="flex flex-col gap-6">
              {outcome.opener && <p className="text-3xl text-stone-400">{outcome.opener}</p>}
              <p className="text-5xl font-semibold leading-tight">{outcome.outcome}</p>
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center gap-8">
        <BigButton onClick={onNext} disabled={busy || !outcome}>
          {isLast ? "See the ending" : "Next act"}
        </BigButton>
        <ErrorText error={error} />
      </div>
    </div>
  );
}

function Ending({
  room,
  universe,
  players,
  choices,
  busy,
  error,
  onAnother,
  onReplay,
}: {
  room: Room;
  universe: Universe;
  players: Player[];
  choices: Choice[];
  busy: boolean;
  error: string | null;
  onAnother: () => void;
  onReplay: () => void;
}) {
  const recap = computeRecap(universe, room, choices, players);
  const n = recap.totalActs;

  return (
    <div className="flex flex-1 flex-col gap-10">
      <Eyebrow>The end of {universe.title}</Eyebrow>
      <div className="flex flex-col gap-6 text-4xl leading-snug">
        <p>
          Rounds where everyone agreed: {recap.agreedActs} of {n}.
        </p>
        <p>
          {recap.mostSame
            ? `Chose the same way most often: ${recap.mostSame.pairs.join(", ")} (${recap.mostSame.count} of ${n}).`
            : "No two people chose the same way."}
        </p>
        <p>
          {recap.mostDifferent
            ? `Chose differently most often: ${recap.mostDifferent.pairs.join(", ")} (${recap.mostDifferent.count} of ${n}).`
            : "No two people chose differently."}
        </p>
      </div>
      <div className="flex flex-col gap-4 text-4xl font-semibold text-amber-400">
        <p>Want to hear why everyone chose differently?</p>
        <p>What surprised you about the group&apos;s choices?</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-6">
        <BigButton onClick={onAnother} disabled={busy}>
          Play another universe
        </BigButton>
        <SecondaryButton onClick={onReplay} disabled={busy}>
          Replay this one
        </SecondaryButton>
        <ErrorText error={error} />
      </div>
    </div>
  );
}
