"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { track } from "@/lib/analytics";
import {
  BEATS, LOCK_NAME, MEET_PROMPTS, NARRATION, PROLOGUE, TITLE, chapterOf, names, noteText, roomName,
} from "@/lib/gathering/content";
import {
  TIMED, act, alive, clues, nameOf, playerOf, useAdvanceWhenDue, useGame, useSecondsLeft, type View,
} from "@/lib/gathering/game";
import { sound, type SoundSettings } from "@/lib/gathering/sound";
import { ensureSignedIn, errorMessage, supabase } from "@/lib/supabase";
import { Art, Avatar, Line, Ring, since } from "../_ui/bits";
import { HousePlan } from "../_ui/house";
import { Weather, type WeatherHandle } from "../_ui/weather";

const STORAGE_KEY = "gathering:tv-room";

export default function TvScreen({ feedbackUrl }: { feedbackUrl: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  // Sign in, then reuse this TV's room (a refresh keeps the game) or make a new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSignedIn();
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const { error } = await supabase.rpc("get_view", { p_room_id: saved });
          if (!error) {
            if (!cancelled) setRoomId(saved);
            return;
          }
        }
        const { data, error } = await supabase.rpc("create_room");
        if (error) throw error;
        localStorage.setItem(STORAGE_KEY, data.id);
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
    localStorage.setItem(STORAGE_KEY, data.id);
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
        <p className="muted">Setting up the manor…</p>
      </section>
    </div>
  );
}

type TvProps = { view: View; reload: () => Promise<void>; now: () => number; onNewRoom: () => void; feedbackUrl: string | null };

function Tv({ view, reload, now, onNewRoom, feedbackUrl }: TvProps) {
  const { phase, round } = view.room;
  const left = useSecondsLeft(view, now);
  useAdvanceWhenDue(view, left, reload);
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

  useSoundCues(view, left, weather);
  useAnalytics(view);

  // The narrator reads this screen's lines once.
  useLayoutEffect(() => {
    const ids = phase === "lobby" ? [] : [...new Set([...(tv.current?.querySelectorAll<HTMLElement>("[data-line]") ?? [])].map((el) => el.dataset.line!))];
    sound().narrate(`${phase}:${round}:${ids.join("|")}`, ids);
  });

  const scene = phase === "discuss" && view.report ? "blackout" : phase;
  const screens: Record<string, () => React.ReactNode> = {
    lobby: () => <Lobby view={view} busy={busy} onStart={() => run("start_game")} />,
    roles: () => <Roles view={view} />,
    tasks: () => <Tasks view={view} busy={busy} onNext={next} />,
    quiet: () => <Quiet view={view} busy={busy} onNext={next} />,
    discuss: () => <Discuss view={view} busy={busy} onNext={next} />,
    meeting: () => <Meeting view={view} busy={busy} onNext={next} />,
    tally: () => <Tally view={view} busy={busy} onNext={next} />,
    revealed: () => <Revealed view={view} busy={busy} onNext={next} />,
    ended: () => <Ended view={view} busy={busy} onReplay={() => run("start_game")} feedbackUrl={feedbackUrl} />,
  };

  return (
    <div className="gathering tv-page">
      <SoundBar onNewRoom={onNewRoom} />
      <section className="tv" data-scene={scene} ref={tv} aria-label="Shared TV screen">
        <Weather ref={weather} />
        <div className="tv-head">
          <span>{phase === "lobby" ? "The Gathering" : TITLE}</span>
          {phase !== "lobby" && (
            <span className="code">
              Join with code <b>{view.room.code}</b>
            </span>
          )}
        </div>
        {screens[phase]()}
        {error && <p className="report">{error}</p>}
        {TIMED.includes(phase) && <Ring left={left} total={view.room.total_secs} big />}
      </section>
    </div>
  );
}

