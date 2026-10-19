"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  FUSE_RULES, QUESTIONS, ROOM_SCENE, STORIES, WIRE_HEX, chapterOf, halfText, names, noteText, roomName,
} from "@/lib/gathering/content";
import {
  TIMED, act, alive, clues, nameOf, playerOf, useAdvanceWhenDue, useGame, useSecondsLeft, type MyLock, type View,
} from "@/lib/gathering/game";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { Art, Avatar, KnifeSvg, Ring, Tag, colorOf, since } from "../../_ui/bits";

export default function PhoneScreen() {
  const params = useParams<{ code: string }>();
  const urlCode = decodeURIComponent(params.code ?? "").toUpperCase();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  // Already in this room (a refreshed or relocked phone)? Then skip the code step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureSignedIn();
        const { data: room } = await supabase.from("rooms").select("id").eq("code", urlCode).maybeSingle();
        if (room) {
          const { data: me } = await supabase.from("players").select("id").eq("room_id", room.id).eq("user_id", uid).maybeSingle();
          if (me && !cancelled) setRoomId(room.id);
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCode]);

  if (!checked) return <Page><div className="p-msg"><p className="p-small">Opening…</p></div></Page>;
  if (!roomId) {
    const joined = (id: string, code: string) => {
      // Typed a different code than the link had: keep the address in step, so a refresh rejoins.
      if (code !== urlCode) window.history.replaceState(null, "", `/play/${code}`);
      setRoomId(id);
    };
    return <Page><JoinStep initial={urlCode} onJoined={joined} /></Page>;
  }
  return <Joined roomId={roomId} />;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="gathering phone-page" data-world="shell">
      <div className="screen">{children}</div>
    </main>
  );
}

function Steps({ step, code }: { step: number; code?: string }) {
  return (
    <div className="ob-head">
      <span className="steps">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i === step ? "on" : i < step ? "past" : ""} />
        ))}
      </span>
      {code && <span className="ob-room">Room {code}</span>}
    </div>
  );
}

// Step 1: the room code from the TV.
export function JoinStep({ initial, onJoined }: { initial: string; onJoined: (roomId: string, code: string) => void }) {
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureSignedIn();
      const { data, error: err } = await supabase.rpc("join_room", { p_code: code.trim() });
      if (err) throw err;
      onJoined(data.room_id, code.trim().toUpperCase());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="ob" onSubmit={(e) => { e.preventDefault(); void join(); }}>
      <h2>Join the gathering</h2>
      <p className="p-small">Type the 5-letter code on the TV, or scan its QR code.</p>
      <span className="p-eyebrow">Room code</span>
      <input className="code-boxes" maxLength={5} autoComplete="off" spellCheck={false} autoCapitalize="characters" aria-label="Room code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <p className="hand">It&apos;s on the right of the TV screen.</p>
      {error && <div className="err">{error}</div>}
      <div className="spacer" />
      <button className="p-btn" type="submit" disabled={busy || code.trim().length < 5}>
        Join
      </button>
    </form>
  );
}

function Joined({ roomId }: { roomId: string }) {
  const { view, error, reload, now } = useGame(roomId);
  const left = useSecondsLeft(view, now);
  useAdvanceWhenDue(view, left, reload);
  // Removed from the room: they joined but didn't finish before "We're in".
  if (error?.includes("not in this room")) return <Page><Msg title="Already started" text="This gathering started without you. Join the next one." /></Page>;
  if (!view) {
    return <Page><div className="p-msg"><p className="p-small">{error ?? "Opening…"}</p></div></Page>;
  }
  return <Phone view={view} reload={reload} left={left} />;
}

type Ctx = { view: View; left: number; run: (fn: string, args?: Record<string, unknown>) => Promise<boolean>; busy: boolean; error: string | null };

