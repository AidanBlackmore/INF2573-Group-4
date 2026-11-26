"use client";

// Marlowe Manor's onboarding on the phone, before the player picks a detective:
// 1. While the TV closes the guest book and plays the intro ("what's going on"), the phone says "Eyes on the TV".
// 2. "Have you played before?" Yes skips ahead; no starts the practice round.
// 3. The practice round: one hour of the night, step by step, on mock screens that look like
//    the real ones. A spotlight picks out each part and a speech box says what to do there.
// Nothing here talks to the database, and nobody else sees it (see lib/gathering/onboarding.ts).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FUSE_RULES, ROOM_SCENE, WIRE_HEX } from "@/lib/gathering/content";
import type { View } from "@/lib/gathering/game";
import { INTRO_MS, introAt, introStart, remember, seen } from "@/lib/gathering/onboarding";
import { track } from "@/lib/analytics";
import { Art, Avatar } from "../../_ui/bits";

export function ManorWelcome({ view, now, onDone }: { view: View; now: () => number; onDone: () => void }) {
  const roomId = view.room.id;
  // The guest book and then the intro play on the TV first (lib/gathering/onboarding.ts).
  const at = introStart(view);
  const [stage, setStage] = useState<"intro" | "ask" | "practice">(() =>
    seen("intro", roomId) !== null || now() - at >= INTRO_MS ? "ask" : "intro",
  );
  const [ms, setMs] = useState(() => now() - at);
  useEffect(() => {
    if (stage !== "intro") return;
    const id = setInterval(() => {
      const t = now() - at;
      setMs(t);
      if (introAt(t).done) {
        remember("intro", roomId, "watched");
        setStage("ask");
      }
    }, 250);
    return () => clearInterval(id);
  }, [stage, now, at, roomId]);

  const finish = (choice: "played" | "done" | "skipped") => {
    remember("practice", roomId, choice);
    onDone();
  };

  // The TV can jump ahead (Next, Skip), and the phone can't tell, so it doesn't claim which part is
  // showing: it carries on by itself when the intro would end, or when the player taps Continue.
  if (stage === "intro") {
    // Progress through the whole thing: the guest book, then the intro.
    const lead = at - new Date(view.room.phase_at).getTime();
    const done = Math.min(1, Math.max(0, (ms + lead) / (lead + INTRO_MS)));
    return (
      <div className="p-msg look-up">
        <div className="look-arrows" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <span className="p-eyebrow">{ms < 0 ? "The guest book" : "How tonight works"}</span>
        <h2>Eyes on the TV</h2>
        <p className="p-small">
          {ms < 0 ? "Your name is going into Lord Fenwick's visitors' book." : "The TV is telling the story."} Your phone carries on by itself when it&apos;s done.
        </p>
        <div className="intro-bar" aria-hidden>
          <i style={{ width: `${Math.round(done * 100)}%` }} />
        </div>
        <button
          className="p-btn2"
          onClick={() => {
            remember("intro", roomId, "skipped");
            setStage("ask");
          }}
        >
          Done on the TV? Continue
        </button>
      </div>
    );
  }

  if (stage === "ask") {
    return (
      <div className="ob played-before">
        <span className="p-eyebrow">Before you play</span>
        <Art name="sketch-candle" className="ask-art" />
        <h2>Practice round</h2>
        <p className="p-small">Learn how to play in one quick round: about 30 seconds, only on your phone.</p>
        <div className="spacer" />
        <button
          className="p-btn"
          onClick={() => {
            track("practice_choice", { room_id: roomId, played_before: false });
            setStage("practice");
          }}
        >
          Start practice
        </button>
        <button
          className="p-btn2 wide"
          onClick={() => {
            track("practice_choice", { room_id: roomId, played_before: true });
            finish("played");
          }}
        >
          I know how to play
        </button>
      </div>
    );
  }

  return (
    <Practice
      view={view}
      onEnd={(completed, step, seconds) => {
        track("practice_finished", { room_id: roomId, completed, step, steps: BEATS.length, seconds });
        finish(completed ? "done" : "skipped");
      }}
    />
  );
}

// ---------- the practice round ----------
// One hour of the night in five glances, about 30 seconds. Each step is one short line on the real
// screen; you learn by doing (open, cut, vote), and the steps you only need to see move on by
// themselves.

type Spot = "open" | "role" | "lock" | "note" | "picker";
type Screen = "envelope" | "role" | "lock" | "note" | "vote" | "end";
// `say`: the one line. `hint`: a few words more, if needed. `act`: what the player must do to go on.
// `auto`: steps without an action move on by themselves after this long (or on a tap).
type Beat = { screen: Screen; spot?: Spot; say: string; hint?: string; act?: "open" | "cut" | "vote"; auto?: number };

