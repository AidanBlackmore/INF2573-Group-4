"use client";

// Trapped Below on the TV: the captain's briefing and the hatch, the dive, the crew file and orders,
// four watches of repairs, the all-hands emergencies, the meetings and the ending.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { secondsSince, storyProps, track, winnerOf } from "@/lib/analytics";
import { deep, shake } from "@/lib/gathering/deep";
import { nameOf, playerOf, type Player, type TbRepair, type View } from "@/lib/gathering/game";
import { sound } from "@/lib/gathering/sound";
import { BRIEF_BEATS, COMPARTMENTS, FIELDS, PIPE_PATH, PIPE_TYPE, PLACE_NAME, SUB, TB_NARRATION, TB_TITLE, beatAt, bg, drillPairs, facePic, fmtAir, type Place } from "@/lib/gathering/trapped";
import { Caption, colorOf } from "../_ui/bits";

type Props = {
  view: View;
  now: () => number;
  busy: boolean;
  run: (fn: string, args?: Record<string, unknown>) => void;
  onAnother: () => void;
  feedbackUrl: string | null;
};

// Redraw a few times a second (timers, the air clock, the water level).
function useClock(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export const airNow = (view: View, now: number) => {
  const tb = view.tb!;
  return tb.air_running && tb.air_at ? Math.max(0, Math.ceil((new Date(tb.air_at).getTime() - now) / 1000)) : tb.air;
};
export const lowAir = (view: View, now: number) => Boolean(view.tb?.air_running) && airNow(view, now) < 90;

// The room on the TV for each moment of the game.
export function tvPlace(view: View, now: number): Place {
  const tb = view.tb;
  const phase = view.room.phase;
  if (!tb) return "exterior";
  if (phase === "tb_end") return tb.outcome === "crew" ? "dawn" : "wreck";
  if (lowAir(view, now)) return "flooded";
  const hands = tb.hands?.kind;
  return (
    (
      {
        tb_brief: "control",
        tb_dive: "exterior",
        tb_crew: "quarters",
        tb_orders: "corridor",
        tb_watch: "control",
        tb_hands: hands === "riddle" ? "sonar" : hands === "pipes" ? "pipewall" : "flooded",
        tb_talk: "galley",
        tb_vote: "galley",
        tb_verdict: "escape",
      } as Record<string, Place>
    )[phase] ?? "control"
  );
}

// Who should be looking at their phone right now (the rest look at the TV).
export function phoneFocus(view: View, id: string): boolean {
  const tb = view.tb;
  const phase = view.room.phase;
  const me = playerOf(view, id);
  if (!tb || !me) return false;
  switch (phase) {
    case "tb_brief":
      return tb.stage === "hatch";
    case "tb_dive":
      return !tb.dive_at && id === view.host_player;
    case "tb_crew":
      return !me.answered;
    case "tb_orders":
      return !me.ready;
    case "tb_watch":
      return tb.repairs.some((r) => r.members.includes(id) && !r.solved);
    case "tb_hands":
      return !tb.hands?.done;
    case "tb_vote":
      return !me.dead && !(tb.voted ?? []).includes(id);
    case "tb_end":
      // The TV has the same buttons as the host's phone, so nobody is sent to their phone here.
      return false;
    default:
      return false;
  }
}

// ---------- shared pieces ----------

function Crew({ view, player, size = "md", note, dim }: { view: View; player: Player | undefined; size?: "sm" | "md"; note?: ReactNode; dim?: boolean }) {
  if (!player) return null;
  return (
    <span className={`tb-mate ${size}${player.dead ? " dead" : ""}${dim ? " dim" : ""}`} style={{ "--pc": colorOf(view, player.id) } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={facePic(player)} alt="" />
      <b>{player.name}</b>
      {note && <small>{note}</small>}
    </span>
  );
}

function Plate({ children }: { children: ReactNode }) {
  return <span className="tb-plate">{children}</span>;
}

// The captain on the intercom. The narrator reads it once (through the radio filter); it also shows as a subtitle.
function Captain({ id }: { id: string }) {
  return (
    <p className="tb-intercom" data-line={id}>
      <span className="lbl">Captain · intercom</span>
      <span>
        <Caption id={id} text={TB_NARRATION[id]} />
      </span>
    </p>
  );
}

function Hud({ view, now, label }: { view: View; now: number; label: string }) {
  const tb = view.tb!;
  const air = airNow(view, now);
  return (
    <div className={`tb-hud${air < 90 && tb.air_running ? " low" : ""}`}>
      <div className="tb-air">
        <span className="lbl">Air</span>
        <b>{fmtAir(air)}</b>
        <span className="tb-tank" aria-hidden="true">
          <span className="glass">
            <i style={{ width: `${100 - Math.min(100, (air / 600) * 100)}%` }} />
          </span>
        </span>
        {!tb.air_running && view.room.phase !== "tb_end" && <span className="paused">paused</span>}
      </div>
      <Plate>{label}</Plate>
      <span className="tb-depth">
        Depth <b>{tb.depth} m</b>
      </span>
    </div>
  );
}

// Who should be looking at their phone: a big banner, so nobody waits on the TV by mistake.
function FocusTag({ view }: { view: View }) {
  const who = view.players.filter((p) => phoneFocus(view, p.id));
  if (!who.length) return null;
  const names = who.map((p) => p.name ?? "Someone");
  const label = who.length === view.players.length ? "Everyone" : names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0];
  return (
    <div className="tb-focus" key={who.map((p) => p.id).join()} role="status">
      <span className="phicon big" />
      <span>
        <b>Look at your phone</b>
        <br />
        {label}
      </span>
    </div>
  );
}

// Numbered steps, each marked with where it happens: your phone, the TV, or out loud.
type Step = ["phone" | "tv" | "talk", string];
function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="tb-steps">
      {steps.map(([dev, text], i) => (
        <li key={i} className={dev}>
          <span className="dev" aria-label={dev === "phone" ? "On your phone" : dev === "tv" ? "On the TV" : "Out loud"}>
            {dev === "phone" ? <span className="phicon" /> : dev === "tv" ? <span className="tvicon" /> : <span className="talkicon" />}
          </span>
          <span>
            <small>{dev === "phone" ? "Phone" : dev === "tv" ? "TV" : "Talk"}</small>
            {text}
          </span>
        </li>
      ))}
    </ol>
  );
}

