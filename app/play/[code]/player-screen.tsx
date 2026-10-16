"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Blueprint } from "../../blueprint";
import { CheckIcon } from "../../check-icon";
import { ICEBREAKERS, roomIcebreaker, shuffleIcebreaker } from "@/content/icebreakers";
import type { Mystery } from "@/content/universes";
import { UNIVERSES } from "@/content/universes";
import { actProperties, track } from "@/lib/analytics";
import { candidatesFor, currentAct, currentUniverse, hasSubmitted, type Player } from "@/lib/game";
import { roomName, searchText, useMystery, type MysteryState } from "@/lib/mystery";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { useRoom } from "@/lib/useRoom";
import { formatSeconds, useSecondsLeft } from "@/lib/useSecondsLeft";

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
  const [selection, setSelection] = useState<{ step: string; key: string } | null>(null);
  const [submittedStep, setSubmittedStep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(room?.phase === "choosing" ? room.choice_deadline : null);
  const opensIn = useSecondsLeft(room?.phase === "choosing" ? room.choices_open_at : null);
  // Everyone reads the scenario and talks before anyone can choose.
  const discussing = opensIn !== null && opensIn > 0;
  const { mystery, refresh: refreshMystery } = useMystery(room, room ? currentUniverse(room) : undefined);

  const me = players.find((p) => p.id === myPlayerId);
  if (!room || !me) return <PhoneShell roomCode={roomCode} />;

  const universe = currentUniverse(room);
  const act = currentAct(room);
  // A "step" is one vote: the act's vote, or its tie-break re-vote.
  const step = `${room.round}:${room.stage}`;
  const selected = selection?.step === step ? selection.key : null;
  const submitted = hasSubmitted(me, room) || submittedStep === step;
  const isRevote = room.stage === 1;
  const candidates = act
    ? candidatesFor(act, players).filter((c) => !isRevote || room.tie_options.includes(c.key))
    : [];

  async function submit() {
    if (!room || !act || !selected || busy || discussing) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(
      "submit_choice",
      act.kind === "player" || act.kind === "accusation"
        ? { p_room_id: room.id, p_chosen_player_id: selected }
        : { p_room_id: room.id, p_chosen_option: selected },
    );
    if (error) setError(error.message);
    else {
      setSubmittedStep(step);
      // One event per vote, saying what it was a vote for. Person picks never
      // send a name, only whether the player picked themselves.
      if (universe) {
        track("vote_submitted", {
          ...actProperties(universe, room.act, room),
          stage: isRevote ? "revote" : "vote",
          ...(act.kind === "option" || act.kind === "search"
            ? {
                choice: selected,
                choice_label: candidates.find((c) => c.key === selected)?.label,
              }
            : { choice: selected === me?.id ? "self" : "another_player", picked_self: selected === me?.id }),
        });
      }
    }
    await reload();
    setBusy(false);
  }

  return (
    <PhoneShell roomCode={roomCode} name={me.name}>
      {room.phase === "lobby" && !me.icebreaker_done && <Icebreaker roomId={room.id} onAnswered={reload} />}

      {room.phase === "lobby" && me.icebreaker_done && (
        <UniverseVote roomId={room.id} current={me.universe_vote} onVoted={reload} />
      )}

      {universe?.mystery && mystery && room.phase !== "lobby" && room.phase !== "ended" && (
        <RoleCard mystery={universe.mystery} state={mystery} />
      )}

      {room.phase === "choosing" && submitted && (
        <Message title="Waiting for others…" body="Your choice is locked in and kept secret." />
      )}

      {room.phase === "choosing" && !submitted && secondsLeft === 0 && (
        <Message title="Time's up" body="A random choice is being made for you." />
      )}

      {room.phase === "choosing" && !submitted && secondsLeft !== 0 && universe && act && (
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium uppercase tracking-widest text-stone-500">
              {universe.title} · Act {room.act} · {isRevote ? "Tie-break vote" : act.title}
            </p>
            {discussing ? (
              <span className="text-xl font-semibold tabular-nums text-amber-600">{formatSeconds(opensIn)}</span>
            ) : (
              secondsLeft !== null && (
                <span
                  className={`text-xl font-semibold tabular-nums ${secondsLeft <= 10 ? "text-red-600" : "text-stone-900"}`}
                >
                  {formatSeconds(secondsLeft)}
                </span>
              )
            )}
          </div>
          {isRevote ? (
            <p className="text-lg leading-snug text-stone-700">
              It&apos;s a tie. Vote again, choosing only between the tied answers.
            </p>
          ) : (
            <p className="text-lg leading-snug text-stone-700">{act.scenario}</p>
          )}
          {discussing ? (
            <p className="rounded-2xl bg-amber-100 px-4 py-3 text-lg font-medium text-amber-900">
              Talk it over with the group first. You can choose in {opensIn} second{opensIn === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className="text-2xl font-semibold">
              {act.kind === "player"
                ? "Pick one person."
                : act.kind === "search"
                  ? "Pick a room to search."
                  : act.kind === "accusation"
                    ? "Who is the murderer?"
                    : "Pick one option."}
            </p>
          )}
          {act.kind === "accusation" && mystery?.clue && (
            <div className="rounded-2xl border-2 border-dashed border-stone-400 bg-amber-50 px-4 py-3">
              <p className="text-sm uppercase tracking-widest text-stone-500">The note on the body</p>
              <p className="text-lg italic">&ldquo;{mystery.clue.answer}&rdquo;</p>
              <p className="text-sm text-stone-500">An answer to: {mystery.clue.question}</p>
            </div>
          )}
          {act.kind === "search" && !isRevote ? (
            <Blueprint
              rooms={act.rooms}
              searches={mystery?.searches ?? []}
              size="phone"
              selected={selected}
              onSelect={(key) => setSelection({ step, key })}
              disabled={discussing}
            />
          ) : (
          <ul className="flex flex-col gap-3">
            {candidates.map((c) => {
              const isSelected = c.key === selected;
              return (
                <li key={c.key}>
                  <button
                    onClick={() => setSelection({ step, key: c.key })}
                    disabled={discussing}
                    aria-pressed={isSelected}
                    className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-3 text-left text-xl font-medium disabled:opacity-50 ${
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
          )}
          {error && <p className="text-lg text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={!selected || busy || discussing}
            className={`${primaryButton} sticky bottom-6 mt-auto`}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}

      {room.phase === "choosing" && act?.kind === "search" && universe?.mystery && mystery && (
        <SecretNotebook
          roomId={room.id}
          mystery={universe.mystery}
          state={mystery}
          players={players}
          me={me}
          onDone={refreshMystery}
        />
      )}

      {room.phase === "revealed" && (
        <Message
          title="Choices revealed"
          body={
            universe?.mystery && mystery?.searches.at(-1)?.round === room.round
              ? searchText(universe.mystery, mystery.searches.at(-1)!, players)
              : "Look at the shared screen."
          }
        />
      )}

      {room.phase === "ended" && universe?.mystery && mystery?.outcome && (
        <Message
          title={mystery.outcome === "detectives" ? "The detectives win" : "The murderer wins"}
          body={
            mystery.you_are_murderer
              ? mystery.outcome === "murderer"
                ? "You got away with it. Look at the shared screen."
                : "They caught you. Look at the shared screen."
              : "Look at the shared screen and talk it over."
          }
        />
      )}

      {room.phase === "ended" && !(universe?.mystery && mystery?.outcome) && (
        <Message
          title={`The end of ${universe?.title ?? "this universe"}`}
          body="Look at the shared screen and talk it over."
        />
      )}
    </PhoneShell>
  );
}

// Before the game: everyone answers a niche question. Shuffle for another
// one, but you must answer to continue, and answers can't be changed later.
function Icebreaker({ roomId, onAnswered }: { roomId: string; onAnswered: () => Promise<void> }) {
  const [index, setIndex] = useState(() => roomIcebreaker(roomId));
  const [shuffles, setShuffles] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = ICEBREAKERS[index];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("answer_icebreaker", {
      p_room_id: roomId,
      p_question: question,
      p_answer: answer,
    });
    if (error) setError(error.message);
    else track("icebreaker_answered", { question_index: index, shuffles });
    await onAnswered();
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <p className="text-sm font-medium uppercase tracking-widest text-stone-500">Before we start</p>
      <h1 className="text-3xl font-semibold leading-tight">{question}</h1>
      <button
        type="button"
        onClick={() => {
          setIndex(shuffleIcebreaker(index));
          setShuffles((n) => n + 1);
        }}
        className="self-start rounded-xl border-2 border-stone-300 px-4 py-2 text-lg font-medium"
      >
        🔀 Different question
      </button>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        maxLength={280}
        rows={4}
        placeholder="Your answer"
        className="rounded-2xl border border-stone-300 bg-white px-5 py-4 text-xl outline-none focus:border-stone-900"
      />
      <p className="text-base text-stone-500">
        Only you can see this. You can&apos;t change it once it&apos;s submitted.
      </p>
      {error && <p className="text-lg text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !answer.trim()} className={`${primaryButton} mt-auto`}>
        {busy ? "Submitting…" : "Submit answer"}
      </button>
    </form>
  );
}

// Murder mystery: your secret role, shown only on your own phone.
function RoleCard({ mystery, state }: { mystery: Mystery; state: MysteryState }) {
  return state.you_are_murderer ? (
    <div className="rounded-2xl bg-stone-900 px-5 py-4 text-white">
      <p className="text-lg font-semibold">🔪 You are the murderer.</p>
      <p className="text-base opacity-80">
        The body is in the {roomName(mystery, state.body_room)}. Keep everyone away from it, and don&apos;t get
        caught.
      </p>
    </div>
  ) : (
    <div className="rounded-2xl bg-stone-900 px-5 py-4 text-white">
      <p className="text-lg font-semibold">🔍 You are a detective.</p>
      <p className="text-base opacity-80">Find the body, then work out which of your friends did it.</p>
    </div>
  );
}

// The murderer's secret move for this act. Detectives get a private notes
// panel in the same place, so nobody stands out for tapping their phone.
function SecretNotebook({
  roomId,
  mystery,
  state,
  players,
  me,
  onDone,
}: {
  roomId: string;
  mystery: Mystery;
  state: MysteryState;
  players: Player[];
  me: Player;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"plant" | "move" | "lie_low">("plant");
  const [roomKey, setRoomKey] = useState("");
  const [framed, setFramed] = useState("");
  const [suspect, setSuspect] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = players.filter((p) => p.id !== me.id);

  if (!state.you_are_murderer) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border-2 border-stone-300 bg-white px-5 py-4">
        <p className="text-sm font-medium uppercase tracking-widest text-stone-500">Private notebook</p>
        <p className="text-lg font-semibold">Who do you suspect right now?</p>
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSuspect(p.id === suspect ? null : p.id)}
              className={`rounded-xl border-2 px-3 py-2 text-base ${
                suspect === p.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="text-sm text-stone-500">Just for you. Nobody else sees this.</p>
      </section>
    );
  }

  if (state.my_action) {
    const a = state.my_action;
    const done =
      a.kind === "plant"
        ? `You planted evidence against ${players.find((p) => p.id === a.framed_player_id)?.name ?? "someone"} in the ${roomName(mystery, a.room_key)}.`
        : a.kind === "move"
          ? `You moved the body to the ${roomName(mystery, a.room_key)}.`
          : "You're lying low this act.";
    return (
      <section className="flex flex-col gap-2 rounded-2xl border-2 border-stone-300 bg-white px-5 py-4">
        <p className="text-sm font-medium uppercase tracking-widest text-stone-500">Private notebook</p>
        <p className="text-lg">{done}</p>
        <p className="text-sm text-stone-500">One secret move per act.</p>
      </section>
    );
  }

  const roomChoices = mystery.rooms.filter((r) => kind !== "move" || r.key !== state.body_room);
  const ready = kind === "lie_low" || (kind === "plant" ? roomKey && framed : roomKey);

  async function act() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("murderer_action", {
      p_room_id: roomId,
      p_kind: kind,
      p_room_key: kind === "lie_low" ? null : roomKey,
      p_framed_player_id: kind === "plant" ? framed : null,
    });
    if (error) setError(error.message);
    else track("mystery_murderer_action", { action: kind });
    onDone();
    setBusy(false);
  }

  const select = "h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-lg";
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-stone-300 bg-white px-5 py-4">
      <p className="text-sm font-medium uppercase tracking-widest text-stone-500">Private notebook</p>
      <p className="text-lg font-semibold">Your secret move this act</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["plant", "Plant evidence"],
            ["move", "Move the body"],
            ["lie_low", "Lie low"],
          ] as const
        )
          .filter(([k]) => k !== "move" || state.move_available)
          .map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setRoomKey("");
              }}
              className={`rounded-xl border-2 px-3 py-2 text-base ${
                kind === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"
              }`}
            >
              {label}
            </button>
          ))}
      </div>
      {kind !== "lie_low" && (
        <select value={roomKey} onChange={(e) => setRoomKey(e.target.value)} className={select}>
          <option value="">{kind === "move" ? "Move it to…" : "Plant it in…"}</option>
          {roomChoices.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      {kind === "plant" && (
        <select value={framed} onChange={(e) => setFramed(e.target.value)} className={select}>
          <option value="">Frame…</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <p className="text-sm text-stone-500">
        {kind === "plant"
          ? "If they search that room, they find evidence against who you picked."
          : kind === "move"
            ? "Once per game. Everyone will hear something being dragged."
            : "Do nothing this act."}
      </p>
      {error && <p className="text-base text-red-600">{error}</p>}
      <button type="button" onClick={act} disabled={!ready || busy} className={primaryButton}>
        {busy ? "…" : "Do it"}
      </button>
    </section>
  );
}

function UniverseVote({
  roomId,
  current,
  onVoted,
}: {
  roomId: string;
  current: string | null;
  onVoted: () => Promise<void>;
}) {
  // Shown right away on tap, before the database confirms.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voted = pending ?? current;

  async function vote(universeId: string) {
    setPending(universeId);
    setError(null);
    const { error } = await supabase.rpc("vote_universe", { p_room_id: roomId, p_universe_id: universeId });
    if (error) setError(error.message);
    else track("universe_vote_cast", { universe_id: universeId });
    await onVoted();
    setPending(null);
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <h1 className="text-3xl font-semibold">Vote for a universe</h1>
        <p className="mt-1 text-lg text-stone-600">
          {voted ? "You can change your vote until the game starts." : "Tap the one you want to play."}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {UNIVERSES.map((u) => {
          const isVoted = u.id === voted;
          return (
            <li key={u.id}>
              <button
                onClick={() => vote(u.id)}
                aria-pressed={isVoted}
                className={`flex w-full items-start justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-left ${
                  isVoted ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"
                }`}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-widest opacity-60">{u.tone}</span>
                  <span className="text-2xl font-semibold">{u.title}</span>
                  <span className="text-base opacity-75">{u.tagline}</span>
                </span>
                {isVoted && <CheckIcon className="mt-1 h-7 w-7 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-lg text-red-600">{error}</p>}
      <p className="mt-auto text-center text-base text-stone-500">The game starts from the shared screen.</p>
    </div>
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