function Phone({ view, reload, left }: { view: View; reload: () => Promise<void>; left: number }) {
  const [busy, setBusy] = useState(false);
  const phase = view.room.phase;
  // Errors belong to the screen they happened on.
  const screenKey = `${phase}:${view.room.round}`;
  const [failure, setFailure] = useState<{ on: string; msg: string } | null>(null);
  const error = failure?.on === screenKey ? failure.msg : null;
  const run = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setFailure(null);
      try {
        await act(reload, fn, { p_room_id: view.room.id, ...args });
        return true;
      } catch (e) {
        setFailure({ on: screenKey, msg: errorMessage(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, view.room.id, screenKey],
  );
  const ctx: Ctx = { view, left, run, busy, error };
  const me = playerOf(view, view.me);
  const host = view.me !== null && view.me === view.host_player;

  let body: ReactNode;
  if (phase === "join") body = me?.joined ? <YoureIn ctx={ctx} /> : <NameAndColor ctx={ctx} />;
  else if (phase === "browse") body = <BrowsePhone ctx={ctx} />;
  else if (phase === "lobby") body = <Onboarding ctx={ctx} />;
  else if (phase === "roles") body = <Envelope ctx={ctx} />;
  else if (phase === "tasks") body = <TaskPhone ctx={ctx} />;
  else if (phase === "discuss") body = <DiscussPhone ctx={ctx} />;
  else if (phase === "meeting") body = <MeetingPhone ctx={ctx} />;
  else if (phase === "quiet") body = <Msg title="No vote this round" text="No murderer's notes turned up. Look at the TV." />;
  else if (phase === "tally") body = <Msg title="The votes are in" text="Look at the TV." />;
  else if (phase === "revealed") body = <Msg title="The verdict" text="Look at the TV." />;
  else {
    const won = view.outcome === "detectives", mine = view.role === "murderer";
    body = (
      <Msg
        title={won ? "The detectives win" : "The murderer wins"}
        text={`${mine ? (won ? "They caught you." : "You got away with it.") : `It was ${nameOf(view, view.murderer)}.`} Look at the TV and talk it over.`}
      />
    );
  }

  return (
    <main className="gathering phone-page" data-world={phase === "join" || phase === "browse" ? "shell" : "marlowe"}>
      <div className="screen">
        {(phase === "join" || phase === "browse") && (
          <div className="p-head">
            <span className="room">Room {view.room.code}</span>
            {me?.joined && (
              <span className="me">
                {me.name}
                {host ? " · host" : ""}
              </span>
            )}
          </div>
        )}
        {me?.name && phase !== "join" && phase !== "browse" && (
          <div className="p-head">
            <span className="me">
              <Avatar view={view} player={me} size="xs" />
              {me.name}
              {host ? " · host" : ""}
            </span>
          </div>
        )}
        {body}
        {phase !== "lobby" && phase !== "join" && error && <div className="err">{error}</div>}
        {host && <HostPanel ctx={ctx} />}
      </div>
    </main>
  );
}

function Msg({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-msg">
      <h2>{title}</h2>
      <p className="p-small">{text}</p>
    </div>
  );
}

function RoundHead({ ctx, label }: { ctx: Ctx; label: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="p-eyebrow">
        Round {ctx.view.room.round} · {label}
      </span>
      <Ring left={ctx.left} total={ctx.view.room.total_secs} />
    </div>
  );
}

// ---------- The Gathering: name and colour, then the stories ----------

// "What should we call you?" A name and one of six colours (faded = taken).
function NameAndColor({ ctx }: { ctx: Ctx }) {
  const { view, run, busy, error } = ctx;
  const me = playerOf(view, view.me)!;
  const [name, setName] = useState("");
  const owner = (k: number) => view.players.find((o) => o.id !== me.id && o.color === k);
  return (
    <form className="ob" onSubmit={(e) => { e.preventDefault(); void run("set_name_color", { p_name: name, p_color: me.color }); }}>
      <h2>What should we call you?</h2>
      <span className="p-eyebrow">Your name</span>
      <input className="name-line" maxLength={12} aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
      <span className="p-eyebrow">Pick a color</span>
      <div className="colors">
        {[1, 2, 3, 4, 5, 6].map((k) => {
          const mine = me.color === k, o = owner(k);
          return (
            <button
              key={k}
              type="button"
              className={`cpick pp${mine ? " mine" : ""}${o ? " taken" : ""}`}
              disabled={Boolean(o) || busy}
              aria-pressed={mine}
              aria-label={`Colour ${k}${o ? ", taken" : ""}`}
              onClick={() => void run("pick_color", { p_color: k })}
            >
              <i style={{ "--pc": `var(--player-${k})` } as CSSProperties} />
            </button>
          );
        })}
      </div>
      <p className="hand">Faded = taken</p>
      {error && <div className="err">{error}</div>}
      <div className="spacer" />
      <button className="p-btn" type="submit" disabled={busy || !name.trim() || !me.color}>
        I&apos;m in
      </button>
    </form>
  );
}

function YoureIn({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const me = playerOf(view, view.me)!;
  const n = view.players.filter((p) => p.joined).length;
  const host = view.me === view.host_player;
  return (
    <div className="p-msg">
      <div className="you-tag">
        <Tag view={view} player={me} />
      </div>
      <h2>You&apos;re in</h2>
      <p className="p-small">
        {n < 3
          ? `Waiting for more players: ${n} of 6, 3 needed.`
          : `When everyone's here, ${host ? "tap “We're in”" : `${nameOf(view, view.host_player)} taps “We're in”`}.`}{" "}
        Then we pick a story together.
      </p>
    </div>
  );
}

// Swipe through the stories (or tap the arrows). Every screen follows, and the host opens one.
function BrowsePhone({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const { focus, focus_dir: dir, focus_at } = view.room;
  const st = STORIES[focus] ?? STORIES[0];
  const host = view.me === view.host_player;
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (d: number) => void run("browse_story", { p_to: (focus + d + STORIES.length) % STORIES.length, p_dir: d });
  const style = { "--t": since(focus_at), "--dir": dir, "--hue": st.hue, "--tile": st.tile } as CSSProperties;
  return (
    <>
      <h2>Where are we going tonight?</h2>
      <p className="p-small">Swipe to browse. The TV follows along.</p>
      <div
        className="swipe"
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s0 = start.current;
          start.current = null;
          if (!s0) return;
          const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className={`s-card pp${st.coming ? " coming" : ""}`} style={style} key={`${focus}:${focus_at}`}>
          {st.coming ? (
            <>
              <div className="s-hole">?</div>
              <span className="s-tag" style={{ color: "#7a7a82" }}>
                Coming soon
              </span>
              <b>More stories</b>
              <span className="p-small">New worlds, same game.</span>
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={st.thumb} alt="" />
              <span className="s-tag">{st.line}</span>
              <b>{st.title}</b>
              <span className="p-small">{st.chips.slice(0, 2).join(" · ")}</span>
            </>
          )}
        </div>
      </div>
      <div className="s-nav">
        <button className="p-btn2" aria-label="Previous story" onClick={() => go(-1)}>
          ‹
        </button>
        <span className="dots">
          {STORIES.map((s, i) => (
            <i key={s.key} className={i === focus ? "on" : ""} />
          ))}
        </span>
        <button className="p-btn2" aria-label="Next story" onClick={() => go(1)}>
          ›
        </button>
      </div>
      <div className="spacer" />
      {host ? (
        st.open ? (
          <button className="p-btn story-go" style={{ "--hue": st.hue } as CSSProperties} disabled={busy} onClick={() => void run("enter_story")}>
            Enter this story
          </button>
        ) : (
          <button className="p-btn" disabled>
            {st.coming ? "Coming soon" : "Not open yet"}
          </button>
        )
      ) : (
        <p className="p-small">{nameOf(view, view.host_player)} opens the story when you&apos;re ready.</p>
      )}
    </>
  );
}

// ---------- inside Marlowe Manor: pick a detective, then three questions ----------

function Onboarding({ ctx }: { ctx: Ctx }) {
  const { view, run, busy, error } = ctx;
  const me = playerOf(view, view.me);
  if (!me) return null;
  if (me.answered) {
    return (
      <div className="p-msg">
        <h2>Answers locked in</h2>
        {view.my_answers?.map((a, i) => (
          <p className="p-small" key={i}>
            “{a.a}”
          </p>
        ))}
        <p className="p-small">Waiting for the game to start.</p>
      </div>
    );
  }
  if (!me.picked) return <WhoAreYou ctx={ctx} />;
  return <Questions view={view} run={run} busy={busy} error={error} />;
}

function WhoAreYou({ ctx }: { ctx: Ctx }) {
  const { view, run, busy, error } = ctx;
  const me = playerOf(view, view.me)!;
  const name = me.name ?? "";
  const owner = (k: number) => view.players.find((o) => o.id !== me.id && o.portrait === k);
  return (
    <form className="ob" onSubmit={(e) => { e.preventDefault(); void run("set_identity", { p_name: name, p_portrait: me.portrait }); }}>
      <Steps step={0} code={view.room.code} />
      <h2>Who are you tonight?</h2>
      <p className="p-small">
        You&apos;re <b>{name}</b> tonight. Pick the detective you&apos;ll play.
      </p>
      <span className="p-eyebrow">Pick a detective</span>
      <div className="picker">
        {[1, 2, 3, 4, 5, 6].map((k) => {
          const mine = me.portrait === k, o = owner(k);
          return (
            <button
              key={k}
              type="button"
              className={`pick${mine ? " mine" : ""}${o ? " taken" : ""}`}
              disabled={Boolean(o) || busy}
              aria-pressed={mine}
              onClick={() => void run("pick_portrait", { p_portrait: k })}
            >
              <Avatar view={view} player={o ?? me} portrait={k} size="sm" label={mine ? name || "You" : (o?.name ?? "Open")} color={mine ? colorOf(view, me.id) : o ? colorOf(view, o.id) : `var(--player-${k})`} />
              <span className="who">{mine ? "You" : o ? "Taken" : ""}</span>
            </button>
          );
        })}
      </div>
      {error && <div className="err">{error}</div>}
      <div className="spacer" />
      <button className="p-btn" type="submit" disabled={busy || !me.portrait}>
        That&apos;s me
      </button>
    </form>
  );
}

// Three random questions, kept across a refresh. Shuffle swaps one; answers are sent together at "Done".
function Questions({ view, run, busy, error }: { view: View; run: Ctx["run"]; busy: boolean; error: string | null }) {
  const key = `gathering:questions:${view.room.id}`;
  const [qs, setQs] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (Array.isArray(saved) && saved.length === 3) return saved;
    } catch {
      // Fresh questions below.
    }
    const pool = [...QUESTIONS.keys()].sort(() => Math.random() - 0.5);
    return pool.slice(0, 3);
  });
  const [answers, setAnswers] = useState(["", "", ""]);
  const [i, setI] = useState(0);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(qs));
    } catch {
      // Not saved; fine.
    }
  }, [key, qs]);

  const shuffle = () => {
    let n;
    do n = Math.floor(Math.random() * QUESTIONS.length);
    while (qs.includes(n));
    setQs(qs.map((q, j) => (j === i ? n : q)));
  };
  const nextQ = () => {
    if (!answers[i].trim()) return setLocal("Answer to continue.");
    setLocal(null);
    if (i < 2) return setI(i + 1);
    void run("submit_answers", { p_questions: qs.map((q) => QUESTIONS[q]), p_answers: answers.map((a) => a.trim()) });
  };
  return (
    <div className="ob">
      <Steps step={i + 1} code={view.room.code} />
      <h2>{QUESTIONS[qs[i]]}</h2>
      <p className="p-small">Only you see this. Your answer becomes a note hidden in the house.</p>
      <div className="answer-note">
        <span className="p-eyebrow">Your answer</span>
        <textarea
          key={i}
          maxLength={200}
          rows={3}
          placeholder="Type your answer..."
          aria-label="Your answer"
          value={answers[i]}
          onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
        />
      </div>
      {(local ?? error) && <div className="err">{local ?? error}</div>}
      <div className="spacer" />
      <div className="ob-row">
        <button className="p-btn2" type="button" onClick={shuffle}>
          Shuffle
        </button>
        <button className="p-btn" type="button" disabled={busy} onClick={nextQ}>
          {i === 2 ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ---------- roles: the sealed envelope ----------

function Envelope({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const me = playerOf(view, view.me)!;
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setAnimating(false), 1500);
    return () => clearTimeout(t);
  }, [animating]);

  if (!me.opened && !openedAt) {
    return (
      <div className="envelope-wrap">
        <span className="p-eyebrow">Your secret role</span>
        <div className="envelope">
          <i className="env-back" />
          <i className="env-flap" />
          <i className="env-front" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="env-seal" src="/figma/seal.png" alt="" />
        </div>
        <p className="p-small">Your role is sealed inside. Shield your screen.</p>
        <div className="spacer" />
        <button
          className="p-btn"
          onClick={() => {
            setOpenedAt(Date.now());
            setAnimating(true);
            void run("open_envelope");
          }}
        >
          Open the envelope
        </button>
      </div>
    );
  }
  if (me.ready) {
    const waiting = view.players.filter((p) => !p.ready).map((p) => p.name ?? "someone");
    return <Msg title="Ready" text={`Waiting for ${names(waiting)}. Keep a straight face.`} />;
  }
  const card = <RoleCard view={view} busy={busy} onGotIt={() => void run("got_it")} />;
  // The envelope opens once: the seal breaks, the flap lifts, the letter rises out and becomes the card.
  if (!animating) return <div className="role-reveal">{card}</div>;
  return (
    <div className="role-reveal anim" style={{ "--t": since(openedAt) } as CSSProperties}>
      <i className="rv rv-back" />
      <i className="rv rv-letter">
        <i />
        <i />
        <i />
      </i>
      <i className="rv rv-front" />
      <i className="rv rv-flap" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rv rv-seal" src="/figma/seal.png" alt="" />
      {card}
    </div>
  );
}