// ---------- sound ----------

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
      <button className="tool" aria-pressed={s.muted} aria-label={s.muted ? "Unmute" : "Mute"} onClick={() => set({ muted: !s.muted })}>
        {s.muted ? "Unmute" : "Mute"}
      </button>
      <input type="range" min={0} max={100} value={s.volume} aria-label="Music volume" onChange={(e) => set({ volume: +e.target.value, muted: false })} />
      <output>{s.volume}%</output>
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
function useSoundCues(view: View, left: number, weather: React.RefObject<WeatherHandle | null>) {
  const { phase, round } = view.room;
  const solved = view.pairs?.filter((p) => p.solved).length ?? 0;
  const last = useRef<{ key: string; solved: number } | null>(null);
  const lastBeat = useRef<number | null>(null);

  useEffect(() => {
    const s = sound();
    s.setPhase(phase);
    s.flash = () => weather.current?.flash();
  }, [phase, weather]);

  useEffect(() => {
    const s = sound();
    const key = `${phase}:${round}`;
    const prev = last.current;
    last.current = { key, solved };
    if (!prev) return; // first load: no sounds for a screen that was already showing
    if (prev.key !== key) {
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

// Analytics come from the TV only, so each event is counted once per game.
function useAnalytics(view: View) {
  const { phase, round, id } = view.room;
  const last = useRef<string | null>(null);
  const opened = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of view.pairs ?? []) {
      const k = `${round}:${p.idx}`;
      if (phase === "tasks" && p.solved && !opened.current.has(k)) {
        opened.current.add(k);
        track("lock_opened", { room_id: id, round, lock_type: p.lock_type, tries: p.tries, players: p.members.length });
      }
    }
    const key = `${phase}:${round}`;
    if (last.current === null) {
      last.current = key;
      return;
    }
    if (last.current === key) return;
    last.current = key;
    const base = { room_id: id, round, players: view.players.length };
    if (phase === "roles") track("game_started", base);
    if (phase === "tasks") track("round_started", { ...base, pairs: view.pairs?.length ?? 0 });
    if (phase === "quiet") track("round_quiet", base);
    if (phase === "discuss") track("meeting_called", { ...base, death: Boolean(view.report), notes_found: view.found?.filter((f) => f.round === round).length ?? 0 });
    if (phase === "revealed") track("vote_revealed", { ...base, ejected: Boolean(view.result?.ejected), was_murderer: Boolean(view.result?.was_murderer), tie: Boolean(view.result?.tie) });
    if (phase === "ended") track("game_ended", { ...base, outcome: view.outcome, rounds: round });
  });
}

// ---------- screens ----------

type ScreenProps = { view: View; busy: boolean; onNext: () => void };

function Lobby({ view, busy, onStart }: { view: View; busy: boolean; onStart: () => void }) {
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/play/${view.room.code}`;
  const waiting = view.players.filter((p) => !p.name || !p.answered);
  const ready = view.players.length >= 3 && waiting.length === 0;
  return (
    <div className="lobby-grid">
      <div>
        <span className="eyebrow">Join with this code</span>
        <p className="joincode">{view.room.code}</p>
        {origin && (
          <div className="qr" aria-label={`Scan to join: ${url}`}>
            <QRCodeSVG value={url} size={132} bgColor="#e8d9b8" fgColor="#141414" />
          </div>
        )}
        <span className="eyebrow">Detectives ({view.players.length} of 6)</span>
        <div className="avatars">
          {view.players.map((p) => (
            <Avatar key={p.id} view={view} player={p} size="md" extra={p.name && p.answered ? "done" : "waiting"} />
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
          {view.players.length < 3 ? (
            <span className="hint">Needs 3 to 6 players.</span>
          ) : (
            waiting.length > 0 && <span className="hint">Waiting for {names(waiting.map((p) => p.name ?? "someone joining"))}.</span>
          )}
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

function Ended({ view, busy, onReplay, feedbackUrl }: { view: View; busy: boolean; onReplay: () => void; feedbackUrl: string | null }) {
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
        {feedbackUrl && (
          <a className="tool" href={feedbackUrl} target="_blank" rel="noopener noreferrer">
            Give feedback
          </a>
        )}
      </div>
    </>
  );
}