const BEATS: Beat[] = [
  { screen: "envelope", spot: "open", say: "Open your secret role", act: "open" },
  { screen: "role", spot: "role", say: "You're a detective", hint: "One of you is the murderer.", auto: 2600 },
  { screen: "lock", spot: "lock", say: "Cut the wire the rules say", hint: "In the game, your partner has the rules.", act: "cut" },
  { screen: "note", spot: "note", say: "Behind the lock: a clue", hint: "Half a note. Your partner has the rest.", auto: 3000 },
  { screen: "vote", spot: "picker", say: "Who's the murderer? Vote", act: "vote" },
  { screen: "end", say: "That's one round", hint: "Repeat till the murderer is caught." },
];

// The practice fuse box: blue, black, red, black. A red wire, the last isn't white, one blue: cut the first.
const WIRES = ["blue", "black", "red", "black"];
const RIGHT_WIRE = 0;
const SUSPECTS = [
  { name: "Colonel", pic: 2, color: "var(--player-2)" },
  { name: "Mrs Pike", pic: 3, color: "var(--player-3)" },
  { name: "Dr Vane", pic: 5, color: "var(--player-5)" },
];

function Practice({ view, onEnd }: { view: View; onEnd: (completed: boolean, step: number, seconds: number) => void }) {
  const [i, setI] = useState(0);
  const [miss, setMiss] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const spots = useRef(new Map<Spot, HTMLElement>());
  const spot = useCallback(
    (k: Spot) => (el: HTMLElement | null) => {
      if (el) spots.current.set(k, el);
      else spots.current.delete(k);
    },
    [],
  );
  const find = useCallback((k: Spot) => spots.current.get(k) ?? null, []);

  const beat = BEATS[i];
  const seconds = () => Math.round((Date.now() - started.current) / 1000);
  const next = useCallback(() => setI((n) => Math.min(n + 1, BEATS.length - 1)), []);
  const did = (what: Beat["act"]) => {
    if (beat.act === what) next();
  };
  // Steps with nothing to do move on by themselves.
  useEffect(() => {
    if (!BEATS[i].auto) return;
    const id = setTimeout(next, BEATS[i].auto);
    return () => clearTimeout(id);
  }, [i, next]);

  let body: ReactNode;
  if (beat.screen === "envelope") {
    body = (
      <div className="envelope-wrap">
        <span className="p-eyebrow">Your secret role</span>
        <div className="envelope">
          <i className="env-back" />
          <i className="env-flap" />
          <i className="env-front" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="env-seal" src="/figma/seal.png" alt="" />
        </div>
        <div className="spacer" />
        <button className="p-btn" ref={spot("open")} onClick={() => did("open")}>
          Open the envelope
        </button>
      </div>
    );
  } else if (beat.screen === "role") {
    body = (
      <div className="splash" onClick={next}>
        <span className="p-eyebrow">Your secret role</span>
        <div ref={spot("role")} className="spot-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="memory-art" src="/figma/sketch-candle.jpg" alt="" />
          <h2>You are a detective.</h2>
        </div>
      </div>
    );
  } else if (beat.screen === "lock") {
    body = (
      <div className="p-task" ref={spot("lock")}>
        <span className="where">Billiard Room with Hollis</span>
        <b>Fuse box</b>
        <div className="wires">
          {WIRES.map((c, k) => (
            <button
              key={k}
              className={`wire${miss && k !== RIGHT_WIRE ? " missed" : ""}`}
              aria-label={`Cut wire ${k + 1}, ${c}`}
              onClick={() => {
                if (k === RIGHT_WIRE) did("cut");
                else setMiss(true);
              }}
            >
              <b>{k + 1}</b>
              <i style={{ background: WIRE_HEX[c] }} />
              <span>{c}</span>
              <span>Cut</span>
            </button>
          ))}
        </div>
        {miss && <div className="err">Not that one. First rule that fits wins.</div>}
        <ol className="rules">
          {FUSE_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
    );
  } else if (beat.screen === "note") {
    body = (
      <div className="p-task opened" onClick={next}>
        <div className="room-scene" style={{ backgroundImage: `url(/figma/${ROOM_SCENE.billiards}.jpg)` }}>
          <span>Billiard Room</span>
        </div>
        <Art name="clue-letter" className="corner" />
        <q ref={spot("note")}>…the murderer&apos;s biggest fear is: “Pige…</q>
      </div>
    );
  } else if (beat.screen === "vote") {
    body = (
      <div ref={spot("picker")} className="spot-box">
        <q className="vote-clue">The murderer&apos;s biggest fear: “Pigeons”</q>
        <div className="picker">
          {SUSPECTS.map((x) => (
            <button key={x.name} className={`pick${pick === x.name ? " mine" : ""}`} aria-pressed={pick === x.name} onClick={() => setPick(x.name)}>
              <Avatar view={view} player={undefined} portrait={x.pic} label={x.name} color={x.color} size="sm" />
            </button>
          ))}
        </div>
        <button className="p-btn" disabled={!pick} onClick={() => did("vote")}>
          Vote
        </button>
      </div>
    );
  } else {
    body = (
      <div className="p-msg practice-end">
        <span className="p-eyebrow">Practice done</span>
        <h2>That&apos;s one round</h2>
        <ul className="practice-recap">
          <li><b>Role</b> on your phone</li>
          <li><b>Lock</b> with a partner</li>
          <li><b>Clues</b> and a <b>vote</b> on the TV</li>
        </ul>
        <div className="spacer" />
        <button className="p-btn" onClick={() => onEnd(true, i + 1, seconds())}>
          Let&apos;s play
        </button>
      </div>
    );
  }

  return (
    <div className="practice">
      <div className="practice-head">
        <span className="p-eyebrow">Practice</span>
        <div className="practice-dots" aria-label={`Step ${i + 1} of ${BEATS.length}`}>
          {BEATS.map((_, k) => (
            <i key={k} className={k < i ? "past" : k === i ? "on" : ""} />
          ))}
        </div>
      </div>
      {body}
      {beat.screen !== "end" && <Coach target={beat.spot ?? null} find={find} beat={beat} step={i} onNext={next} onSkip={() => onEnd(false, i + 1, seconds())} />}
    </div>
  );
}

// ---------- the spotlight and its line ----------

type Box = { x: number; y: number; w: number; h: number; vw: number; vh: number };

// Dims the screen except around the spotlit part, which stays tappable, and puts one short line
// beside it. Rendered into <body>: the phone's paper card has a CSS filter, which would trap fixed
// elements. The practice's Skip stays above the shade.
function Coach({ target, find, beat, step, onNext, onSkip }: {
  target: Spot | null; find: (k: Spot) => HTMLElement | null; beat: Beat; step: number; onNext: () => void; onSkip: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (target) find(target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target, find, step]);
  useEffect(() => {
    let raf = 0, last = "";
    const loop = () => {
      const r = target ? find(target)?.getBoundingClientRect() : undefined;
      const b = r ? { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight } : null;
      const k = b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)},${b.vw},${b.vh}` : "none";
      if (k !== last) {
        last = k;
        setBox(b);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, find]);
  if (!mounted) return null;

  const pad = 8;
  const hole = box && { l: box.x - pad, t: box.y - pad, r: box.x + box.w + pad, b: box.y + box.h + pad };
  // The shade blocks taps everywhere except the hole (clip-path with an even-odd cut-out).
  const shade: CSSProperties = hole
    ? { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole.l}px ${hole.t}px, ${hole.r}px ${hole.t}px, ${hole.r}px ${hole.b}px, ${hole.l}px ${hole.b}px, ${hole.l}px ${hole.t}px)` }
    : {};
  // The line goes above the spotlight if there's room (where the eye starts), otherwise below.
  let place: CSSProperties = {};
  if (box && hole) {
    if (hole.t >= 120) place = { bottom: box.vh - hole.t + 12 };
    else place = { top: hole.b + 12 };
  }
  return createPortal(
    <div className="gathering coach" data-side={hole ? "spot" : "middle"}>
      <div className="coach-shade" style={shade} onClick={beat.auto ? onNext : undefined} />
      <button className="coach-skip-top" onClick={onSkip}>
        Skip practice
      </button>
      {hole && <div className="coach-ring" style={{ left: hole.l, top: hole.t, width: hole.r - hole.l, height: hole.b - hole.t }} />}
      <div className="coach-box" style={place} role="status" aria-live="polite" key={step} onClick={beat.auto ? onNext : undefined}>
        <b>{beat.say}</b>
        {beat.hint && <p>{beat.hint}</p>}
        {beat.auto ? <i className="coach-timer" style={{ animationDuration: `${beat.auto}ms` }} /> : <span className="coach-tap">{beat.act === "vote" ? "Pick one, then Vote" : beat.act === "cut" ? "Tap a wire" : "Tap it"}</span>}
      </div>
    </div>,
    document.body,
  );
}