// The murderer's card looks the same as everyone else's.
function RoleCard({ view, busy, onGotIt }: { view: View; busy: boolean; onGotIt: () => void }) {
  const gotIt = (
    <>
      <div className="spacer" />
      <button className="p-btn" disabled={busy} onClick={onGotIt}>
        Got it
      </button>
    </>
  );
  if (view.role === "murderer") {
    return (
      <div className="splash killer">
        <span className="p-eyebrow">Your secret role</span>
        <div className="memory-art knife">
          <KnifeSvg />
        </div>
        <h2>You are the murderer.</h2>
        <p>Lord Fenwick knew your secrets. Make sure someone else takes the blame.</p>
        <b>How to throw them off</b>
        <ul>
          <li><b>Read your half differently.</b> Your partner can&apos;t see it.</li>
          <li><b>Forge a note, once.</b> A fake secret that sounds like someone else.</li>
          <li><b>Make up a story</b> if your secret comes up.</li>
          <li><b>Strike in even rounds.</b> Whoever was with them looks guilty.</li>
          <li><b>Fumble a lock,</b> carefully.</li>
        </ul>
        {gotIt}
      </div>
    );
  }
  return (
    <div className="splash">
      <span className="p-eyebrow">Your secret role</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="memory-art" src="/figma/sketch-candle.jpg" alt="" />
      <h2>You are a detective.</h2>
      <p>You didn&apos;t kill Lord Fenwick, but someone here did.</p>
      <b>How to catch them</b>
      <ul>
        <li><b>Open locks</b> with your partner.</li>
        <li><b>Find the torn notes.</b> Everyone reads them together at the meeting.</li>
        <li><b>Listen closely.</b> Real stories have details.</li>
        <li><b>Vote them out.</b> Killed or voted out? You become a ghost: you still open locks, but can&apos;t vote.</li>
      </ul>
      {gotIt}
    </div>
  );
}