// The picture for each card of the briefing.
function BeatPicture({ view, id }: { view: View; id: string }) {
  if (id === "tb-brief-open")
    return (
      <div className="tb-cold" style={{ backgroundImage: `url(${bg("exterior")})` }}>
        <div className="row">
          {view.players.map((p) => (
            <Crew key={p.id} view={view} player={p} size="sm" />
          ))}
        </div>
      </div>
    );
  if (id === "tb-brief-air")
    return (
      <span className="tb-tank big" aria-hidden="true">
        <span className="glass">
          <i className="drain" />
        </span>
      </span>
    );
  if (id === "tb-brief-pairs")
    return (
      <div className="tb-pairdemo">
        {drillPairs(view.players).map((g, i) => (
          <div key={i} className="pair">
            {g.map((id) => (
              <Crew key={id} view={view} player={playerOf(view, id)} size="sm" />
            ))}
            <span className="phicon" />
          </div>
        ))}
      </div>
    );
  if (id === "tb-brief-hands")
    return (
      <div className="tb-pairdemo">
        <div className="pair">
          {view.players.map((p) => (
            <Crew key={p.id} view={view} player={p} size="sm" />
          ))}
          <span className="phicon" />
        </div>
      </div>
    );
  if (id === "tb-brief-sab2")
    return (
      <div className="tb-sab">
        {view.players.slice(0, 6).map((p) => (
          <Crew key={p.id} view={view} player={p} size="sm" />
        ))}
        <i className="scan" />
      </div>
    );
  return null;
}

