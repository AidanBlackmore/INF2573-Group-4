"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { secondsSince, storyProps, track, winnerOf } from "@/lib/analytics";
import {
  BEATS, LOCK_NAME, MEET_PROMPTS, NARRATION, PROLOGUE, STORIES, TITLE, chapterOf, names, noteText, roomName, type Sky,
} from "@/lib/gathering/content";
import {
  TIMED, act, alive, clues, nameOf, playerOf, useAdvanceWhenDue, useGame, useSecondsLeft, useTbTick, type View,
} from "@/lib/gathering/game";
import { sound, type SoundSettings, type Track } from "@/lib/gathering/sound";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { Art, Avatar, Line, Ring, Tag, ageOf, colorOf, since } from "../_ui/bits";
import { HousePlan } from "../_ui/house";
import { Weather, type WeatherHandle } from "../_ui/weather";
import { TbBackdrop, TrappedTv, useTrappedTv } from "./trapped";

export default function TvScreen({ feedbackUrl }: { feedbackUrl: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  // Sign in, then open a new room: every load of the TV gets a fresh code and lobby.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSignedIn();
        if (cancelled) return;
        const { data, error } = await supabase.rpc("create_room");
        if (error) throw error;
        track("room_created", { room_id: data.id });
        if (!cancelled) setRoomId(data.id);
      } catch (e) {
        if (!cancelled) setFatal(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const newRoom = useCallback(async () => {
    const { data, error } = await supabase.rpc("create_room");
    if (error) return setFatal(error.message);
    track("room_created", { room_id: data.id });
    setRoomId(data.id);
  }, []);

  const { view, reload, now } = useGame(roomId);

  if (fatal) {
    return (
      <div className="gathering tv-page">
        <section className="tv" data-scene="lobby">
          <p className="big">Something went wrong.</p>
          <p className="muted">{fatal}</p>
        </section>
      </div>
    );
  }
  return view ? (
    <Tv view={view} reload={reload} now={now} onNewRoom={newRoom} feedbackUrl={feedbackUrl} />
  ) : (
    <div className="gathering tv-page">
      <section className="tv" data-scene="lobby">
        <p className="muted">Setting up The Gathering…</p>
      </section>
    </div>
  );
}

type TvProps = { view: View; reload: () => Promise<void>; now: () => number; onNewRoom: () => void; feedbackUrl: string | null };

function Tv({ view, reload, now, onNewRoom, feedbackUrl }: TvProps) {
  const { phase, round } = view.room;
  const left = useSecondsLeft(view, now);
  useAdvanceWhenDue(view, left, reload);
  useTbTick(view, now, reload);
  const tv = useRef<HTMLElement>(null);
  const weather = useRef<WeatherHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setError(null);
      try {
        await act(reload, fn, { p_room_id: view.room.id, ...args });
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [reload, view.room.id],
  );
  const next = () => run("host_next", { p_phase: phase });

  // Where we are: The Gathering's lobby, its story browser, or inside a story.
  const story = STORIES[view.room.focus] ?? STORIES[0];
  const deepSea = phase.startsWith("tb_");
  const world = phase === "join" ? "shell" : phase === "browse" ? "browse" : deepSea ? "deep" : "marlowe";
  const sky: Sky = phase === "join" ? "stars" : phase === "browse" ? story.sky : deepSea ? "bubbles" : "rain";
  const music: Track | null = world === "marlowe" ? "marlowe" : deepSea ? "deep" : phase === "browse" ? story.music : null;
  const trapped = useTrappedTv(view, now, tv);
  useSoundCues(view, left, weather, music, sky === "rain");
  const abandon = useAnalytics(view);
  const go = (to: number, dir: number) => void run("browse_story", { p_to: (to + STORIES.length) % STORIES.length, p_dir: dir });

  // Arrow keys browse the stories; Enter is the main button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (phase === "browse" && e.key === "ArrowRight") go(view.room.focus + 1, 1);
      else if (phase === "browse" && e.key === "ArrowLeft") go(view.room.focus - 1, -1);
      else if (phase === "browse" && e.key === "Enter" && story.open) void run("enter_story");
      else if (phase === "join" && e.key === "Enter") void run("we_are_in");
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // Stepping into a story: a flash and the title (1.8 s), then the manor fades up from black.
  const [, redraw] = useState(0);
  const entered = phase === "lobby" ? ageOf(view.room.phase_at) : Infinity;
  useEffect(() => {
    if (phase !== "lobby") return;
    const timers = [1800, 3300].map((ms) => setTimeout(() => redraw((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [phase, view.room.phase_at]);

  // The narrator reads this screen's lines once.
  useLayoutEffect(() => {
    const ids = phase === "lobby" ? [] : [...new Set([...(tv.current?.querySelectorAll<HTMLElement>("[data-line]") ?? [])].map((el) => el.dataset.line!))];
    sound().narrate(`${phase}:${round}:${ids.join("|")}`, ids);
  });

  const scene = phase === "discuss" && view.report ? "blackout" : phase;
  const deepScreen = () => <TrappedTv view={view} now={now} busy={busy} run={(fn, args) => void run(fn, args)} onAnother={() => run("another_story")} feedbackUrl={feedbackUrl} />;
  const screens: Record<string, () => React.ReactNode> = {
    tb_brief: deepScreen, tb_dive: deepScreen, tb_crew: deepScreen, tb_orders: deepScreen, tb_watch: deepScreen,
    tb_hands: deepScreen, tb_talk: deepScreen, tb_vote: deepScreen, tb_verdict: deepScreen, tb_end: deepScreen,
    join: () => <Join view={view} busy={busy} onGo={() => run("we_are_in")} />,
    browse: () => <Browse view={view} busy={busy} onGo={go} onEnter={() => run("enter_story")} />,
    lobby: () => <Lobby view={view} busy={busy} onStart={() => run("start_game")} />,
    roles: () => <Roles view={view} />,
    tasks: () => <Tasks view={view} busy={busy} onNext={next} />,
    quiet: () => <Quiet view={view} busy={busy} onNext={next} />,
    discuss: () => <Discuss view={view} busy={busy} onNext={next} />,
    meeting: () => <Meeting view={view} busy={busy} onNext={next} />,
    tally: () => <Tally view={view} busy={busy} onNext={next} />,
    revealed: () => <Revealed view={view} busy={busy} onNext={next} />,
    ended: () => <Ended view={view} busy={busy} onReplay={() => run("start_game")} onAnother={() => run("another_story")} feedbackUrl={feedbackUrl} />,
  };

  return (
    <div className="gathering tv-page">
      <SoundBar onNewRoom={() => { abandon("new_room"); onNewRoom(); }} />
      <section className={`tv${entered >= 1800 && entered < 3300 ? " arrive" : ""}`} data-scene={scene} data-world={world} ref={tv} aria-label="Shared TV screen">
        {deepSea && trapped.place && <TbBackdrop place={trapped.place} low={trapped.low} />}
        <Weather ref={weather} sky={sky} />
        {world === "marlowe" && (
          <div className="tv-head">
            <span>{TITLE}</span>
            <span className="code">
              Room <b>{view.room.code}</b>
            </span>
          </div>
        )}
        {screens[phase]()}
        {world === "marlowe" && <MarloweFocus view={view} />}
        {entered < 1800 && (
          <div className="entering" style={{ "--t": since(view.room.phase_at) } as CSSProperties}>
            <span>{TITLE}</span>
          </div>
        )}
        {error && <p className="report">{error}</p>}
        {TIMED.includes(phase) && <Ring left={left} total={view.room.total_secs} big />}
      </section>
    </div>
  );
}

// ---------- sound ----------

// Marlowe Manor's "look at your phone" tag: who should be on their phone right now. It appears when a
// phone needs its player and goes as soon as they're done (the murderer's secret moves are never shown).
function phoneNeeded(view: View): string[] {
  const p = view.room.phase;
  if (p === "lobby") return view.players.filter((x) => !x.picked || !x.answered).map((x) => x.id);
  if (p === "roles") return view.players.filter((x) => !x.ready).map((x) => x.id);
  if (p === "tasks") return [...new Set((view.pairs ?? []).filter((x) => !x.solved).flatMap((x) => x.members))];
  if (p === "meeting") return view.players.filter((x) => !x.dead && !x.voted).map((x) => x.id);
  return [];
}
function MarloweFocus({ view }: { view: View }) {
  const ids = phoneNeeded(view);
  if (!ids.length) return null;
  const names = ids.map((id) => view.players.find((x) => x.id === id)?.name ?? "Someone");
  const label = ids.length === view.players.length ? "Everyone" : names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0];
  return (
    <div className="m-focus" key={ids.join()} role="status">
      <span className="phicon" />
      <span>
        <b>Look at your phone</b>
        <br />
        {label}
      </span>
    </div>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg className="spk" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
      {off ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

function SoundBar({ onNewRoom }: { onNewRoom: () => void }) {
  const [s, setS] = useState<SoundSettings | null>(null);
  useEffect(() => sound().subscribe(setS), []);
  if (!s) return <div className="tv-bar" />;
  const set = (patch: Partial<SoundSettings>) => sound().set(patch);
  return (
    <div className="tv-bar" role="group" aria-label="Sound">
      <button className="tool" aria-pressed={s.narrator} onClick={() => set({ narrator: !s.narrator })}>
        {s.narrator ? "Narrator on" : "Narrator off"}
      </button>
      <button className="tool" aria-pressed={s.music} onClick={() => set({ music: !s.music })}>
        {s.music ? "Pause music" : "Play music"}
      </button>
      <button className="tool" aria-pressed={s.effects} onClick={() => set({ effects: !s.effects })}>
        {s.effects ? "Effects on" : "Effects off"}
      </button>
      {/* Mute silences everything the TV plays (music, narrator, effects); the slider is the master volume for all of it. */}
      <button className={`tool mute${s.muted ? " is-muted" : ""}`} aria-pressed={s.muted} aria-label={s.muted ? "Sound is muted. Unmute" : "Mute all sound"} onClick={() => set({ muted: !s.muted })}>
        <SpeakerIcon off={s.muted || s.volume === 0} />
        {s.muted ? "Muted: tap to unmute" : "Mute"}
      </button>
      <label className={`vol${s.muted ? " is-muted" : ""}`}>
        <span>Volume</span>
        <input type="range" min={0} max={100} step={5} value={s.volume} aria-label="Volume for music, narrator and effects" onInput={(e) => set({ volume: +e.currentTarget.value, muted: false })} onChange={(e) => set({ volume: +e.target.value, muted: false })} />
        <output>{s.muted ? "muted" : `${s.volume}%`}</output>
      </label>
      <button
        className="tool"
        onClick={() => {
          if (confirm("Start a new game with a new code? Everyone will need to join again.")) onNewRoom();
        }}
      >
        New game
      </button>
    </div>
  );
}

// What just happened? Play the matching sound.
function useSoundCues(view: View, left: number, weather: React.RefObject<WeatherHandle | null>, music: Track | null, stormy: boolean) {
  const { phase, round, focus } = view.room;
  const solved = view.pairs?.filter((p) => p.solved).length ?? 0;
  const last = useRef<{ key: string; solved: number } | null>(null);
  const lastBeat = useRef<number | null>(null);

  useEffect(() => {
    const s = sound();
    s.setScene(phase, music, stormy);
    s.flash = () => weather.current?.flash();
  }, [phase, music, stormy, weather]);

  // The story browser: a whoosh as each story slides in; arriving at the manor brings lightning.
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = phase === "browse" ? `${focus}:${view.room.focus_at}` : null;
    const prev = lastFocus.current;
    lastFocus.current = key;
    if (!key || prev === null || prev === key) return;
    const s = sound();
    s.whoosh(view.room.focus_dir);
    if (STORIES[focus]?.sky === "rain") {
      const t = setTimeout(() => {
        weather.current?.flash();
        s.thunder(0.7);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [phase, focus, view.room.focus_at, view.room.focus_dir, weather]);

  useEffect(() => {
    const s = sound();
    const key = `${phase}:${round}`;
    const prev = last.current;
    last.current = { key, solved };
    if (!prev) return; // first load: no sounds for a screen that was already showing
    if (prev.key !== key) {
      if (phase === "browse") s.whoosh(1);
      // Stepping into Marlowe Manor.
      if (phase === "lobby") {
        s.thunder(1);
        weather.current?.flash();
      }
      if (phase === "roles") {
        s.thunder(1);
        weather.current?.flash();
      }
      if (phase === "tasks") {
        setTimeout(() => s.chime(3), 900);
        // Eleven o'clock: "The dog won't stop barking."
        if (round === 3) setTimeout(() => s.bark(), 5200);
      }
      if (phase === "discuss" && view.report) {
        s.scream();
        setTimeout(() => s.sting(), 900);
      }
      if (phase === "revealed") s.gavel();
    } else if (phase === "tasks" && solved > prev.solved) {
      s.click();
    }
  }, [phase, round, solved, view.report, weather]);

  // Last 30 seconds: a light heartbeat, and a soft tick in the last 10.
  useEffect(() => {
    if (!TIMED.includes(phase) || left <= 0 || left > 30 || left === lastBeat.current) return;
    lastBeat.current = left;
    sound().heartbeat();
    if (left <= 10) setTimeout(() => sound().tick(), 500);
  }, [phase, left]);
}

// Group analytics come from the TV only, so each is counted once per room (see README).
// This hook sends the game-wide events for every story (same names and core properties,
// so stories can be compared) plus Marlowe Manor's own `marlowe_*` events.
// Trapped Below's own `trapped_*` events come from `useTrappedTv`.
// Returns `abandon`, for when the TV leaves a game before its ending.
// Roles are dealt in the first of these; the rest are the game itself. A game counts as
// started at the first of them the TV sees, so a TV that misses a screen still counts it.
const PLAY_PHASES = ["roles", "tasks", "quiet", "discuss", "meeting", "tally", "revealed", "tb_orders", "tb_watch", "tb_hands", "tb_talk", "tb_vote", "tb_verdict"];
const END_PHASES = ["ended", "tb_end"];
const minutesSince = (ms: number) => Math.round(secondsSince(ms) / 6) / 10;

function useAnalytics(view: View) {
  const { phase, round, id, focus } = view.room;
  const story = phase.startsWith("tb_") ? "station" : phase === "join" || phase === "browse" ? null : (view.room.story ?? STORIES[focus]?.key ?? null);
  const players = view.players.length;
  const last = useRef<{ phase: string; round: number; focus: number; story: string | null } | null>(null);
  const opened = useRef<Set<string>>(new Set());
  // When each stage began, for durations; how much the group browsed; and how many games this room has played.
  const since = useRef({ room: 0, phase: 0, setup: 0, game: 0, viewed: new Set<string>(), games: 0, stories: new Set<string>() });
  useEffect(() => {
    since.current.room = since.current.phase = Date.now();
  }, []);
  const taskDeadline = useRef<number | null>(null);
  const live = useRef({ phase, round, players, id, story });
  useEffect(() => {
    live.current = { phase, round, players, id, story };
  });

  useEffect(() => {
    const t = since.current;
    for (const p of view.pairs ?? []) {
      const k = `${round}:${p.idx}`;
      if (phase === "tasks" && p.solved && !opened.current.has(k)) {
        opened.current.add(k);
        track("marlowe_lock_opened", { room_id: id, ...storyProps("marlowe"), round, lock_type: p.lock_type, tries: p.tries, pair_size: p.members.length, players, seconds: secondsSince(t.phase) });
      }
    }
    if (phase === "tasks" && view.room.deadline) taskDeadline.current = new Date(view.room.deadline).getTime();

    const prev = last.current;
    last.current = { phase, round, focus, story };
    if (!prev) return;
    const base = { room_id: id, round, players };
    // Swiping in the story browser: which stories catch the group's eye (Coming soon ones too).
    if (phase === "browse" && (prev.phase !== "browse" || prev.focus !== focus)) {
      const s = STORIES[focus];
      t.viewed.add(s?.key ?? String(focus));
      track("story_viewed", { room_id: id, players, ...storyProps(s?.key), playable: Boolean(s?.open), position: focus });
    }
    if (prev.phase === phase && prev.round === round) return;
    const stageSecs = secondsSince(t.phase);
    t.phase = Date.now();

    // ---------- game-wide (every story) ----------
    if (prev.phase === "join" && phase === "browse") track("lobby_completed", { ...base, lobby_seconds: secondsSince(t.room) });
    if (END_PHASES.includes(prev.phase)) {
      track("replay_chosen", { ...base, ...storyProps(prev.story), choice: phase === "browse" ? "another_story" : "same_story", games_played: t.games });
      if (phase === "browse") t.viewed = new Set([STORIES[focus]?.key ?? ""]);
      else t.setup = Date.now(); // same story again: setting up starts now
    }
    if (phase === "lobby" || phase === "tb_brief") {
      t.setup = Date.now();
      track("story_entered", { ...base, ...storyProps(story), browse_seconds: prev.phase === "browse" ? stageSecs : 0, stories_viewed: t.viewed.size });
      t.viewed = new Set();
    }
    if (PLAY_PHASES.includes(phase) && !t.game) {
      t.game = Date.now();
      t.games++;
      t.stories.add(story ?? "");
      opened.current.clear();
      track("game_started", {
        ...base,
        ...storyProps(story),
        has_traitor: phase.startsWith("tb_") ? Boolean(view.tb?.saboteur_mode) : true,
        setup_seconds: t.setup ? secondsSince(t.setup) : null, // story entered (or replay) to roles dealt: onboarding, portraits, questions
        game_number: t.games, // 1 = this room's first game, 2+ = played again
        stories_played: t.stories.size,
      });
    }
    if (END_PHASES.includes(phase)) {
      const outcome = phase === "ended" ? view.outcome : view.tb?.outcome;
      track("game_ended", {
        ...base,
        ...storyProps(story),
        outcome: outcome ?? null, // the story's own words: detectives/murderer, crew/saboteur
        winner: winnerOf(outcome), // the same words for every story: group or traitor
        has_traitor: phase === "ended" ? true : Boolean(view.tb?.saboteur_mode),
        rounds: round,
        minutes: t.game ? minutesSince(t.game) : null,
        game_number: t.games,
      });
    }

    // ---------- Murder at Marlowe Manor ----------
    const marlowe = { ...base, ...storyProps("marlowe") };
    if (phase === "tasks") track("marlowe_round_started", { ...marlowe, pairs: view.pairs?.length ?? 0 });
    if (prev.phase === "tasks" && (phase === "quiet" || phase === "discuss")) {
      const pairs = view.pairs ?? [];
      track("marlowe_round_ended", {
        ...marlowe,
        locks_opened: pairs.filter((p) => p.solved).length,
        locks_total: pairs.length,
        timed_out: taskDeadline.current !== null && Date.now() >= taskDeadline.current - 1500,
        seconds: stageSecs,
        murderer_notes: view.found?.filter((f) => f.round === round && f.murderer).length ?? 0,
        death: Boolean(view.report),
        meeting: phase === "discuss",
      });
    }
    if (phase === "revealed") {
      const counts = view.result?.counts ?? [];
      track("marlowe_vote_revealed", {
        ...marlowe,
        ejected: Boolean(view.result?.ejected),
        was_murderer: Boolean(view.result?.was_murderer),
        tie: Boolean(view.result?.tie),
        votes_cast: counts.reduce((n, c) => n + c.n, 0),
      });
    }
    if (phase === "ended") {
      track("marlowe_game_ended", {
        ...marlowe,
        outcome: view.outcome ?? null,
        winner: winnerOf(view.outcome),
        rounds: round,
        minutes: t.game ? minutesSince(t.game) : null,
        locks_opened: opened.current.size,
        survivors: alive(view).length,
      });
    }
    if (END_PHASES.includes(phase)) t.game = 0; // between games now
  });

  // The TV is closed or reloaded with a group still in the room.
  const abandon = useCallback((how: "closed" | "new_room") => {
    const { phase: at, round: r, players: n, id: roomId, story: s } = live.current;
    if (END_PHASES.includes(at) || n === 0) return;
    const t = since.current;
    track(
      "game_abandoned",
      { room_id: roomId, ...storyProps(s), round: r, players: n, phase: at, how, in_game: t.game > 0, games_played: t.games, minutes: minutesSince(t.game || t.room) },
      true,
    );
  }, []);
  useEffect(() => {
    const onLeave = () => abandon("closed");
    addEventListener("pagehide", onLeave);
    return () => removeEventListener("pagehide", onLeave);
  }, [abandon]);
  return abandon;
}

// ---------- screens ----------

type ScreenProps = { view: View; busy: boolean; onNext: () => void };

// Where phones join: the live site on Vercel, unless NEXT_PUBLIC_SITE_URL says otherwise (e.g. testing on a local network).
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://the-gatheringg.vercel.app").replace(/\/$/, "");

// The Gathering's lobby: scan the QR code (or go to the address) and type the code.
// Each guest arrives as the portrait drawn on their phone.
function Join({ view, busy, onGo }: { view: View; busy: boolean; onGo: () => void }) {
  const url = `${SITE_URL}/play/${view.room.code}`;
  const joined = view.players.filter((p) => p.joined);
  const n = joined.length;
  return (
    <div className="lobby2">
      <div className="title-plate pp">
        <h1>THE GATHERING</h1>
        <p>How well do you know your friends?</p>
      </div>
      <div className="lobby2-row">
        <div className="lobby2-left">
          <h2 className="shell-h">Grab your phone. Everyone in?</h2>
          <p className="shell-p">Join with the code, then we&apos;ll vote on which world to visit tonight.</p>
          <div className="guests">
            {joined.map((p, i) =>
              p.portrait_url ? (
                <figure key={p.id} className="guest" style={{ "--pc": colorOf(view, p.id), animationDelay: `${i * 0.05}s` } as CSSProperties}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.portrait_url} alt="" />
                  <figcaption>{p.name}</figcaption>
                </figure>
              ) : (
                <Tag key={p.id} view={view} player={p} style={{ animationDelay: `${i * 0.05}s` }} />
              ),
            )}
            {Array.from({ length: Math.max(0, 6 - n) }, (_, i) => (
              <span key={i} className="guest-open">
                Open seat
              </span>
            ))}
          </div>
          <div className="lobby-go">
            <button className="btn" disabled={busy || n < 3} onClick={onGo}>
              We&apos;re in
            </button>
            {n < 3 && <span>{n} of 6 · 3 needed to start</span>}
          </div>
        </div>
        <div className="join-card pp">
          <span className="lbl">Scan to join</span>
          <QRCodeSVG className="qr-svg" value={url} size={240} marginSize={2} bgColor="#ffffff" fgColor="#111113" title={`Scan to join: ${url}`} />
          <span className="url">
            or go to <b>{SITE_URL.replace(/^https?:\/\//, "")}/join</b>
          </span>
          <p className="bigcode">{view.room.code}</p>
        </div>
      </div>
    </div>
  );
}

// Title words rise in one at a time.
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}>
          <span className="w" style={{ animationDelay: `calc(var(--t) + ${(0.42 + i * 0.075).toFixed(3)}s)` }}>
            {w}
          </span>{" "}
        </span>
      ))}
    </>
  );
}

// The story browser: the story on screen fills the TV; the others wait in a strip.
// Anyone can swipe on their phone (or use the arrows here) and every screen follows.
function Browse({ view, busy, onGo, onEnter }: { view: View; busy: boolean; onGo: (to: number, dir: number) => void; onEnter: () => void }) {
  const { focus, focus_dir: dir, focus_at } = view.room;
  const st = STORIES[focus] ?? STORIES[0];
  // Remember the story that was showing, so it can slide away under the new one.
  const [shown, setShown] = useState<{ cur: number; prev: number | null }>({ cur: focus, prev: null });
  if (shown.cur !== focus) setShown({ cur: focus, prev: shown.cur });
  const fresh = ageOf(focus_at) < 1400;
  const side = shown.prev === null ? "first" : dir > 0 ? "r" : "l";
  const prev = fresh && shown.prev !== null ? STORIES[shown.prev] : null;
  const t = since(focus_at);
  // Load every story's picture up front, so a swipe never waits on one.
  useEffect(() => {
    for (const s of STORIES) if (s.bg) new Image().src = s.bg;
  }, []);
  // Each change mounts fresh layers (keyed by when it happened), so every swipe plays the crossfade.
  const bg = (s: (typeof STORIES)[number], cls: string, key: string) =>
    s.coming ? (
      <div key={key} className={`story-bg ${cls} coming`} />
    ) : (
      <div key={key} className={`story-bg ${cls}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.bg} alt="" />
      </div>
    );
  return (
    <>
      <div className="story-bgs" style={{ "--t": t, "--dir": dir, "--hue": st.hue } as CSSProperties}>
        {prev && bg(prev, "prev", `p${shown.prev}:${focus_at}`)}
        {bg(st, `cur ${side}`, `c${focus}:${focus_at}`)}
        <i className="story-shade" />
      </div>
      <div className="here">
        {view.players.map((p) => (
          <Tag key={p.id} view={view} player={p} />
        ))}
      </div>
      <div className="story-ui" style={{ "--t": t, "--dir": dir, "--hue": st.hue, "--sink": st.ink } as CSSProperties}>
        <div className="story-info" key={`${focus}:${focus_at}`}>
          <span className="s-tag">{st.tag}</span>
          <h2 className="s-title">
            <Words text={st.title} />
          </h2>
          <p className="s-desc">{st.desc}</p>
          {st.chips.length > 0 && (
            <div className="chips">
              {st.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
          {!st.coming && (
            <button className="btn" disabled={busy || !st.open} onClick={onEnter}>
              {st.open ? "Enter this story" : "Coming soon"}
            </button>
          )}
        </div>
        <div className="story-foot">
          <div className="strip">
            {STORIES.map((s, i) => (
              <button
                key={s.key}
                className={`thumb${i === focus ? " on" : ""}${s.coming ? " coming" : ""}`}
                style={{ "--hue": s.hue } as CSSProperties}
                aria-label={s.title}
                aria-pressed={i === focus}
                onClick={() => i !== focus && onGo(i, i > focus ? 1 : -1)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {!s.coming && <img src={s.thumb} alt="" />}
                <span>{s.short}</span>
              </button>
            ))}
          </div>
          <div className="browse-hint">
            <button aria-label="Previous story" onClick={() => onGo(focus - 1, -1)}>
              ‹
            </button>
            <button aria-label="Next story" onClick={() => onGo(focus + 1, 1)}>
              ›
            </button>
            <span>Browse stories</span>
          </div>
        </div>
      </div>
    </>
  );
}

// Inside Marlowe Manor: everyone picks a detective and answers three questions.
function Lobby({ view, busy, onStart }: { view: View; busy: boolean; onStart: () => void }) {
  const waiting = view.players.filter((p) => !p.picked || !p.answered);
  const ready = view.players.length >= 3 && waiting.length === 0;
  return (
    <div className="lobby-grid">
      <div>
        <span className="eyebrow">Pick your detective on your phone</span>
        <span className="eyebrow">Detectives ({view.players.length})</span>
        <div className="avatars">
          {view.players.map((p) => (
            <Avatar key={p.id} view={view} player={p} size="md" extra={p.picked && p.answered ? "done" : "waiting"} />
          ))}
        </div>
      </div>
      <div className="panel">
        <span className="tone">Murder mystery · 3–6 players · 20–30 min</span>
        <span className="t">{TITLE}</span>
        <p>Lord Fenwick invites you to his birthday dinner at Marlowe Manor. He likes to know his guests, so he has three questions for you.</p>
        <span className="tone ink">What to do</span>
        <p>Answer three questions on your phone. Your answers get hidden around the house, and one of you will be the murderer.</p>
        <div className="row">
          <button className="btn" disabled={!ready || busy} onClick={onStart}>
            Start the night
          </button>
          {waiting.length > 0 && <span className="hint">Waiting for {names(waiting.map((p) => p.name ?? "someone"))}.</span>}
        </div>
      </div>
    </div>
  );
}

function Roles({ view }: { view: View }) {
  return (
    <>
      <span className="eyebrow">The night of the murder</span>
      <div className="tv-grid">
        <div>
          <p className="chapter">{TITLE}</p>
          <Line id="prologue" text={PROLOGUE} />
        </div>
        <div>
          <p className="todo">
            <b>Look at your phone.</b> Shield the screen, read your secret role, then tap “Got it”.
          </p>
          <div className="avatars">
            {view.players.map((p) => (
              <Avatar key={p.id} view={view} player={p} size="md" extra={p.ready ? "done" : "waiting"} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Tasks({ view, busy, onNext }: ScreenProps) {
  const c = chapterOf(view.room.round);
  const pairs = view.pairs ?? [];
  const opened = pairs.filter((p) => p.solved).length;
  return (
    <>
      <span className="eyebrow">
        Round {view.room.round} · {c.time}
      </span>
      <div className="tv-grid">
        <div>
          <p className="chapter">{c.title}</p>
          <Line id={`round-${Math.min(view.room.round, 6)}`} text={c.text} />
          <p className="todo">
            <b>What to do:</b> go to your room with your partner. Open the lock together, then bring the note to the meeting.
          </p>
          <span className="muted">
            {opened} of {pairs.length} locks opened. The meeting starts when time runs out.
          </span>
          <div className="learned">
            {pairs.map((pr) => {
              const who = names(pr.members.map((m) => nameOf(view, m)));
              return (
                <div className="item" key={pr.idx}>
                  <span className="who">
                    {pr.members.map((m) => <Avatar key={m} view={view} player={playerOf(view, m)} size="xs" />)}
                  </span>
                  <b>{roomName(pr.room)}</b> · {names(pr.members.map((m) => nameOf(view, m) + (playerOf(view, m)?.dead ? " (ghost)" : "")))}
                  <span className="beat">
                    {who} {BEATS[pr.room]}…
                  </span>
                  <span className="q">
                    {pr.solved
                      ? "Opened"
                      : `Locked: ${LOCK_NAME[pr.lock_type]}${pr.tries ? ` · ${pr.tries} failed ${pr.tries === 1 ? "try" : "tries"}` : ""}`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={onNext}>
              Call the meeting
            </button>
          </div>
        </div>
        <div>
          <HousePlan view={view} />
        </div>
      </div>
    </>
  );
}

function ReportLine({ view }: { view: View }) {
  const r = view.report;
  if (!r) return null;
  return (
    <p className="report">
      {nameOf(view, r.victim)} was found dead in the {roomName(r.room)}. Last seen with {names(r.last_seen.map((m) => nameOf(view, m)))}.
    </p>
  );
}

function FoundCards({ view, round, reveal = false }: { view: View; round: number | null; reveal?: boolean }) {
  const items = (view.found ?? []).filter((f) => round === null || f.round === round);
  if (!items.length) return <p className="muted">No notes found.</p>;
  return (
    <div className="proofs">
      {items.map((f, i) => (
        <div className="note" key={i}>
          <Art name="clue-letter" className="corner" />
          <span className="lbl">
            {f.murderer ? "The murderer's note" : "An innocent note"} · {roomName(f.room)} · found by {names(f.found_by.map((m) => nameOf(view, m)))}
          </span>
          <span>{noteText(f)}</span>
          {reveal && f.owner && (
            <span className="from">{f.forged ? `A fake, forged by ${nameOf(view, f.owner)}` : `It was ${nameOf(view, f.owner)}'s`}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function FoundThisRound({ view }: { view: View }) {
  const stuck = view.stuck ?? [];
  return (
    <>
      <span className="eyebrow">Notes found this round</span>
      <FoundCards view={view} round={view.room.round} />
      {stuck.length > 0 && <p className="muted">Still locked: {names(stuck.map(roomName))}. Those notes stay hidden.</p>}
    </>
  );
}

function Quiet({ view, busy, onNext }: ScreenProps) {
  return (
    <>
      <span className="eyebrow">Round {view.room.round} · The search goes on</span>
      <div className="tv-grid">
        <div>
          <p className="chapter">No murderer&apos;s notes tonight</p>
          <Line id="quiet" text="The house is quiet. Nobody points a finger yet." />
          <p className="todo">
            <b>No vote this round.</b> Keep searching.
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={onNext}>
              Next round
            </button>
          </div>
        </div>
        <div>
          <FoundThisRound view={view} />
        </div>
      </div>
    </>
  );
}

function Discuss({ view, busy, onNext }: ScreenProps) {
  const c = clues(view);
  const fresh = c.some((f) => f.round === view.room.round);
  const t = since(view.room.phase_at);
  return (
    <>
      <span className="eyebrow">Round {view.room.round} · The Grand Hall</span>
      {view.report ? <Line id="scream" text={NARRATION.scream} /> : <Line id="gather" text={NARRATION.gather} />}
      <ReportLine view={view} />
      <p className="chapter">Who do you think this describes?</p>
      <div className="tv-grid">
        <div>
          {c.length ? (
            <>
              <div className="proofs">
                {c.map((f, i) => {
                  const inner = (
                    <>
                      <Art name="clue-letter" className="corner" />
                      <span className="lbl">
                        The murderer&apos;s note · {f.round === view.room.round ? "found tonight" : `round ${f.round}`} · {roomName(f.room)}
                      </span>
                      <q>{noteText(f)}</q>
                    </>
                  );
                  // The two torn halves slide together, then sit as one note.
                  return (
                    <div className="note big-note torn" style={{ "--t": t } as CSSProperties} key={i}>
                      <div className="half l">{inner}</div>
                      <div className="half r" aria-hidden="true">
                        {inner}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!fresh && <p className="muted">No new murderer&apos;s notes this round. Here&apos;s what you have.</p>}
            </>
          ) : (
            <Line id="no-clues" text={NARRATION["no-clues"]} />
          )}
        </div>
        <div>
          <p className="todo">
            <b>Talk it through.</b> Who does it sound like? If it sounds like you, say why it isn&apos;t.
          </p>
          <span className="muted">Voting opens when time runs out.</span>
          <div className="row">
            <button className="btn" disabled={busy} onClick={onNext}>
              Start the vote
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Meeting({ view, busy, onNext }: ScreenProps) {
  const voters = alive(view);
  return (
    <>
      <span className="eyebrow">Round {view.room.round} · The Grand Hall</span>
      <ReportLine view={view} />
      <Line id="meeting" text={NARRATION.meeting} />
      <div className="tv-grid">
        <div>
          <FoundThisRound view={view} />
        </div>
        <div>
          <p className="prompt-line">{MEET_PROMPTS[(view.room.round - 1) % MEET_PROMPTS.length]}</p>
          <span className="muted">
            {voters.filter((p) => p.voted).length} of {voters.length} have voted.
          </span>
          <div className="avatars">
            {voters.map((p) => (
              <Avatar key={p.id} view={view} player={p} extra={p.voted ? "done" : "waiting"} />
            ))}
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={onNext}>
              Reveal the vote
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// The vote board: every suspect with a tally mark per vote, landing one at a time.
function Tally({ view, busy, onNext }: ScreenProps) {
  const r = view.result;
  if (!r) return null;
  const n = (k: string) => r.counts.find((x) => x.k === k)?.n ?? 0;
  const t = since(view.room.phase_at);
  let order = 0;
  const marks = (k: string) =>
    Array.from({ length: n(k) }, (_, i) => (
      <i key={i} style={{ animationDelay: `calc(${t} + ${(0.6 + 0.45 * order++).toFixed(2)}s)` }}>
        /
      </i>
    ));
  const rows = alive(view).map((p) => (
    <div className="tally-row" key={p.id}>
      <Avatar view={view} player={p} size="xs" />
      <b>{p.name}</b>
      <span className="marks">{marks(p.id)}</span>
    </div>
  ));
  const skip = n("skip") ? (
    <div className="tally-row">
      <b>Skip</b>
      <span className="marks">{marks("skip")}</span>
    </div>
  ) : null;
  const after = { animationDelay: `calc(${t} + ${(1.4 + 0.45 * order).toFixed(2)}s)` };
  const ej = r.ejected;
  return (
    <>
      <span className="eyebrow">Round {view.room.round} · The votes are in</span>
      <div className="tally panel">
        <p className="t">Who is the murderer?</p>
        {rows}
        {skip}
      </div>
      <div className="tally-after">
        <p className="big" style={after}>
          {ej ? `Most votes: ${nameOf(view, ej)}.` : r.tie ? "It's a tie." : "Most people skipped."}
        </p>
        <div className="row end" style={after}>
          <button className="btn" disabled={busy} onClick={onNext}>
            {ej ? "Reveal the verdict" : "Continue"}
          </button>
        </div>
      </div>
    </>
  );
}

function Revealed({ view, busy, onNext }: ScreenProps) {
  const r = view.result;
  const ej = r?.ejected ?? null;
  const caught = Boolean(r?.was_murderer);
  const said = ej ? (caught ? "verdict-murderer" : "verdict-innocent") : "verdict-none";
  const name = nameOf(view, ej);
  return (
    <>
      <span className="eyebrow">Round {view.room.round} · The vote</span>
      <Line id={said} text={NARRATION[said]} />
      <div className="tv-grid">
        <div>
          {ej ? (
            <>
              <Avatar view={view} player={playerOf(view, ej)} size="lg" extra={caught ? "caught" : ""} />
              <p className="big">{name} has been voted out.</p>
              <p className={`big ${caught ? "win" : "lose"}`}>
                {name} {caught ? "WAS the murderer." : "was not the murderer."}
              </p>
              {!caught && <p className="muted">{name} is now a ghost: they can still open locks, but can&apos;t vote.</p>}
            </>
          ) : (
            <p className="big">{r?.tie ? "It's a tie." : "The group skipped."} Nobody was voted out.</p>
          )}
        </div>
        <div />
      </div>
      <div className="row end">
        <button className="btn" disabled={busy} onClick={onNext}>
          {caught ? "See the ending" : "Next round"}
        </button>
      </div>
    </>
  );
}

function Ended({ view, busy, onReplay, onAnother, feedbackUrl }: { view: View; busy: boolean; onReplay: () => void; onAnother: () => void; feedbackUrl: string | null }) {
  const won = view.outcome === "detectives";
  const said = won ? "end-detectives" : "end-murderer";
  const m = nameOf(view, view.murderer);
  return (
    <>
      <span className="eyebrow">The end of {TITLE}</span>
      <Line id={said} text={NARRATION[said]} />
      <div className="tv-grid">
        <div>
          <p className={`big ${won ? "win" : "lose"}`} style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)" }}>
            {won ? "The detectives win" : "The murderer wins"}
          </p>
          <p className="muted">{view.reason}</p>
          <Avatar view={view} player={playerOf(view, view.murderer)} size="lg" extra="caught" />
          <p className="big">The murderer was {m}.</p>
          {view.lost_forgery && (
            <p className="muted">
              {m} also forged a note that nobody found: “{view.lost_forgery}”
            </p>
          )}
          <p style={{ color: "var(--paper)", fontWeight: 700, fontSize: "1.15rem" }}>{m}, tell the story behind one of your notes.</p>
        </div>
        <div>
          <span className="eyebrow">Every note, and whose it was</span>
          <FoundCards view={view} round={null} reveal />
        </div>
      </div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={onReplay}>
          Play again
        </button>
        <button className="btn ghost" disabled={busy} onClick={onAnother}>
          Choose another story
        </button>
        {feedbackUrl && (
          <a className="tool" href={feedbackUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("feedback_clicked", { room_id: view.room.id, ...storyProps("marlowe"), outcome: view.outcome, winner: winnerOf(view.outcome) })}>
            Give feedback
          </a>
        )}
      </div>
    </>
  );
}