// ---------- tasks: the lock, the note, the murderer's panel ----------

function TaskPhone({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const me = playerOf(view, view.me)!;
  const lock = view.lock;
  if (!lock) return <Msg title={chapterOf(view.room.round).time} text="Look at the TV." />;
  const others = lock.members.filter((m) => m !== me.id).map((m) => nameOf(view, m));
  return (
    <>
      <RoundHead ctx={ctx} label="Investigate" />
      {me.dead && (
        <div className="ghost-note">
          <Art name="clue-footprint" />
          <span>You&apos;re a ghost. Keep opening locks, but you can&apos;t vote.</span>
        </div>
      )}
      <div className={`p-task${lock.solved ? " opened" : ""}`}>
        {lock.solved && (
          <div className="room-scene" style={{ backgroundImage: `url(/figma/${ROOM_SCENE[lock.room] ?? "bg-lobby-entrance"}.jpg)` }}>
            <span>{roomName(lock.room)}</span>
          </div>
        )}
        <span className="where">
          {roomName(lock.room)} with {names(others)}
        </span>
        {!lock.solved ? (
          <LockPhone ctx={ctx} lock={lock} />
        ) : !lock.note ? (
          <span>Open! But it&apos;s empty.</span>
        ) : (
          <>
            <Art name="clue-letter" className="corner" />
            <span>Open! Your half of {lock.note.murderer ? "a note in the murderer's handwriting" : "an innocent person's note"}:</span>
            <q>{halfText(lock.note)}</q>
            <span className="p-small">{names(others)} has the other half. Everyone reads it together at the meeting.</span>
          </>
        )}
      </div>
      {view.secret && !me.dead && <MurdererPanel ctx={ctx} />}
    </>
  );
}

function LockPhone({ ctx, lock }: { ctx: Ctx; lock: MyLock }) {
  const { view, run, busy } = ctx;
  const me = view.me!;
  const partner = names(lock.members.filter((m) => m !== me).map((m) => nameOf(view, m)));
  const lead = nameOf(view, lock.lead);
  const msg = lock.msg ? <div className="err">{lock.msg}</div> : null;

  if (lock.lock_type === "charade" || lock.lock_type === "sketch") {
    const sketch = lock.lock_type === "sketch";
    if (me === lock.lead) {
      return (
        <>
          <b>{sketch ? "Sketch" : "Charades"}</b>
          <span>{sketch ? `Draw this for ${partner}. No letters.` : `Act this out for ${partner}. No talking, sounds or pointing.`}</span>
          <div className="secret">{lock.say}</div>
          {sketch ? (
            <>
              <SketchPad strokes={lock.strokes ?? []} onStroke={(pts) => void run("add_stroke", { p_points: pts })} />
              <div className="seg">
                <button disabled={busy} onClick={() => void run("clear_sketch")}>Clear</button>
                <button disabled={busy} onClick={() => void run("new_word")}>New one</button>
              </div>
            </>
          ) : (
            <>
              <span className="p-small">They type the answer on their phone.</span>
              <button className="p-btn2" disabled={busy} onClick={() => void run("new_word")}>
                New one
              </button>
            </>
          )}
          {msg}
        </>
      );
    }
    return (
      <>
        <b>{sketch ? "Sketch" : "Charades"}</b>
        <span>{lead} is {sketch ? "drawing" : "acting something out"}. Type your guess to unlock.</span>
        {sketch && <SketchPad strokes={lock.strokes ?? []} />}
        <GuessBox ctx={ctx} placeholder={sketch ? "What are they drawing?" : "What are they acting out?"} />
        {msg}
      </>
    );
  }

  if (lock.lock_type === "lie") {
    const guessers = names(lock.members.filter((m) => m !== lock.lead).map((m) => nameOf(view, m)));
    if (me === lock.lead) {
      return (
        <>
          <b>Two truths and a lie</b>
          {lock.lie == null ? (
            <>
              <span>Pick which one will be your lie:</span>
              <div className="seg">
                {[0, 1, 2].map((k) => (
                  <button key={k} disabled={busy} onClick={() => void run("choose_lie", { p_lie: k })}>
                    Number {k + 1}
                  </button>
                ))}
              </div>
              <span className="p-small">Ideas: a place, a food, a person, a skill.</span>
            </>
          ) : (
            <span>
              Tell {guessers} three things about you, in order. Number {lock.lie + 1} is the lie.
            </span>
          )}
          {msg}
        </>
      );
    }
    if (!lock.lie_set) {
      return (
        <>
          <b>Two truths and a lie</b>
          <span>{lead} will tell you three things. One is a lie.</span>
          {msg}
        </>
      );
    }
    return (
      <>
        <b>Two truths and a lie</b>
        <span>Ask questions{lock.members.length > 2 ? ", decide together" : ""}, then pick the lie.</span>
        <div className="seg">
          {[0, 1, 2].map((k) => (
            <button key={k} disabled={busy} onClick={() => void run("spot_lie", { p_pick: k })}>
              Number {k + 1}
            </button>
          ))}
        </div>
        {msg}
      </>
    );
  }

  // Fuse box: half the pair sees the wires, the other half the manual.
  if (lock.wires) {
    return (
      <>
        <b>Fuse box</b>
        <span>Cut one wire, counted from the top.</span>
        <div className="wires">
          {lock.wires.map((c, k) => (
            <button key={k} className="wire" disabled={busy} onClick={() => void run("cut_wire", { p_wire: k })} aria-label={`Cut wire ${k + 1}, ${c}`}>
              <b>{k + 1}</b>
              <i style={{ background: WIRE_HEX[c] }} />
              <span>{c}</span>
              <span>Cut</span>
            </button>
          ))}
        </div>
        <span className="p-small">{partner} has the manual.</span>
        {msg}
      </>
    );
  }
  return (
    <>
      <b>Fuse box</b>
      <span>The manual:</span>
      <ol className="rules">
        {FUSE_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <span className="p-small">Ask {partner} for the wire colours, then say which to cut.</span>
      {msg}
    </>
  );
}

function GuessBox({ ctx, placeholder }: { ctx: Ctx; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const guess = text;
        setText("");
        await ctx.run("guess_word", { p_guess: guess });
      }}
    >
      <input placeholder={placeholder} aria-label="Your guess" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="p-btn" type="submit" disabled={ctx.busy}>
        Unlock
      </button>
    </form>
  );
}

