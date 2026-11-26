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
import { Art, Avatar, KnifeSvg, Ring } from "../../_ui/bits";

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
        <span className="p-eyebrow">Before you pick your detective</span>
        <Art name="sketch-candle" className="ask-art" />
        <h2>Have you played Murder at Marlowe Manor before?</h2>
        <p className="p-small">
          New here? Take a two-minute practice round: one hour of the night, step by step. Nothing in it counts, and nobody else sees it.
        </p>
        <div className="spacer" />
        <button
          className="p-btn"
          onClick={() => {
            track("practice_choice", { room_id: roomId, played_before: false });
            setStage("practice");
          }}
        >
          No, show me how
        </button>
        <button
          className="p-btn2 wide"
          onClick={() => {
            track("practice_choice", { room_id: roomId, played_before: true });
            finish("played");
          }}
        >
          Yes, skip the practice
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

type Spot = "envelope" | "open" | "role" | "gotit" | "ring" | "where" | "wires" | "manual" | "lock" | "note" | "label" | "locks" | "meeting" | "picker" | "ghost" | "killer";
type Screen = "envelope" | "role" | "lock" | "note" | "meeting" | "vote" | "after";
// One speech box. `spot`: what the spotlight picks out (none: a box in the middle).
// `act`: the player has to do it (open, tap, cut, vote) before the practice goes on.
type Beat = { screen: Screen; spot?: Spot; title: string; text: string; act?: string; next?: string };