// The blueprint of the sub, with the rooms that need fixing and who's in them.
function Blueprint({ view, tour = false }: { view: View; tour?: boolean }) {
  const reps = view.tb?.repairs ?? [];
  const status = (key: string) => {
    if (tour) return "ok";
    const r = reps.filter((x) => x.place === key);
    if (!r.length) return ["engine", "oxygen", "sonar", "ballast", "control"].includes(key) ? "ok" : "quiet";
    return r.every((x) => x.solved) ? "fixed" : "broken";
  };
  return (
    <svg className={`tb-sub${tour ? " tour" : ""}`} viewBox="0 30 2000 600" role="img" aria-label="Blueprint of the submarine">
      <image href="/trapped/sub.webp" x="0" y="0" width="2000" height="720" />
      {COMPARTMENTS.map(([key, label, x, y, w, h], i) => {
        const st = status(key);
        const here = tour ? [] : reps.filter((r) => r.place === key).flatMap((r) => r.members);
        return (
          <g key={key} className={`room ${st}`} style={{ "--i": i } as CSSProperties}>
            <rect x={x} y={y} width={w} height={h} />
            <text x={x + w / 2} y={y + (here.length ? 34 : h / 2 + 10)}>
              {label}
              {st === "broken" ? " !" : st === "fixed" ? " ✓" : ""}
            </text>
            {here.slice(0, 4).map((id, j) => (
              <g key={id}>
                <image href={facePic(playerOf(view, id))} x={x + w - 50 - j * 48} y={y + h - 74} width="44" height="68" preserveAspectRatio="xMidYMid slice" />
                <rect className="tagbar" x={x + w - 50 - j * 48} y={y + h - 8} width="44" height="6" style={{ fill: colorOf(view, id) }} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PipeTile({ i, rot, wet, map }: { i: number; rot: number; wet?: boolean; map?: boolean }) {
  const ends: Record<number, [number, number]> = {
    0: [50, 0],
    1: [100, 50],
    2: [50, 100],
    3: [0, 50],
  };
  const ds = (PIPE_TYPE[i] === "I" ? [1, 3] : [0, 1]).map((d) => (d + rot) % 4);
  const onPath = PIPE_PATH.includes(i);
  const faint = map && !onPath;
  const lines = ds.map((d) => <line key={d} x1="50" y1="50" x2={ends[d][0]} y2={ends[d][1]} />);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill={map ? "#d5e0e0" : "#12303a"} />
      <g stroke={faint ? "#a3b9b9" : map ? "#071013" : "#8a9a9a"} strokeWidth="26" strokeLinecap="square">
        {lines}
      </g>
      <g stroke={wet && onPath ? "#5fc6e8" : map && !faint ? "#e8833a" : "transparent"} strokeWidth="10" strokeLinecap="square">
        {lines}
      </g>
      {!map && <circle cx="50" cy="50" r="9" fill="#e8833a" />}
    </svg>
  );
}
export { PipeTile };

// ---------- the screens ----------

export function TrappedTv({ view, now: nowFn, busy, run, onAnother, feedbackUrl }: Props) {
  useClock();
  const now = nowFn();
  const tb = view.tb;
  if (!tb) return null;
  const phase = view.room.phase;
  const next = () => run("tb_next", { p_phase: phase });
  const watchLabel = `Watch ${view.room.round} of 4`;
  const age = (at: string | null) => (at ? (now - new Date(at).getTime()) / 1000 : 0);
  let body: ReactNode = null;

  if (phase === "tb_brief") {
    if (tb.stage === "talk") {
      const beat = beatAt(age(view.room.phase_at));
      const skips = tb.skip.length;
      body = (
        <>
          <Plate>
            How to play · {beat + 1} of {BRIEF_BEATS.length}
          </Plate>
          <div className="tb-onb one">
            <div className="tb-beat" key={beat}>
              <span className="tag">{TB_TITLE}</span>
              <h2 className="tb-chapter">{BRIEF_BEATS[beat].title}</h2>
              <BeatPicture view={view} id={BRIEF_BEATS[beat].id} />
              <p className="tb-narr">{BRIEF_BEATS[beat].tick}</p>
            </div>
            <ol className="tb-checklist">
              {BRIEF_BEATS.map((b, i) => (
                <li key={b.id} className={i < beat ? "done" : i === beat ? "cur" : ""}>
                  {b.title}
                </li>
              ))}
              <li className={beat === BRIEF_BEATS.length - 1 ? "next" : ""}>Then: seal the hatch</li>
            </ol>
          </div>
          <p className="tb-note">{skips ? `${skips} of ${view.players.length} want to skip. Everyone has to tap it.` : "Played before? Everyone taps “We know how to play” on their phone to skip ahead."}</p>
          <Captain id={BRIEF_BEATS[beat].id} />
        </>
      );
    } else {
      const sealing = tb.seal_at ? Math.max(0, Math.min(1, 1 - (new Date(tb.seal_at).getTime() - now) / 3000)) : 0;
      const sealed = tb.stage === "sealed";
      const slipped = tb.slip_at && age(tb.slip_at) < 2.5;
      const held = tb.holds.length;
      const n = view.players.length;
      // Bolts sit around the wheel pair by pair, so drill partners are side by side.
      const pairs = drillPairs(view.players);
      const ring = pairs
        .flat()
        .map((id) => playerOf(view, id)!)
        .filter(Boolean);
      body = (
        <>
          <Plate>Seal the hatch</Plate>
          <div className="tb-hatchrow">
            <div className={`tb-hatch${sealed ? " sealed" : ""}${slipped ? " slipped" : ""}`}>
              <svg className="tb-ring" viewBox="0 0 100 100" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  pathLength="100"
                  style={{
                    strokeDashoffset: 100 - (sealed ? 100 : sealing * 100),
                  }}
                />
              </svg>
              <div className="wheel" />
              {ring.map((p, i) => {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                return (
                  <span
                    key={p.id}
                    className={`bolt${tb.holds.includes(p.id) || sealed ? " on" : ""}`}
                    style={{
                      left: `${50 + 47 * Math.cos(a)}%`,
                      top: `${50 + 47 * Math.sin(a)}%`,
                    }}
                  >
                    <Crew view={view} player={p} size="sm" />
                  </span>
                );
              })}
            </div>
            <div className="tb-col">
              <h2 className="tb-chapter">{sealed ? "Hatch sealed." : `${n} bolts. One each.`}</h2>
              <p className="tb-narr">
                {sealed
                  ? "Good work, crew. Now, the lights."
                  : slipped
                    ? "Clunk. A bolt slipped. No harm done: count down together and try again."
                    : held === 0
                      ? "Everyone holds their bolt on their phone at the same time. Count down together."
                      : held < n
                        ? `${held} of ${n} holding. Who's missing?`
                        : "All holding. Keep holding…"}
              </p>
              {!sealed && (
                <Steps
                  steps={[
                    ["phone", "Look at your phone. Press and hold the bolt."],
                    ["talk", "Count down together, then all hold at once."],
                    ["tv", "Every bolt green for 3 seconds: sealed."],
                  ]}
                />
              )}
              {!sealed && (
                <div className="tb-panel tb-reps">
                  {pairs.map((g, i) => (
                    <div key={i} className={`rep${g.every((id) => tb.holds.includes(id)) ? " done" : ""}`}>
                      <span className={`status${g.every((id) => tb.holds.includes(id)) ? " ok" : ""}`}>{g.length > 2 ? "Drill trio" : `Drill pair ${i + 1}`}</span>
                      <span>
                        <b>{g.map((id) => nameOf(view, id)).join(" & ")}</b>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="tb-note">
                {sealed ? "" : "Down there, every watch pairs you up like this on the board: find your partner here, then check your phone. "}
                You can&apos;t fail this. Nothing is lost if a bolt slips.
              </p>
            </div>
          </div>
          <Captain id={sealed ? "tb-hatch-sealed" : tb.slips >= 2 ? "tb-hatch-countin" : tb.skip.length === n ? "tb-skip2" : "tb-brief-hatch2"} />
        </>
      );
    }
  } else if (phase === "tb_dive") {
    const t = tb.dive_at ? age(tb.dive_at) : -1;
    if (t < 0) {
      body = (
        <div className="tb-dim">
          <Plate>Before we dive</Plate>
          <h2 className="tb-title">
            Dim the lights.
            <br />
            We&apos;re diving.
          </h2>
          <p className="tb-narr">Turn off the big lights. Turn your phone brightness down. Get comfortable.</p>
          <button className="btn" disabled={busy} onClick={() => run("tb_dive")}>
            Lights are down. Dive.
          </button>
          <Captain id="tb-dim" />
        </div>
      );
    } else {
      const k = Math.min(1, t / 6.5);
      const m = Math.round(412 * (1 - Math.pow(1 - k, 2)));
      body = (
        <div className="tb-dim diving">
          <span className="lbl">Flooding the tanks</span>
          <div className="tb-depthbig">
            <b>{m}</b> m
          </div>
          <div className="tb-gauge">
            <i style={{ width: `${k * 100}%` }} />
          </div>
          <Captain id={k < 1 ? "tb-dive" : "tb-depth"} />
        </div>
      );
    }
  } else if (phase === "tb_crew") {
    const waiting = view.players.filter((p) => !p.answered);
    body = (
      <>
        <Plate>Crew file</Plate>
        <div className="tb-row">
          <div className="tb-col">
            <span className="tag">412 m · before the first watch</span>
            <p className="tb-narr">Four quick questions about you. Your crewmates will need your answers in the repairs, so be honest. Nobody knows who the saboteur is yet.</p>
            <Steps
              steps={[
                ["phone", "Look at your phone. Answer the four questions."],
                ["tv", "When everyone shows Filed, the host taps Hand out the orders."],
              ]}
            />
          </div>
          <div className="tb-col">
            <div className="tb-crewrow">
              {view.players.map((p) => (
                <Crew key={p.id} view={view} player={p} note={p.answered ? "Filed" : "Answering"} dim={!p.answered} />
              ))}
            </div>
            <div className="row">
              <button className="btn" disabled={busy || waiting.length > 0} onClick={() => run("tb_start")}>
                Hand out the orders
              </button>
              {waiting.length > 0 && <span className="tb-note">Waiting for {waiting.map((p) => p.name).join(", ")}.</span>}
            </div>
          </div>
        </div>
        <Captain id="tb-crewfile" />
      </>
    );
  } else if (phase === "tb_orders") {
    body = (
      <>
        <Plate>Sealed orders</Plate>
        <div className="tb-row">
          <div className="tb-col">
            <h2 className="tb-chapter">{tb.saboteur_mode ? "Somebody aboard is cutting the lines." : "Four watches to the surface."}</h2>
            <p className="tb-narr">
              {tb.saboteur_mode
                ? "Most of you are crew. One of you is the saboteur and wants the sub to sink. Nobody else will know who."
                : "Three of you, no saboteur. Keep the sub running for four watches and you reach the surface. Run out of air and you don't."}
            </p>
            <Steps
              steps={[
                ["phone", "Look at your phone. Tap the porthole to read your secret orders."],
                ["phone", "Keep your screen to yourself, then tap Ready."],
                ["tv", "When everyone is ready, the first watch starts."],
              ]}
            />
          </div>
          <div className="tb-col">
            <div className="tb-crewrow">
              {view.players.map((p) => (
                <Crew key={p.id} view={view} player={p} note={p.ready ? "Ready" : p.opened ? "Reading" : "Sealed"} dim={!p.ready} />
              ))}
            </div>
          </div>
        </div>
        <Captain id="tb-orders" />
      </>
    );
  } else if (phase === "tb_watch") {
    const reps = tb.repairs;
    body = (
      <>
        <Hud view={view} now={now} label={watchLabel} />
        <div className="tb-watch">
          <div className="tb-subwrap">
            <Blueprint view={view} />
            <Steps
              steps={[
                ["tv", "Find your name on the right: that's your partner and your room."],
                ["phone", "Look at your phone. One of you has the wires or controls, the other the manual or log."],
                ["talk", "Tell each other what you see. Each repair is about a crewmate: how well do you know them?"],
              ]}
            />
          </div>
          <div className="tb-col">
            {tb.bolt_report && <p className="tb-alarm">The {PLACE_NAME[tb.bolt_report]?.toLowerCase() ?? tb.bolt_report} gave way. Someone loosened it by hand. −0:30</p>}
            <span className="tag">Repairs</span>
            <div className="tb-panel tb-reps">
              {reps.map((r) => (
                <RepairRow key={r.idx} view={view} r={r} />
              ))}
            </div>
            {view.room.round === 1 && <p className="tb-note">Every fix buys air and puts that crewmate&apos;s answers on the evidence board. Wrong tries cost air.</p>}
            <button className="btn ghost" disabled={busy} onClick={next}>
              End the watch
            </button>
          </div>
        </div>
        <Captain id={`tb-watch-${Math.min(4, view.room.round)}`} />
      </>
    );
  } else if (phase === "tb_hands") {
    const h = tb.hands!;
    let inner: ReactNode = null;
    if (h.kind === "riddle") {
      const guessed = new Set(h.guessed);
      inner = (
        <div className="tb-row">
          <div className="tb-col">
            <span className="tag">All hands · identity check</span>
            <h2 className="tb-chapter">{h.done ? (h.ok ? `It was ${nameOf(view, h.subject)}.` : "No majority.") : "Whose file is this?"}</h2>
            <div className="tb-panel tb-logs">
              {(h.riddle ?? []).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
            <p className="tb-narr">
              {h.done
                ? h.ok
                  ? `${nameOf(view, h.subject)} is cleared: not the saboteur. Their answers go on the evidence board. +1:00`
                  : "The crew couldn't agree, so the computer can't vouch for anyone. Whoever it was stays a suspect."
                : "Security has cleared one crewmate (not the saboteur) but scrambled the name."}
            </p>
          </div>
          <div className="tb-col">
            <span className="tag">{h.done ? "Who said who" : `Guesses · ${guessed.size} of ${view.players.length}`}</span>
            <div className="tb-crewrow">
              {view.players.map((p) => (
                <Crew key={p.id} view={view} player={p} size="sm" note={h.done ? (h.guesses?.[p.id] ? `said ${nameOf(view, h.guesses[p.id])}` : "no guess") : guessed.has(p.id) ? "Guessed" : "Thinking"} dim={!h.done && !guessed.has(p.id)} />
              ))}
            </div>
            {!h.done && (
              <Steps
                steps={[
                  ["tv", "Read the crew file on the left."],
                  ["talk", "Whose answers are these? Talk it over."],
                  ["phone", "Look at your phone and tap a name. If most of you are right, they're cleared."],
                ]}
              />
            )}
          </div>
        </div>
      );
    } else if (h.kind === "pipes") {
      inner = (
        <div className="tb-row">
          <div className="tb-pipes">
            <span className="io">Sea in</span>
            <div className="grid">
              {h.rot.map((r, i) => (
                <PipeTile key={i} i={i} rot={r} wet={h.done && h.ok === true} />
              ))}
            </div>
            <div className="tb-rowtags">
              {[0, 1, 2].map((row) => {
                const turners = view.players.filter((p) => h.roles[p.id]?.rows[1] === row).map((p) => p.name);
                const mappers = view.players.filter((p) => h.roles[p.id]?.rows[0] === row).map((p) => p.name);
                return (
                  <div key={row} className="tb-rowtag">
                    <span className="phicon" />
                    <span>
                      Row {row + 1}: <b>{turners.join(" & ")}</b> {turners.length > 1 ? "turn" : "turns"} it
                      <br />
                      <small>map on {mappers.join(" & ")}&apos;s phone</small>
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="io">Tank</span>
          </div>
          <div className="tb-col">
            <span className="tag">All hands · ballast</span>
            <h2 className="tb-chapter">We&apos;re sinking.</h2>
            <p className="tb-narr">Join the pipes from the sea intake (top left) to the tank (bottom right). These are the real pipes; the valves are on your phones.</p>
            {!h.done && (
              <Steps
                steps={[
                  ["phone", "Look at your phone: the top half shows how one row should look."],
                  ["talk", "Tell whoever turns that row (named on the right) how it should look."],
                  ["phone", "Tap your valves to turn your row. Watch it turn here."],
                  ["tv", "Done when the water runs all the way through."],
                ]}
              />
            )}
            {h.done && <p className={`tb-banner ${h.ok ? "good" : "bad"}`}>{h.ok ? "Ballast blown. Rising. +1:00" : "The ballast held. Barely."}</p>}
          </div>
        </div>
      );
    } else {
      const water = h.done ? (h.ok ? 0 : h.water) : Math.min(100, h.water + Math.max(0, (now - Math.max(new Date(h.leak_at).getTime(), new Date(view.server_now).getTime())) / 1000) * h.rate);
      inner = (
        <>
          <div className="tb-water" style={{ height: `${water}%` }} />
          <div className="tb-row" style={{ position: "relative" }}>
            <div className="tb-col">
              <span className="tag">All hands · hull breach</span>
              <h2 className="tb-chapter">{h.done ? (h.ok ? "Leak sealed." : "The compartment is flooded.") : "We're taking on water."}</h2>
              <p className="tb-narr">{h.done ? (h.ok ? "Pumps holding. +1:00" : "We sealed it off. It cost us.") : "Get the water down to 0% before it reaches 100%."}</p>
              {!h.done && (
                <Steps
                  steps={[
                    ["phone", "Look at your phone: it gives you one job (shake, blow, hold it flat, or hold the hatch)."],
                    ["phone", "Keep doing it. Everyone's job counts."],
                    ["tv", "Watch the water here. At 0%, the leak is sealed."],
                  ]}
                />
              )}
              {h.floods > 0 && !h.done && <p className="tb-alarm">Flooded {h.floods === 1 ? "once" : "twice"}. −1:00 each.</p>}
            </div>
            <div className="tb-level">
              <span className="lbl">Water</span>
              <b>{Math.round(water)}%</b>
            </div>
          </div>
        </>
      );
    }
    body = (
      <>
        <Hud view={view} now={now} label="All hands" />
        {inner}
        <Captain id={h.kind === "riddle" ? "tb-riddle" : h.kind === "pipes" ? "tb-ballast" : "tb-breach"} />
      </>
    );
  } else if (phase === "tb_talk" || phase === "tb_vote") {
    const newLogs = tb.logs.filter((l) => l.watch === view.room.round);
    const left = view.room.deadline ? Math.max(0, Math.ceil((new Date(view.room.deadline).getTime() - now) / 1000)) : 0;
    const voters = view.players.filter((p) => !p.dead);
    body = (
      <>
        <Hud view={view} now={now} label="Crew meeting" />
        <div className="tb-meet">
          <div className="tb-col">
            <span className="tag">Evidence board</span>
            <Evidence view={view} />
          </div>
          <div className="tb-col">
            <span className="tag">{phase === "tb_talk" ? `Talk it through · ${fmtAir(left)}` : `Who goes in the airlock? · ${fmtAir(left)}`}</span>
            <div className="tb-crewrow">
              {view.players.map((p) => (
                <Crew key={p.id} view={view} player={p} size="sm" note={p.dead ? "In the airlock" : phase === "tb_vote" ? ((tb.voted ?? []).includes(p.id) ? "Voted" : "Thinking") : undefined} />
              ))}
            </div>
            {phase === "tb_vote" ? (
              <>
                <Steps
                  steps={[
                    ["phone", "Look at your phone. Vote for who goes in the airlock, or Nobody yet."],
                    ["tv", "Most votes goes in. A tie: nobody goes in."],
                    ["tv", "Wrong person: −1:00 of air, and they can't vote any more (they still repair)."],
                  ]}
                />
                <p className="tb-note">
                  {(tb.voted ?? []).length} of {voters.length} have voted.
                </p>
              </>
            ) : (
              <Steps
                steps={[
                  ["tv", "Top row of the board: clues about the saboteur. Below: answers we've checked."],
                  ["talk", "Struck through means it doesn't match, so not them. Who still fits? Who failed a repair about themselves?"],
                  ["tv", "When you're ready, the host starts the vote."],
                ]}
              />
            )}
            <button className="btn" disabled={busy} onClick={next}>
              {phase === "tb_talk" ? "Start the vote" : "Reveal the vote"}
            </button>
          </div>
        </div>
        <Captain id={phase === "tb_vote" ? "tb-vote" : newLogs.length ? (tb.logs.length === newLogs.length ? "tb-logs-first" : "tb-logs") : "tb-no-logs"} />
      </>
    );
  } else if (phase === "tb_verdict") {
    const r = tb.result;
    const ej = r?.ejected ?? null;
    const n = (k: string) => r?.counts.find((c) => c.k === k)?.n ?? 0;
    body = (
      <>
        <Hud view={view} now={now} label="The airlock" />
        <div className="tb-meet">
          <div className="tb-col">
            <span className="tag">The vote</span>
            <div className="tb-tally">
              {view.players
                .filter((p) => !p.dead || p.id === ej)
                .map((p) => (
                  <span key={p.id} className="t">
                    <Crew view={view} player={p} size="sm" />
                    <b>{n(p.id)}</b>
                  </span>
                ))}
              {n("skip") > 0 && (
                <span className="t">
                  <span className="skip">Skip</span>
                  <b>{n("skip")}</b>
                </span>
              )}
            </div>
          </div>
          <div className="tb-col">
            {ej ? (
              <>
                <h2 className={`tb-chapter ${r?.was_saboteur ? "good" : "bad"}`}>
                  {nameOf(view, ej)} {r?.was_saboteur ? "WAS the saboteur." : "was not the saboteur."}
                </h2>
                {!r?.was_saboteur && <p className="tb-narr">−1:00 of air. {nameOf(view, ej)} still repairs from the airlock, but can&apos;t vote.</p>}
              </>
            ) : (
              <h2 className="tb-chapter">{r?.tie ? "It's a tie. Nobody goes in." : "Nobody goes in."}</h2>
            )}
            <button className="btn" disabled={busy} onClick={next}>
              {r?.was_saboteur || view.room.round >= 4 ? "See the ending" : "Next watch"}
            </button>
          </div>
        </div>
        <Captain id={ej ? (r?.was_saboteur ? "tb-airlock-right" : "tb-airlock-wrong") : "tb-airlock-none"} />
      </>
    );
  } else if (phase === "tb_end") {
    const won = tb.outcome === "crew";
    const sab = tb.saboteur ? playerOf(view, tb.saboteur) : null;
    body = (
      <>
        <span className="tag">{TB_TITLE}</span>
        <h2 className={`tb-title ${won ? "good" : "bad"}`}>{won ? "The crew wins." : tb.saboteur_mode ? "The saboteur wins." : "The air ran out."}</h2>
        <p className="tb-narr">
          {tb.reason}
          {sab ? ` It was ${sab.name}.` : ""}
          {won ? ` The ${SUB} is surfacing.` : ` The ${SUB} sinks to the trench floor.`}
        </p>
        <div className="tb-files">
          {(tb.files ?? []).map((f) => {
            const p = playerOf(view, f.player);
            return (
              <div key={f.player} className={`tb-file${f.player === tb.saboteur ? " sab" : ""}`}>
                <Crew view={view} player={p} size="sm" note={f.player === tb.saboteur ? "Saboteur" : "Crew"} />
                <p>
                  Colour <b>{f.colour}</b> · spice <b>{f.num}</b>/9
                  <br />
                  Would bring: <b>{f.bring}</b>
                  <br />
                  {f.q} <b>{f.a}</b>
                </p>
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run("tb_start")}>
            Play again
          </button>
          <button className="btn ghost" disabled={busy} onClick={onAnother}>
            Choose another story
          </button>
          {feedbackUrl && (
            <a
              className="tool"
              href={feedbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track("feedback_clicked", {
                  room_id: view.room.id,
                  ...storyProps("station"),
                  outcome: tb.outcome,
                  winner: winnerOf(tb.outcome),
                })
              }
            >
              Give feedback
            </a>
          )}
        </div>
        <Captain id={won ? "tb-end-crew" : tb.reason?.startsWith("The air") ? "tb-airout" : "tb-end-saboteur"} />
      </>
    );
  }

  return (
    <div className="tb-screen" data-phase={phase}>
      {body}
      <FocusTag view={view} />
    </div>
  );
}

function RepairRow({ view, r }: { view: View; r: TbRepair }) {
  const lead = nameOf(view, r.lead);
  const others = r.members.filter((m) => m !== r.lead).map((m) => nameOf(view, m));
  const about = r.target ? nameOf(view, r.target) : null;
  return (
    <div className={`rep${r.solved ? " done" : ""}`}>
      <span className={`status ${r.solved ? (r.result === "ok" ? "ok" : "half") : ""}`}>{PLACE_NAME[r.place] ?? r.place}</span>
      <span>
        {r.kind === "wires" ? (
          <>
            <b>{lead}</b> has the wires · <b>{others.join(" & ")}</b> {others.length > 1 ? "have" : "has"} the manual
          </>
        ) : (
          <>
            <b>{lead}</b> has the controls · <b>{others.join(" & ")}</b> {others.length > 1 ? "have" : "has"} the log
          </>
        )}
        {r.solved && <small>{r.result === "ok" ? `Fixed. It was about ${about}: their answers are on the evidence board.` : `Failed. It was about ${about}. A mistake, a lie, or sabotage?`}</small>}
        {!r.solved && r.tries > 0 && (
          <small>
            {r.tries} wrong {r.tries === 1 ? "try" : "tries"}
          </small>
        )}
      </span>
    </div>
  );
}

// The evidence board: the saboteur's restored file on top, every checked answer below. A checked
// answer that differs from the saboteur's rules that person out; an identity check clears them.
function Evidence({ view }: { view: View }) {
  const tb = view.tb!;
  const sab: Partial<Record<string, string>> = {};
  for (const l of tb.logs) sab[l.field] = l.value;
  const fact = (id: string, f: string) => tb.facts.find((x) => x.player === id && x.field === f)?.value;
  return (
    <div className="tb-panel tb-evidence">
      <table>
        <thead>
          <tr>
            <th />
            {FIELDS.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          <tr className="sab">
            <th>Saboteur</th>
            {FIELDS.map((f) => (
              <td key={f.key}>{sab[f.key] ?? "?"}</td>
            ))}
            <td>
              <small>clues</small>
            </td>
          </tr>
          {view.players.map((p) => {
            const cleared = tb.cleared.includes(p.id);
            let out = cleared;
            const cells = FIELDS.map((f) => {
              const v = fact(p.id, f.key);
              const s = sab[f.key];
              const diff = v !== undefined && s !== undefined && v.trim().toLowerCase() !== s.trim().toLowerCase();
              if (diff) out = true;
              return (
                <td key={f.key} className={v === undefined ? "none" : diff ? "diff" : s !== undefined ? "same" : ""}>
                  {v ?? "·"}
                </td>
              );
            });
            return (
              <tr key={p.id} className={out ? "out" : ""}>
                <th>{p.name}</th>
                {cells}
                <td>
                  <small>{cleared ? "Cleared" : out ? "Ruled out" : ""}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tb-note">A match is suspicious, not proof: friends can share a favourite colour.</p>
    </div>
  );
}

// The room behind everything: two layers that crossfade when the room changes, a shade so text
// reads, a red alarm when the air is low, and a red pulse with each heartbeat.
export function TbBackdrop({ place, low }: { place: Place; low: boolean }) {
  const [layers, setLayers] = useState<{
    a: Place;
    b: Place | null;
    front: "a" | "b";
  }>({ a: place, b: null, front: "a" });
  const cur = layers.front === "a" ? layers.a : layers.b;
  if (cur !== place) setLayers(layers.front === "a" ? { ...layers, b: place, front: "b" } : { ...layers, a: place, front: "a" });
  return (
    <div className="tb-backdrop" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg(layers.a)} alt="" className={layers.front === "a" ? "on" : ""} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {layers.b && <img src={bg(layers.b)} alt="" className={layers.front === "b" ? "on" : ""} />}
      <i className={`shade${low ? " alarm" : ""}`} />
      <i className="tb-pulse" />
    </div>
  );
}

// ---------- sound, shakes and analytics on the TV ----------

// How a dive ended, in a word for charts (the database sends a sentence for the screen).
function endReason(reason: string | null | undefined) {
  const r = reason ?? "";
  if (r.startsWith("The air ran out")) return "air_out";
  if (r.includes("voted out the saboteur")) return "saboteur_caught";
  if (r.includes("Only one crew member")) return "crew_lost";
  if (r.includes("saboteur still aboard")) return "saboteur_escaped";
  if (r.includes("reached the surface together")) return "surfaced";
  return r ? "other" : null;
}

export function useTrappedTv(view: View, now: () => number, tvRef: React.RefObject<HTMLElement | null>) {
  const tb = view.tb;
  const phase = view.room.phase;
  const inStory = Boolean(tb) && phase.startsWith("tb_");
  const place = inStory ? tvPlace(view, now()) : phase === "browse" && view.room.focus === 1 ? "exterior" : null;
  const air = inStory && tb ? airNow(view, now()) : null;
  const low = inStory && lowAir(view, now());

  // The captain's radio, the room on screen, and the TV's own sound settings.
  useEffect(() => {
    sound().setRadio(inStory);
    const d = deep();
    d.enabled = () => !sound().settings.muted && sound().settings.effects;
    d.level = 1;
    d.setRoom(place);
  }, [inStory, place]);
  useEffect(() => deep().muffle(low ? air : null));

  // Hull creaks now and then during the dive, with a small nudge of the screen.
  useEffect(() => {
    if (!inStory) return;
    let t: ReturnType<typeof setTimeout>;
    const go = () => {
      t = setTimeout(
        () => {
          deep().creak();
          shake(tvRef.current, "nudge");
          go();
        },
        14000 + Math.random() * 12000,
      );
    };
    go();
    return () => clearTimeout(t);
  }, [inStory, tvRef]);

  // A heartbeat when the air runs low, faster as it runs out.
  const airRef = useRef<number | null>(null);
  useEffect(() => {
    airRef.current = air;
  });
  useEffect(() => {
    if (!low) return;
    let t: ReturnType<typeof setTimeout>;
    const beat = () => {
      deep().heartbeat();
      tvRef.current?.querySelector(".tb-pulse")?.classList.remove("on");
      void (tvRef.current as HTMLElement | null)?.offsetWidth;
      tvRef.current?.querySelector(".tb-pulse")?.classList.add("on");
      t = setTimeout(beat, 550 + Math.max(0, (airRef.current ?? 90) / 90) * 550);
    };
    beat();
    return () => clearTimeout(t);
  }, [low, tvRef]);

  // Moments: breakdowns shake the screen, the hatch clanks, the tanks flood, the captain reacts.
  const last = useRef<{
    key: string;
    fixes: number;
    slips: number;
    stage: string;
    dive: string | null;
    low: boolean;
    done: boolean;
    tries: number;
  } | null>(null);
  useEffect(() => {
    if (!tb || !inStory) {
      last.current = null;
      return;
    }
    const cur = {
      key: `${phase}:${view.room.round}`,
      fixes: tb.fixes,
      slips: tb.slips,
      stage: tb.stage,
      dive: tb.dive_at,
      low,
      done: Boolean(tb.hands?.done),
      tries: tb.repairs.reduce((n, r) => n + r.tries, 0) + (tb.hands?.tries ?? 0),
    };
    const prev = last.current;
    last.current = cur;
    if (!prev) return;
    const d = deep(),
      s = sound();
    if (prev.key !== cur.key) {
      if (phase === "tb_watch" || phase === "tb_hands") {
        shake(tvRef.current, phase === "tb_hands" && tb.hands?.kind === "leak" ? "rumble" : "shake");
        d.creak(0.4);
      }
    }
    if (cur.slips > prev.slips) {
      d.clank(false);
      shake(tvRef.current, "nudge");
    }
    if (cur.stage === "sealed" && prev.stage !== "sealed") d.clank(true);
    if (cur.dive && !prev.dive) {
      d.flood();
      shake(tvRef.current, "rumble");
    }
    if (prev.key === cur.key && (phase === "tb_watch" || phase === "tb_hands")) {
      if (cur.fixes > prev.fixes) s.cue("tb-fixed");
      else if (cur.tries > prev.tries) s.cue("tb-failed");
    }
    if (cur.low && !prev.low) s.cue("tb-air-low");
  });
  // The 30-second warning, once.
  const warned = useRef(false);
  useEffect(() => {
    if (air === null || !tb?.air_running) return;
    if (air > 30) warned.current = false;
    else if (air > 0 && !warned.current) {
      warned.current = true;
      sound().cue("tb-air-30");
    }
  }, [air, tb?.air_running]);

  // ---------- analytics (the TV sends group events once per room; see the README) ----------
  // Trapped Below's own `trapped_*` events. The game-wide ones (story_entered, game_started,
  // game_ended, replay_chosen...) come from the TV's main analytics hook for every story.
  const a = useRef({
    phase: "",
    round: 0,
    brief: 0,
    game: 0,
    watch: 0,
    hands: 0,
    repairs: 0,
    air: 0,
    solved: new Set<string>(),
    results: { ok: 0, fail: 0 },
  });
  useEffect(() => {
    if (!tb) return;
    const t = a.current;
    const round = view.room.round;
    // `saboteur`: whether this dive has one. It's only decided when orders are dealt, so the briefing leaves it out.
    const base = {
      room_id: view.room.id,
      players: view.players.length,
      ...storyProps("station"),
      ...(["tb_brief", "tb_dive", "tb_crew"].includes(phase) ? {} : { saboteur: tb.saboteur_mode }),
    };
    for (const r of tb.repairs) {
      const k = `${round}:${r.idx}`;
      if (r.solved && !t.solved.has(k)) {
        t.solved.add(k);
        if (r.result === "ok" || r.result === "fail") t.results[r.result]++;
        track("trapped_repair_done", {
          ...base,
          round,
          kind: r.kind,
          result: r.result,
          tries: r.tries,
          seconds: secondsSince(t.watch),
        });
      }
    }
    if (t.phase === phase && t.round === round) return;
    const prev = t.phase,
      prevRound = t.round;
    const airLeft = airNow(view, now());
    t.phase = phase;
    t.round = round;
    if (phase === "tb_brief" && prev !== "tb_brief") t.brief = Date.now();
    if (phase === "tb_dive" && prev === "tb_brief")
      track("trapped_onboarding_completed", {
        ...base,
        skipped: tb.skip.length === view.players.length,
        slips: tb.slips,
        seconds: secondsSince(t.brief),
      });
    // The dive starts at the orders, or at the first later screen the TV sees if it missed them.
    if (!t.game && ["tb_orders", "tb_watch", "tb_hands", "tb_talk", "tb_vote", "tb_verdict"].includes(phase)) {
      t.game = Date.now();
      t.solved.clear();
      t.results = { ok: 0, fail: 0 };
    }
    if (phase === "tb_watch") {
      t.watch = Date.now();
      t.repairs = tb.repairs.length;
      t.air = airLeft;
      track("trapped_round_started", {
        ...base,
        round,
        pairs: tb.repairs.length,
        air_left: airLeft,
      });
    }
    // A watch's repairs are over: how many got fixed and how much air the watch cost.
    if (prev === "tb_watch" && phase !== "tb_watch") {
      const done = [...t.solved].filter((k) => k.startsWith(`${prevRound}:`)).length;
      track("trapped_round_ended", {
        ...base,
        round: prevRound,
        repairs_done: done,
        repairs_total: t.repairs,
        seconds: secondsSince(t.watch),
        air_left: airLeft,
        air_change: airLeft - t.air,
        /* negative = air used; fixes add some back */ emergency: phase === "tb_hands",
      });
    }
    if (phase === "tb_hands") t.hands = Date.now();
    if (phase === "tb_verdict") {
      const r = tb.result;
      track("trapped_vote_revealed", {
        ...base,
        round,
        ejected: Boolean(r?.ejected),
        was_saboteur: Boolean(r?.was_saboteur),
        tie: Boolean(r?.tie),
        votes_cast: (r?.counts ?? []).reduce((n, c) => n + c.n, 0),
      });
    }
    if (phase === "tb_end") {
      track("trapped_game_ended", {
        ...base,
        outcome: tb.outcome ?? null,
        winner: winnerOf(tb.outcome),
        end_reason: endReason(tb.reason),
        rounds: round,
        minutes: t.game ? Math.round(secondsSince(t.game) / 6) / 10 : null,
        air_left: airLeft,
        fixes: tb.fixes,
        repairs_ok: t.results.ok,
        repairs_failed: t.results.fail,
      });
      t.game = 0; // between dives now
    }
  });
  const handsSent = useRef("");
  useEffect(() => {
    const h = tb?.hands;
    if (!h?.done) return;
    const k = `${view.room.id}:${view.room.round}`;
    if (handsSent.current === k) return;
    handsSent.current = k;
    track("trapped_emergency_done", {
      room_id: view.room.id,
      players: view.players.length,
      ...storyProps("station"),
      saboteur: Boolean(tb?.saboteur_mode),
      round: view.room.round,
      kind: h.kind,
      ok: h.ok,
      tries: h.tries,
      floods: h.floods,
      seconds: secondsSince(a.current.hands),
    });
  });

  return { place, low };
}