// Sketch lock: the artist draws; each finished stroke is saved so the partner sees it.
function SketchPad({ strokes, onStroke }: { strokes: number[][][]; onStroke?: (points: number[][]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pen = useRef<number[][] | null>(null);
  const [pending, setPending] = useState<number[][][]>([]);

  const paint = useCallback(() => {
    const cv = canvas.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    g.lineWidth = 4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1c1917";
    for (const st of [...strokes, ...pending, ...(pen.current ? [pen.current] : [])]) {
      if (!st.length) continue;
      g.beginPath();
      st.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (st.length === 1) g.lineTo(st[0][0] + 0.5, st[0][1]);
      g.stroke();
    }
  }, [strokes, pending]);
  useEffect(paint, [paint]);
  // Strokes the server has saved replace the ones still on their way.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciling with the server's copy
  useEffect(() => setPending([]), [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 300 * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * 200 * 10) / 10];
  };
  return (
    <canvas
      ref={canvas}
      className={`sketch${onStroke ? " draw" : ""}`}
      width={300}
      height={200}
      aria-label={onStroke ? "Drawing pad" : "Your partner's drawing"}
      onPointerDown={(e) => {
        if (!onStroke) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pen.current = [point(e)];
        paint();
      }}
      onPointerMove={(e) => {
        if (!pen.current) return;
        pen.current.push(point(e));
        paint();
      }}
      onPointerUp={() => {
        const done = pen.current;
        pen.current = null;
        if (!done || !onStroke) return;
        setPending((p) => [...p, done]);
        onStroke(done.slice(0, 600));
      }}
    />
  );
}

// Only the murderer sees this, under their lock: forge a note once, strike in even rounds.
function MurdererPanel({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const secret = view.secret!;
  const [q, setQ] = useState(secret.questions[0] ?? "");
  const [fake, setFake] = useState("");
  const [target, setTarget] = useState("");
  const someone = view.players.find((p) => p.id !== view.me)?.name ?? "someone";
  return (
    <>
      {secret.forged ? (
        <div className="book">
          <Art name="clue-letter-opener" className="corner" />
          <span className="p-eyebrow">Only you see this</span>
          <span>
            Your forged note: “{secret.forged.a}”{secret.forged.found ? " It's been found." : " It'll turn up later."}
          </span>
        </div>
      ) : (
        <form
          className="book"
          onSubmit={(e) => {
            e.preventDefault();
            void run("forge_note", { p_question: q, p_answer: fake });
          }}
        >
          <Art name="clue-letter-opener" className="corner" />
          <span className="p-eyebrow">Only you see this</span>
          <b>Forge a note</b>
          <span className="p-small">A fake secret that sounds like someone else. It&apos;ll be found as yours.</span>
          <select value={q} onChange={(e) => setQ(e.target.value)} aria-label="Which question the fake answers">
            {secret.questions.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <textarea maxLength={200} rows={2} placeholder={`Something that sounds like ${someone}…`} value={fake} onChange={(e) => setFake(e.target.value)} />
          <button className="p-btn2" type="submit" disabled={busy || !fake.trim()}>
            Hide the forged note
          </button>
        </form>
      )}
      {secret.can_kill &&
        (secret.kill_state !== "none" ? (
          <div className="book">
            <Art name="clue-footprint" className="corner" />
            <span className="p-eyebrow">Only you see this</span>
            <span>{secret.kill_state === "struck" ? `You struck ${nameOf(view, secret.kill_target)}.` : "You're waiting for a better moment."}</span>
          </div>
        ) : (
          <div className="book">
            <Art name="clue-footprint" className="corner" />
            <span className="p-eyebrow">Only you see this</span>
            <b>Strike someone this round?</b>
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Who to strike">
              <option value="">Choose…</option>
              {alive(view)
                .filter((o) => o.id !== view.me)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            <div className="seg">
              <button disabled={busy || !target} onClick={() => void run("strike", { p_target: target })}>
                Strike
              </button>
              <button disabled={busy} onClick={() => void run("strike", { p_target: null })}>
                Wait
              </button>
            </div>
          </div>
        ))}
    </>
  );
}

// ---------- discussion and vote ----------

function DiscussPhone({ ctx }: { ctx: Ctx }) {
  const c = clues(ctx.view);
  return (
    <>
      <RoundHead ctx={ctx} label="Discussion" />
      <h2>Who do you think this describes?</h2>
      {c.length ? (
        c.map((f, i) => (
          <div className="p-task" key={i}>
            <Art name="clue-letter" className="corner" />
            <q>{noteText(f)}</q>
          </div>
        ))
      ) : (
        <p className="p-small">No murderer&apos;s notes yet. Who&apos;s been acting strangely?</p>
      )}
      <p className="p-small">Talk it over. Voting opens when the timer runs out.</p>
    </>
  );
}

function MeetingPhone({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const me = playerOf(view, view.me)!;
  const [pick, setPick] = useState<string | null>(null);
  const head = <RoundHead ctx={ctx} label="Meeting" />;
  if (me.dead) return <>{head}<Msg title="You're a ghost" text="Talk it through, but you can't vote." /></>;
  if (me.voted) return <>{head}<Msg title="Vote locked in" text="Waiting for everyone else." /></>;
  return (
    <>
      {head}
      <h2>Who do you vote out?</h2>
      <span className="p-eyebrow">Pick a suspect</span>
      <div className="picker vote">
        {alive(view).map((o) => {
          const on = pick === o.id;
          return (
            <button key={o.id} className={`pick${on ? " mine" : ""}`} aria-pressed={on} onClick={() => setPick(o.id)}>
              <Avatar view={view} player={o} size="sm" extra="" />
              <span className="who">{on ? "Your vote" : o.id === me.id ? "You" : ""}</span>
            </button>
          );
        })}
      </div>
      <button className={`p-btn2 skipvote${pick === "skip" ? " on" : ""}`} aria-pressed={pick === "skip"} onClick={() => setPick("skip")}>
        Skip vote
      </button>
      <div className="spacer" />
      <button className="p-btn" disabled={!pick || busy} onClick={() => void run("cast_vote", { p_target: pick })}>
        Vote
      </button>
    </>
  );
}

// ---------- host controls on the first player's phone ----------

function HostPanel({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const phase = view.room.phase;
  const allIn = view.players.length >= 3 && view.players.every((p) => p.picked && p.answered);
  const next = (label: string) => (
    <button disabled={busy} onClick={() => void run("host_next", { p_phase: phase })}>
      {label}
    </button>
  );
  const buttons: Partial<Record<string, ReactNode>> = {
    join: (
      <button disabled={busy || view.players.filter((p) => p.joined).length < 3} onClick={() => void run("we_are_in")}>
        We&apos;re in
      </button>
    ),
    lobby: (
      <button disabled={busy || !allIn} onClick={() => void run("start_game")}>
        Start the night
      </button>
    ),
    tasks: next("Call the meeting"),
    discuss: next("Start the vote"),
    meeting: next("Reveal the vote"),
    quiet: next("Next round"),
    tally: next(view.result?.ejected ? "Reveal the verdict" : "Continue"),
    revealed: next(view.result?.was_murderer ? "See the ending" : "Next round"),
    ended: (
      <>
        <button disabled={busy} onClick={() => void run("start_game")}>
          Play again
        </button>
        <button disabled={busy} onClick={() => void run("another_story")}>
          Another story
        </button>
      </>
    ),
  };
  const timed = TIMED.includes(phase);
  if (!timed && !buttons[phase]) return null;
  return (
    <div className="host">
      <Art name="clue-watch" />
      <div>
        <span className="p-eyebrow">Host controls</span>
        <div className="seg">
          {timed && (
            <button disabled={busy} onClick={() => void run("add_time")}>
              +1 minute
            </button>
          )}
          {buttons[phase]}
        </div>
      </div>
    </div>
  );
}