const BEATS: Beat[] = [
  { screen: "envelope", title: "Practice round", text: "Let's walk through one hour of the night together. Nothing here counts, and nobody else can see it.", next: "Start" },
  { screen: "envelope", spot: "envelope", title: "1 · Your secret role", text: "When the night starts, a sealed envelope arrives on your phone. Your role is inside. Shield your screen." },
  { screen: "envelope", spot: "open", title: "Open it", text: "Tap the button to break the seal.", act: "Open the envelope" },
  { screen: "role", spot: "role", title: "Detective or murderer", text: "Everyone is a detective except one person: the murderer. Only they know it. In this practice you're a detective." },
  { screen: "role", spot: "gotit", title: "Tap “Got it”", text: "The night starts once everyone has read their role. Keep a straight face.", act: "Got it" },
  { screen: "lock", spot: "ring", title: "2 · Each round is an hour", text: "Rounds run from nine o'clock to dawn. Each has a two-minute timer. The TV shows it too." },
  { screen: "lock", spot: "where", title: "Find your partner", text: "Every round you get a partner (new ones each time) and a room of the house. Go and sit with them." },
  { screen: "lock", spot: "wires", title: "Open the lock together", text: "Your pair opens a lock. This one is the fuse box: one phone sees the wires…" },
  { screen: "lock", spot: "manual", title: "…the other has the manual", text: "So you have to talk: one describes the wires, the other reads out the rules. In practice you get both." },
  { screen: "lock", spot: "lock", title: "Your turn", text: "Go through the manual from the top and cut the right wire.", act: "Cut the right wire" },
  { screen: "note", spot: "note", title: "3 · Behind every lock: a torn note", text: "You get half of the note. Your partner has the other half. You'll read both halves out at the meeting." },
  { screen: "note", spot: "label", title: "Whose note is it?", text: "Every answer from the start is a note somewhere in the house. A note in the murderer's handwriting is a clue." },
  { screen: "note", spot: "locks", title: "Other locks", text: "Next round you might get a different lock. Each one needs both of you." },
  { screen: "meeting", spot: "meeting", title: "4 · The meeting", text: "When a clue turns up (or someone dies), everyone meets. The TV shows the notes. Who does it sound like? If it sounds like you, say why it isn't." },
  { screen: "vote", spot: "picker", title: "5 · Vote", text: "Then everyone votes on their phone. Pick a suspect (or skip), then tap Vote.", act: "Vote" },
  { screen: "after", spot: "ghost", title: "Ghosts", text: "If you're killed or voted out, you become a ghost. You still open locks with your partner, but you can't vote." },
  { screen: "after", spot: "killer", title: "If you're the murderer", text: "Read your half of a note differently, forge one fake note, and strike someone in even rounds. Don't get caught." },
  { screen: "after", title: "That's one hour", text: "Rounds repeat until the detectives vote out the murderer, or only one detective is left. Now pick your detective and answer three questions.", next: "I'm ready" },
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
  const [miss, setMiss] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  // The parts the spotlight can pick out, by name (callback refs, read by the Coach in its effects).
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
  const next = () => (i + 1 < BEATS.length ? setI(i + 1) : onEnd(true, i + 1, seconds()));
  // An action only moves things on when it's the step that asks for it.
  const did = (what: string) => {
    if (beat.act === what) next();
  };
  const me = view.players.find((p) => p.id === view.me);

  let body: ReactNode;
  if (beat.screen === "envelope") {
    body = (
      <div className="envelope-wrap">
        <span className="p-eyebrow">Your secret role</span>
        <div className="envelope" ref={spot("envelope")}>
          <i className="env-back" />
          <i className="env-flap" />
          <i className="env-front" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="env-seal" src="/figma/seal.png" alt="" />
        </div>
        <p className="p-small">Your role is sealed inside. Shield your screen.</p>
        <div className="spacer" />
        <button className="p-btn" ref={spot("open")} onClick={() => did("Open the envelope")}>
          Open the envelope
        </button>
      </div>
    );
  } else if (beat.screen === "role") {
    body = (
      <div className="splash">
        <span className="p-eyebrow">Your secret role · practice</span>
        <div ref={spot("role")} className="spot-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="memory-art" src="/figma/sketch-candle.jpg" alt="" />
          <h2>You are a detective.</h2>
          <p>You didn&apos;t kill Lord Fenwick, but someone here did.</p>
        </div>
        <div className="spacer" />
        <button className="p-btn" ref={spot("gotit")} onClick={() => did("Got it")}>
          Got it
        </button>
      </div>
    );
  } else if (beat.screen === "lock") {
    body = (
      <>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="p-eyebrow">Round 1 · Investigate</span>
          <span ref={spot("ring")}>
            <Ring left={114} total={120} />
          </span>
        </div>
        <div className="p-task" ref={spot("lock")}>
          <span className="where" ref={spot("where")}>
            Billiard Room with Hollis
          </span>
          <b>Fuse box</b>
          <span>Cut one wire, counted from the top.</span>
          <div className="wires" ref={spot("wires")}>
            {WIRES.map((c, k) => (
              <button
                key={k}
                className={`wire${miss === k ? " missed" : ""}`}
                aria-label={`Cut wire ${k + 1}, ${c}`}
                onClick={() => {
                  if (beat.act !== "Cut the right wire") return;
                  if (k === RIGHT_WIRE) {
                    setMiss(null);
                    next();
                  } else setMiss(k);
                }}
              >
                <b>{k + 1}</b>
                <i style={{ background: WIRE_HEX[c] }} />
                <span>{c}</span>
                <span>Cut</span>
              </button>
            ))}
          </div>
          {miss !== null && <div className="err">Not that one. Go through the manual from the top: the first rule that fits wins.</div>}
          <span className="p-small">Hollis has the manual. In practice, you can see it too:</span>
          <ol className="rules" ref={spot("manual")}>
            {FUSE_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </>
    );
  } else if (beat.screen === "note") {
    body = (
      <>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="p-eyebrow">Round 1 · Investigate</span>
          <Ring left={71} total={120} />
        </div>
        <div className="p-task opened">
          <div className="room-scene" style={{ backgroundImage: `url(/figma/${ROOM_SCENE.billiards}.jpg)` }}>
            <span>Billiard Room</span>
          </div>
          <span className="where">Billiard Room with Hollis</span>
          <Art name="clue-letter" className="corner" />
          <span ref={spot("label")}>Open! Your half of a note in the murderer&apos;s handwriting:</span>
          <q ref={spot("note")}>…the murderer&apos;s most irrational fear is: “Pige…</q>
          <span className="p-small">Hollis has the other half. Everyone reads it together at the meeting.</span>
        </div>
        <div className="p-task lock-kinds" ref={spot("locks")}>
          <span className="p-eyebrow">The locks</span>
          <ul>
            <li><b>Fuse box.</b> One sees the wires, one has the manual.</li>
            <li><b>Charades.</b> One acts it out, one types the guess.</li>
            <li><b>Sketch.</b> One draws, one types the guess.</li>
            <li><b>Two truths and a lie.</b> Tell three things about you; they spot the lie.</li>
          </ul>
        </div>
      </>
    );
  } else if (beat.screen === "meeting") {
    body = (
      <>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="p-eyebrow">Round 1 · Discussion</span>
          <Ring left={96} total={120} />
        </div>
        <div ref={spot("meeting")} className="spot-box">
          <h2>Who do you think this describes?</h2>
          <div className="p-task">
            <Art name="clue-letter" className="corner" />
            <q>It says the murderer&apos;s most irrational fear is: “Pigeons, honestly”.</q>
          </div>
        </div>
        <p className="p-small">Talk it over. Voting opens when the timer runs out.</p>
      </>
    );
  } else if (beat.screen === "vote") {
    body = (
      <>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="p-eyebrow">Round 1 · Meeting</span>
          <Ring left={88} total={120} />
        </div>
        <div ref={spot("picker")} className="spot-box">
          <h2>Who do you vote out?</h2>
          <div className="picker">
            {SUSPECTS.map((s) => (
              <button key={s.name} className={`pick${pick === s.name ? " mine" : ""}`} aria-pressed={pick === s.name} onClick={() => setPick(s.name)}>
                <Avatar view={view} player={undefined} portrait={s.pic} label={s.name} color={s.color} size="sm" />
                <span className="who">{pick === s.name ? "Your vote" : ""}</span>
              </button>
            ))}
          </div>
          <button className={`p-btn2 skipvote${pick === "skip" ? " on" : ""}`} aria-pressed={pick === "skip"} onClick={() => setPick("skip")}>
            Skip vote
          </button>
          <button className="p-btn" disabled={!pick} onClick={() => did("Vote")}>
            Vote
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <span className="p-eyebrow">After the vote</span>
        <h2>{pick === "skip" || !pick ? "You skipped." : `You voted for ${pick}.`}</h2>
        <p className="p-small">Whoever gets the most votes is locked in the wine cellar. If it was the murderer, the detectives win.</p>
        <div className="ghost-note" ref={spot("ghost")}>
          <Art name="clue-footprint" />
          <span>You&apos;re a ghost. Keep opening locks, but you can&apos;t vote.</span>
        </div>
        <div className="p-task killer-tips" ref={spot("killer")}>
          <div className="memory-art knife small">
            <KnifeSvg />
          </div>
          <div>
            <b>The murderer&apos;s moves</b>
            <ul>
              <li>Read your half differently.</li>
              <li>Forge a note, once.</li>
              <li>Strike in even rounds.</li>
            </ul>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="practice">
      <div className="practice-head">
        <span className="p-eyebrow">Practice{me?.name ? ` · ${me.name}` : ""}</span>
        <span className="practice-count">
          {i + 1} / {BEATS.length}
        </span>
      </div>
      <div className="practice-bar" aria-hidden>
        <i style={{ width: `${Math.round(((i + 1) / BEATS.length) * 100)}%` }} />
      </div>
      {body}
      <Coach
        target={beat.spot ?? null}
        find={find}
        title={beat.title}
        text={beat.text}
        act={beat.act}
        nextLabel={beat.next ?? "Next"}
        onNext={next}
        onBack={i > 0 && !BEATS[i - 1].act ? () => setI(i - 1) : undefined}
        onSkip={i + 1 < BEATS.length ? () => onEnd(false, i + 1, seconds()) : undefined}
      />
    </div>
  );
}

// ---------- the spotlight and its speech box ----------

type Box = { x: number; y: number; w: number; h: number; vw: number; vh: number };

// Dims the screen except around `target()`, which stays tappable, and puts a speech box beside it.
// Rendered into <body>: the phone's paper card has a CSS filter, which would trap fixed elements.
function Coach({ target, find, title, text, act, nextLabel, onNext, onBack, onSkip }: {
  target: Spot | null; find: (k: Spot) => HTMLElement | null; title: string; text: string; act?: string; nextLabel: string;
  onNext: () => void; onBack?: () => void; onSkip?: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Bring the spotlit part into view, then follow it (it can move as the page scrolls or settles).
  useEffect(() => {
    if (target) find(target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target, find, title]);
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
  // The speech box goes below the spotlight if there's room, otherwise above it.
  let place: CSSProperties = {};
  let side = "middle";
  if (box && hole) {
    const below = box.vh - hole.b, above = hole.t;
    if (below >= 190 || below >= above) {
      place = { top: Math.min(hole.b + 14, box.vh - 180) };
      side = "below";
    } else {
      place = { bottom: Math.min(box.vh - hole.t + 14, box.vh - 180) };
      side = "above";
    }
  }
  return createPortal(
    <div className="gathering coach" data-side={side}>
      <div className="coach-shade" style={shade} />
      {hole && <div className="coach-ring" style={{ left: hole.l, top: hole.t, width: hole.r - hole.l, height: hole.b - hole.t }} />}
      <div className="coach-box" style={place} role="dialog" aria-live="polite" aria-label={title}>
        <b>{title}</b>
        <p>{text}</p>
        {act && <span className="coach-try">Your turn: {act.toLowerCase()}</span>}
        <div className="coach-row">
          {onSkip && (
            <button className="coach-skip" onClick={onSkip}>
              Skip practice
            </button>
          )}
          <span className="spacer" />
          {onBack && (
            <button className="coach-back" onClick={onBack}>
              Back
            </button>
          )}
          {!act && (
            <button className="coach-next" onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
