"use client";

// Trapped Below on a phone. At any moment each player has one place to look: when the TV matters,
// the phone goes dark and points up; when the phone needs them, it chimes and lights up.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buzz, deep, shake } from "@/lib/gathering/deep";
import { nameOf, playerOf, type View } from "@/lib/gathering/game";
import {
  BOLT_PLACES, BRING_Q, CREW, DEEP_QUESTIONS, LEAK_JOB, MORSE, PIPE_TARGET, PLACE_BG, PLACE_NAME, WIRE_COLOURS, WIRE_HEX, bg, crewPic, fmtAir, type Place,
} from "@/lib/gathering/trapped";
import { PipeTile, airNow, lowAir, phoneFocus } from "../../host/trapped";

type Ctx = { view: View; run: (fn: string, args?: Record<string, unknown>) => Promise<boolean>; busy: boolean; error: string | null };

// The room this phone is in: its repair's room during a watch, otherwise the room the story is in.
export function phonePlace(view: View, id: string | null, now: number): Place {
  const tb = view.tb;
  const phase = view.room.phase;
  if (!tb) return "exterior";
  if (phase === "tb_end") return tb.outcome === "crew" ? "dawn" : "wreck";
  if (lowAir(view, now)) return "flooded";
  if (phase === "tb_watch") {
    const r = tb.repairs.find((x) => id && x.members.includes(id));
    return r ? (PLACE_BG[r.place] ?? "control") : "control";
  }
  if (phase === "tb_hands") return tb.hands?.kind === "sonar" ? "sonar" : tb.hands?.kind === "pipes" ? "pipewall" : "flooded";
  return ((
    { tb_brief: "control", tb_dive: "exterior", tb_crew: "quarters", tb_orders: "corridor", tb_talk: "galley", tb_vote: "galley", tb_verdict: "escape" } as Record<string, Place>
  )[phase] ?? "control");
}

const LOOK: Record<string, string> = {
  tb_brief: "The captain is explaining how to play.",
  tb_dive: "We're diving.",
  tb_crew: "Your crew file is in. Waiting for the others.",
  tb_orders: "Waiting for the others to read their orders.",
  tb_watch: "Your repair is done. Watch the others.",
  tb_hands: "Done. Watch the TV.",
  tb_talk: "Read the logs on the TV and talk it through.",
  tb_vote: "Vote's in. Watch the TV.",
  tb_verdict: "The airlock is opening.",
  tb_end: "Here's how it ended.",
};

function LookUp({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="tb-lookup">
      <span className="chev">
        <i />
        <i />
        <i />
      </span>
      <b>Eyes on the TV</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

function Head({ left, right = "Trapped Below" }: { left: string; right?: string }) {
  return (
    <div className="tb-phead">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

// The phone's frame for Trapped Below: the room behind, the glow and chime when it's your move,
// a quiet room sound, and the rare buzz.
export function TrappedPhone({ ctx, now }: { ctx: Ctx; now: () => number }) {
  const { view } = ctx;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const me = view.me;
  const n = now();
  const place = phonePlace(view, me, n);
  const focus = me ? phoneFocus(view, me) : false;
  const low = lowAir(view, n);
  const screen = useRef<HTMLDivElement>(null);
  const [wake, setWake] = useState(0);

  // The room's sound, quietly, from the phone's own speaker.
  useEffect(() => {
    const d = deep();
    d.level = 0.35;
    d.setRoom(place);
  }, [place]);
  useEffect(() => () => deep().setRoom(null), []);

  // Your move: chime and glow when the phone starts needing you.
  const was = useRef<boolean | null>(null);
  const phaseKey = `${view.room.phase}:${view.room.round}:${view.tb?.stage}`;
  const lastKey = useRef("");
  useEffect(() => {
    const before = was.current;
    was.current = focus;
    const newScreen = lastKey.current !== phaseKey;
    lastKey.current = phaseKey;
    if (focus && (before === false || (before !== null && newScreen))) {
      deep().chime();
      setWake((w) => w + 1);
    }
  }, [focus, phaseKey]);

  // Vibration, kept rare: something breaks in your room, an emergency, the air dropping low.
  const lastBuzz = useRef("");
  useEffect(() => {
    const phase = view.room.phase;
    const key = `${phase}:${view.room.round}`;
    if (lastBuzz.current === key) return;
    const first = lastBuzz.current === "";
    lastBuzz.current = key;
    if (first) return;
    if ((phase === "tb_watch" && view.tb?.repairs.some((r) => me && r.members.includes(me))) || phase === "tb_hands") {
      buzz(150);
      shake(screen.current);
    }
  }, [view.room.phase, view.room.round, view.tb?.repairs, me]);
  const lowWas = useRef(false);
  const air = view.tb ? airNow(view, n) : null;
  const warned30 = useRef(false);
  useEffect(() => {
    if (low && !lowWas.current) buzz([60, 120, 90]);
    lowWas.current = low;
    if (air !== null && air <= 30 && air > 0 && view.tb?.air_running && !warned30.current) {
      warned30.current = true;
      buzz([60, 120, 90]);
    }
    if (air !== null && air > 30) warned30.current = false;
  }, [low, air, view.tb?.air_running]);

  return (
    <div
      ref={screen}
      className={`tb-phone${focus ? "" : " idle"}${low ? " alarm" : ""}`}
      style={{ "--room": `url(${bg(place)})` } as CSSProperties}
      data-place={place}
    >
      {wake > 0 && focus && (
        <span className="tb-ymove" key={wake}>
          Your move
        </span>
      )}
      <PhoneBody ctx={ctx} now={now} focus={focus} />
    </div>
  );
}

function PhoneBody({ ctx, now, focus }: { ctx: Ctx; now: () => number; focus: boolean }) {
  const { view, run, busy } = ctx;
  const tb = view.tb!;
  const phase = view.room.phase;
  const me = playerOf(view, view.me);
  const host = view.me !== null && view.me === view.host_player;
  if (!me) return null;

  if (phase === "tb_brief") {
    if (tb.stage === "talk") {
      const skipped = tb.skip.includes(me.id);
      return (
        <LookUp text={LOOK.tb_brief}>
          {skipped ? (
            <>
              <p className="p-small">Waiting for everyone else to skip ({tb.skip.length} of {view.players.length}).</p>
              <button className="p-btn2" disabled={busy} onClick={() => void run("tb_skip", { p_on: false })}>
                Actually, keep listening
              </button>
            </>
          ) : (
            <button className="p-btn2" disabled={busy} onClick={() => void run("tb_skip", { p_on: true })}>
              We know how to play
            </button>
          )}
        </LookUp>
      );
    }
    return <HatchBolt ctx={ctx} />;
  }

  if (phase === "tb_dive") {
    if (tb.dive_at) {
      const t = Math.min(1, (now() - new Date(tb.dive_at).getTime()) / 6500);
      return (
        <div className="tb-dark">
          <span className="lbl">Depth</span>
          <b>{Math.round(412 * (1 - Math.pow(1 - Math.max(0, t), 2)))} m</b>
          <p className="p-small">Keep your screen dim.</p>
        </div>
      );
    }
    if (!host) return <LookUp text={`${nameOf(view, view.host_player)} starts the dive when the lights are down.`} />;
    return (
      <>
        <Head left="Dim the lights" />
        <div className="tb-card">
          <span className="lbl">Before we dive</span>
          <h3>Lights down.</h3>
          <p>Turn off the big lights, turn your brightness down, then start the dive.</p>
        </div>
        <div className="spacer" />
        <button className="p-btn" disabled={busy} onClick={() => void run("tb_dive")}>
          Lights are down. Dive.
        </button>
      </>
    );
  }

  if (phase === "tb_crew") return me.answered ? <LookUp text={LOOK.tb_crew} /> : <CrewFile ctx={ctx} />;
  if (phase === "tb_orders") return <Orders ctx={ctx} />;
  if (phase === "tb_watch") return <Watch ctx={ctx} focus={focus} />;
  if (phase === "tb_hands") return <Hands ctx={ctx} now={now} />;
  if (phase === "tb_vote" && !me.dead && !(tb.voted ?? []).includes(me.id)) return <Vote ctx={ctx} />;
  if (phase === "tb_talk") {
    const f = tb.mine?.crew;
    return (
      <LookUp text={LOOK.tb_talk}>
        {f && (
          <div className="tb-card small">
            <span className="lbl">Your crew file</span>
            <p>
              Colour <b>{f.colour}</b> · number <b>{f.num}</b>
              <br />
              Would bring: <b>{f.bring}</b>
              <br />
              {f.q} <b>{f.a}</b>
            </p>
          </div>
        )}
      </LookUp>
    );
  }
  if (phase === "tb_end") {
    const won = tb.outcome === "crew";
    const mine = tb.mine?.role === "saboteur";
    return (
      <LookUp text={LOOK.tb_end}>
        <h3 className="tb-h3">{won ? (mine ? "They caught you." : "You made it.") : mine ? "You got away with it." : tb.saboteur_mode ? `It was ${nameOf(view, tb.saboteur)}.` : "The air ran out."}</h3>
      </LookUp>
    );
  }
  return <LookUp text={LOOK[phase] ?? ""} />;
}

// ---------- seal the hatch ----------

function HatchBolt({ ctx }: { ctx: Ctx }) {
  const { view, run } = ctx;
  const tb = view.tb!;
  const me = view.me!;
  const sealed = tb.stage === "sealed";
  const held = tb.holds.includes(me);
  const [down, setDown] = useState(false);
  const send = useCallback((on: boolean) => void run("tb_hold", { p_on: on }), [run]);
  // Let go when the finger leaves the screen, or the phone locks.
  useEffect(() => {
    if (!down) return;
    const up = () => {
      setDown(false);
      send(false);
    };
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    document.addEventListener("visibilitychange", up);
    return () => {
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      document.removeEventListener("visibilitychange", up);
    };
  }, [down, send]);
  const others = view.players.filter((p) => p.id !== me);
  return (
    <>
      <Head left="Seal the hatch" />
      <p className="tb-q">{sealed ? "Sealed. Nice work." : "Hold your bolt at the same time as everyone else."}</p>
      <button
        className={`tb-boltbtn${down || held || sealed ? " on" : ""}`}
        style={{ "--pc": `var(--player-${playerOf(view, me)?.color ?? 1})` } as CSSProperties}
        disabled={sealed}
        onPointerDown={(e) => {
          e.preventDefault();
          setDown(true);
          send(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span>{sealed ? "Sealed" : down ? "Holding" : "Hold"}</span>
      </button>
      <div className="tb-holders">
        {others.map((p) => (
          <span key={p.id} className={tb.holds.includes(p.id) ? "on" : ""}>
            {p.name}
          </span>
        ))}
      </div>
      <p className="p-small">Keep your thumb on it for 3 seconds with everyone. If someone lets go, just try again.</p>
    </>
  );
}

// ---------- the crew file ----------

function CrewFile({ ctx }: { ctx: Ctx }) {
  const { view, run, busy, error } = ctx;
  const me = playerOf(view, view.me)!;
  const [step, setStep] = useState(0);
  const [colour, setColour] = useState<string | null>(null);
  const [num, setNum] = useState<number | null>(null);
  const [bring, setBring] = useState("");
  const [qi, setQi] = useState(() => Math.floor(Math.random() * DEEP_QUESTIONS.length));
  const [deepA, setDeepA] = useState("");
  if (!me.picked) {
    return (
      <>
        <Head left="Crew file" />
        <p className="tb-q">Who are you aboard?</p>
        <div className="tb-portraits">
          {CREW.map((c, i) => {
            const taken = view.players.find((p) => p.id !== me.id && p.picked && p.portrait === i + 1);
            return (
              <button key={c.key} disabled={busy || Boolean(taken)} className={me.portrait === i + 1 ? "on" : ""} onClick={() => void run("tb_portrait", { p_portrait: i + 1 })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crewPic(i + 1)} alt="" />
                {taken ? taken.name : c.name}
              </button>
            );
          })}
        </div>
        <p className="p-small">Just a look. Your real orders come later.</p>
        {error && <div className="err">{error}</div>}
      </>
    );
  }
  const steps = [
    {
      q: "What's your favourite colour?",
      note: "Pick one of the wire colours.",
      body: (
        <div className="tb-swatches">
          {WIRE_COLOURS.map((c) => (
            <button key={c} aria-label={c} className={colour === c ? "on" : ""} style={{ background: WIRE_HEX[c] }} onClick={() => setColour(c)} />
          ))}
        </div>
      ),
      ok: Boolean(colour),
    },
    {
      q: "Pick a number from 1 to 9.",
      note: "Your lucky number.",
      body: (
        <div className="tb-nums">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
            <button key={k} className={num === k ? "on" : ""} onClick={() => setNum(k)}>
              {k}
            </button>
          ))}
        </div>
      ),
      ok: num !== null,
    },
    {
      q: BRING_Q,
      note: "Be honest. Someone will need this.",
      body: <textarea className="tb-text" rows={2} maxLength={80} value={bring} onChange={(e) => setBring(e.target.value)} placeholder="One thing" />,
      ok: bring.trim().length > 0,
    },
    {
      q: DEEP_QUESTIONS[qi],
      note: "",
      body: (
        <>
          <textarea className="tb-text" rows={3} maxLength={120} value={deepA} onChange={(e) => setDeepA(e.target.value)} placeholder="Your answer" />
          <button className="p-btn2" onClick={() => setQi((qi + 1) % DEEP_QUESTIONS.length)}>
            Shuffle question
          </button>
        </>
      ),
      ok: deepA.trim().length > 0,
    },
  ];
  const s = steps[step];
  return (
    <>
      <Head left={`Crew file ${step + 1} of 4`} />
      <p className="tb-q">{s.q}</p>
      {s.note && <p className="p-small">{s.note}</p>}
      {s.body}
      <div className="spacer" />
      {step < 3 ? (
        <button className="p-btn" disabled={!s.ok} onClick={() => setStep(step + 1)}>
          Next
        </button>
      ) : (
        <button
          className="p-btn"
          disabled={!s.ok || busy}
          onClick={() => void run("tb_crew_file", { p_colour: colour, p_num: num, p_bring: bring.trim(), p_deep_q: DEEP_QUESTIONS[qi], p_deep_a: deepA.trim() })}
        >
          File it
        </button>
      )}
      {step > 0 && (
        <button className="p-btn2" onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}
      <p className="p-small">Answers are final once filed.</p>
      {error && <div className="err">{error}</div>}
    </>
  );
}

// ---------- sealed orders ----------

function Orders({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const me = playerOf(view, view.me)!;
  const role = view.tb?.mine?.role;
  const [opening, setOpening] = useState(false);
  if (me.ready) return <LookUp text={LOOK.tb_orders} />;
  if (!me.opened) {
    return (
      <>
        <Head left="Sealed orders" />
        <p className="tb-q">Your orders are behind the porthole.</p>
        <button
          className={`tb-porthole${opening ? " opening" : ""}`}
          disabled={busy || opening}
          onClick={() => {
            setOpening(true);
            setTimeout(() => void run("tb_orders", { p_ready: false }), 700);
          }}
        >
          Unscrew
        </button>
        <p className="p-small">Pressure-sealed. Keep your screen to yourself.</p>
      </>
    );
  }
  return (
    <>
      <Head left="Sealed orders" />
      {role === "saboteur" ? (
        <>
          <div className="tb-card secret pop">
            <span className="lbl">Saboteur</span>
            <h3>Let the air run out.</h3>
            <p>Nobody else knows. Act like crew.</p>
          </div>
          <div className="tb-card">
            <span className="lbl">What you can do</span>
            <p>
              <b>Lie.</b> When a partner asks about your answers, give the wrong one.
            </p>
            <p>
              <b>Slip.</b> Cut the wrong wire or press the wrong answer on purpose.
            </p>
            <p>
              <b>Loosen a bolt.</b> Once a watch, pick a system to fail at the start of the next (−0:30).
            </p>
            <p className="p-small">Careful: every watch with a fix recovers a log about you, from your real answers.</p>
          </div>
        </>
      ) : (
        <div className="tb-card pop">
          <span className="lbl">Crew</span>
          <h3>Keep everyone breathing.</h3>
          <p>
            {view.tb?.saboteur_mode
              ? "Fix what breaks and listen to your crewmates' answers. Someone aboard is lying about theirs. Vote them into the airlock before the air runs out."
              : "No saboteur this time. Fix what breaks and keep the air up for four watches to reach the surface."}
          </p>
        </div>
      )}
      <div className="spacer" />
      <button className="p-btn" disabled={busy} onClick={() => void run("tb_orders", { p_ready: true })}>
        Ready
      </button>
    </>
  );
}

// ---------- the watch: repairs ----------

function Watch({ ctx, focus }: { ctx: Ctx; focus: boolean }) {
  const { view } = ctx;
  const mine = view.tb?.mine;
  const rep = mine?.repair;
  const bolt = mine?.can_bolt || mine?.bolt ? <BoltPanel ctx={ctx} /> : null;
  if (!rep || !focus) {
    return (
      <LookUp text={rep?.solved ? (rep.result === "ok" ? "Fixed. Watch the others." : "Half a fix. Watch the others.") : LOOK.tb_watch}>{bolt}</LookUp>
    );
  }
  return (
    <>
      <Head left={`${PLACE_NAME[rep.place] ?? rep.place} · ${rep.kind === "wires" ? (rep.is_lead ? "panel" : "manual") : rep.is_lead ? "operator" : "guide"}`} right={`Watch ${view.room.round}`} />
      {rep.kind === "wires" ? rep.is_lead ? <WirePanel ctx={ctx} /> : <WireManual ctx={ctx} /> : rep.is_lead ? <Operator ctx={ctx} /> : <Guide ctx={ctx} />}
      {bolt}
    </>
  );
}

function WirePanel({ ctx }: { ctx: Ctx }) {
  const { view, run, busy, error } = ctx;
  const rep = view.tb!.mine!.repair!;
  const [cut, setCut] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const readers = rep.members.filter((m) => m !== rep.lead).map((m) => nameOf(view, m));
  return (
    <>
      <p className="p-small">{readers.join(" & ")} {readers.length > 1 ? "have" : "has"} the manual. It&apos;s all about you. Answer their questions.</p>
      <span className="lbl">Wires · tap to cut one</span>
      <div className="tb-wires">
        {WIRE_COLOURS.map((c) => (
          <button key={c} className={`wire${cut === c ? " cut" : ""}`} style={{ background: WIRE_HEX[c] }} aria-label={`${c} wire`} onClick={() => setCut(cut === c ? null : c)} />
        ))}
      </div>
      <span className="lbl">Code lock</span>
      <div className="tb-lcd">{(code + "__").slice(0, 2)}</div>
      <div className="tb-keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((k) => (
          <button key={k} onClick={() => setCode(code.length >= 2 ? String(k) : code + k)}>
            {k}
          </button>
        ))}
      </div>
      <button className="p-btn" disabled={busy || !cut || code.length < 2} onClick={() => void run("tb_restart", { p_cut: cut, p_code: code }).then(() => setCode(""))}>
        Restart engine
      </button>
      {rep.msg && <p className="p-small" style={{ color: "var(--bad)" }}>{rep.msg}. Something&apos;s still off. −0:10</p>}
      {error && <div className="err">{error}</div>}
    </>
  );
}

function WireManual({ ctx }: { ctx: Ctx }) {
  const rep = ctx.view.tb!.mine!.repair!;
  const who = rep.lead_name;
  return (
    <>
      <div className="tb-card">
        <span className="lbl">Repair manual · about {who}</span>
        {rep.riddles?.includes("wire") && (
          <p className="riddle">
            Cut the wire in <b>{who}&apos;s favourite colour</b>. Only that one.
          </p>
        )}
        {rep.riddles?.includes("code") && (
          <p className="riddle">
            The code is <b>{who}&apos;s lucky number</b>, then the <b>number of letters in the first word</b> of {who}&apos;s answer to “{rep.lead_q}”. (Ten letters or more: use the last digit.)
          </p>
        )}
      </div>
      <p className="p-small">You can&apos;t see the panel. Ask {who}, or guess and check: a failed restart costs 10 seconds.</p>
      {rep.riddles?.length === 1 && <p className="p-small">Your partner has the other half of the manual.</p>}
    </>
  );
}

function Guide({ ctx }: { ctx: Ctx }) {
  const rep = ctx.view.tb!.mine!.repair!;
  return (
    <>
      <div className="tb-card">
        <span className="lbl">Question about {rep.lead_name}</span>
        <p className="riddle">
          Trapped underwater for a week, what one thing would <b>{rep.lead_name}</b> bring?
        </p>
      </div>
      <p className="p-small">Say your guess out loud. {rep.lead_name} has everyone&apos;s answers, but not this question, and presses the closest one.</p>
    </>
  );
}

function Operator({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const rep = view.tb!.mine!.repair!;
  const guides = rep.members.filter((m) => m !== rep.lead).map((m) => nameOf(view, m));
  return (
    <>
      <p className="tb-q">Press the one closest to what {guides.join(" & ")} {guides.length > 1 ? "say" : "says"}.</p>
      <div className="tb-opts">
        {(rep.options ?? []).map((o, i) => (
          <button key={i} className="p-btn2" disabled={busy} onClick={() => void run("tb_pick", { p_pick: i })}>
            {o}
          </button>
        ))}
      </div>
      <p className="p-small">You can&apos;t see the question. Right answer: +air. Wrong: a little.</p>
    </>
  );
}

function BoltPanel({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const mine = view.tb?.mine;
  return (
    <div className="tb-card secret">
      <span className="lbl">Saboteur · loosen a bolt</span>
      {mine?.bolt ? (
        <p>Done. The {PLACE_NAME[mine.bolt]?.toLowerCase() ?? mine.bolt} gives way next watch.</p>
      ) : (
        <>
          <p>What fails at the start of next watch?</p>
          <div className="tb-opts row">
            {BOLT_PLACES.map((p) => (
              <button key={p} className="p-btn2" disabled={busy} onClick={() => void run("tb_bolt", { p_place: p })}>
                {(PLACE_NAME[p] ?? p).replace(" room", "").replace(" bay", "").replace(" tanks", "")}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- all hands ----------

function Hands({ ctx, now }: { ctx: Ctx; now: () => number }) {
  const h = ctx.view.tb!.hands!;
  if (h.done) return <LookUp text={h.ok ? "Fixed. Watch the TV." : "Watch the TV."} />;
  if (h.kind === "sonar") return <Sonar ctx={ctx} />;
  if (h.kind === "pipes") return <Pipes ctx={ctx} />;
  return <Leak ctx={ctx} now={now} />;
}

function Sonar({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const mine = view.tb!.mine!;
  const h = view.tb!.hands!;
  const [pulse, setPulse] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [word, setWord] = useState("");
  if (mine.listener && mine.signal) {
    return (
      <>
        <Head left="Sonar · headset" />
        <p className="tb-q">Play the signal. Read it out to the crew: short or long.</p>
        <button
          className={`tb-listen${pulse ? " pulse" : ""}`}
          disabled={playing}
          onClick={() => {
            setPlaying(true);
            const secs = deep().morse(mine.signal!, setPulse);
            setTimeout(() => setPlaying(false), secs * 1000 + 300);
          }}
        >
          {playing ? "···" : "Play signal"}
        </button>
        <p className="p-small">Android phones vibrate too. Play it as often as you need.</p>
      </>
    );
  }
  return (
    <>
      <Head left="Sonar · code book" />
      <p className="tb-q">{nameOf(view, h.listener)} reads out shorts and longs. Turn them into letters.</p>
      <div className="tb-card">
        <div className="tb-morse">
          {Object.entries(MORSE).map(([l, c]) => (
            <span key={l}>
              <b>{l}</b>
              {c.replace(/\./g, "·").replace(/-/g, "–")}
            </span>
          ))}
        </div>
      </div>
      <input className="tb-text tb-word" maxLength={h.letters} value={word} onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder={"_".repeat(h.letters)} />
      <button className="p-btn" disabled={busy || word.length !== h.letters} onClick={() => void run("tb_sonar", { p_word: word }).then(() => setWord(""))}>
        Send
      </button>
      {h.tries > 0 && <p className="p-small">{h.tries} wrong so far. −0:10 each.</p>}
    </>
  );
}

function Pipes({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const mine = view.tb!.mine!;
  const h = view.tb!.hands!;
  const see = mine.see ?? 0, turn = mine.turn ?? 1;
  return (
    <>
      <Head left="Ballast" />
      <span className="lbl">Your map: row {see + 1}</span>
      <div className="tb-ptiles">
        {[0, 1, 2].map((c) => (
          <div key={c} className="ptile">
            <PipeTile i={see * 3 + c} rot={PIPE_TARGET[see * 3 + c]} map />
          </div>
        ))}
      </div>
      <p className="p-small">Orange pipes carry the water. Tell whoever turns row {see + 1}.</p>
      <span className="lbl">Your valves: row {turn + 1}</span>
      <div className="tb-ptiles">
        {[0, 1, 2].map((c) => {
          const i = turn * 3 + c;
          return (
            <button key={c} className="ptile" disabled={busy} aria-label={`Turn valve ${c + 1}`} onClick={() => void run("tb_rotate", { p_tile: i })}>
              <PipeTile i={i} rot={h.rot[i]} />
            </button>
          );
        })}
      </div>
      <p className="p-small">Tap to turn. You can&apos;t see this row&apos;s map: ask.</p>
    </>
  );
}

// The hull breach: shake (motion), blow (microphone), level (tilt) or hold. Each phone reports its
// work twice a second. Sensors need a tap to ask permission on iPhones; touch always works too.
function Leak({ ctx, now }: { ctx: Ctx; now: () => number }) {
  const { view } = ctx;
  const job = view.tb!.mine!.leak ?? "pump";
  const h = view.tb!.hands!;
  const info = LEAK_JOB[job];
  const work = useRef(0);
  const holding = useRef(false);
  const [sensor, setSensor] = useState<"off" | "on" | "denied">("off");
  const [hold, setHold] = useState(false);
  const [bubble, setBubble] = useState(50);
  const [blowing, setBlowing] = useState(false);
  const run = ctx.run;

  // Report twice a second while there's work to report (or the hatch changes), and every few
  // seconds anyway, so every screen doesn't reload more than it needs to.
  useEffect(() => {
    let sentHold = false, quiet = 0;
    const t = setInterval(() => {
      const w = work.current;
      if (w === 0 && holding.current === sentHold && ++quiet < 6) return;
      quiet = 0;
      work.current = 0;
      sentHold = holding.current;
      void run("tb_leak", { p_work: w, p_holding: holding.current });
    }, 500);
    return () => clearInterval(t);
  }, [run]);

  // Sensors.
  useEffect(() => {
    if (sensor !== "on") return;
    let last = 0;
    let stream: MediaStream | null = null;
    let raf = 0;
    const offs: (() => void)[] = [];
    if (job === "pump") {
      const onMove = (e: DeviceMotionEvent) => {
        const a = e.accelerationIncludingGravity;
        if (!a) return;
        const m = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
        if (Math.abs(m - last) > 12) work.current += 0.5;
        last = m;
      };
      addEventListener("devicemotion", onMove);
      offs.push(() => removeEventListener("devicemotion", onMove));
    } else if (job === "level") {
      let prev = performance.now();
      const onTilt = (e: DeviceOrientationEvent) => {
        const b = e.beta ?? 0, g = e.gamma ?? 0;
        setBubble(Math.max(0, Math.min(100, 50 + g * 2)));
        const t = performance.now();
        if (Math.abs(b) < 12 && Math.abs(g) < 12) work.current += Math.min(0.5, (t - prev) / 1000);
        prev = t;
      };
      addEventListener("deviceorientation", onTilt);
      offs.push(() => removeEventListener("deviceorientation", onTilt));
    } else if (job === "blow") {
      void navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((s) => {
          stream = s;
          const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const c = new C();
          const an = c.createAnalyser();
          c.createMediaStreamSource(s).connect(an);
          const d = new Float32Array(an.fftSize);
          let prev = performance.now();
          const step = () => {
            an.getFloatTimeDomainData(d);
            const rms = Math.sqrt(d.reduce((x, v) => x + v * v, 0) / d.length);
            const t = performance.now();
            const on = rms > 0.08;
            setBlowing(on);
            if (on) work.current += (t - prev) / 1000;
            prev = t;
            raf = requestAnimationFrame(step);
          };
          step();
          offs.push(() => void c.close());
        })
        .catch(() => setSensor("denied"));
    }
    return () => {
      offs.forEach((f) => f());
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [sensor, job]);

  // Touch: tapping pumps, pressing blows or holds the hatch, the slider levels.
  useEffect(() => {
    if (!hold) return;
    let prev = performance.now();
    const t = setInterval(() => {
      const n = performance.now();
      if (job === "blow") work.current += (n - prev) / 1000;
      prev = n;
    }, 100);
    const up = () => {
      setHold(false);
      holding.current = false;
    };
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      clearInterval(t);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, [hold, job]);
  useEffect(() => {
    if (job !== "level" || sensor === "on") return;
    let prev = performance.now();
    const t = setInterval(() => {
      const n = performance.now();
      if (Math.abs(bubble - 50) < 12) work.current += (n - prev) / 1000;
      prev = n;
    }, 200);
    return () => clearInterval(t);
  }, [bubble, job, sensor]);

  const askSensor = async () => {
    try {
      const M = (job === "level" ? window.DeviceOrientationEvent : window.DeviceMotionEvent) as unknown as { requestPermission?: () => Promise<string> };
      if (job !== "blow" && M?.requestPermission) {
        const r = await M.requestPermission();
        if (r !== "granted") return setSensor("denied");
      }
      setSensor("on");
    } catch {
      setSensor("denied");
    }
  };
  const water = Math.min(100, h.water + Math.max(0, (now() - Math.max(new Date(h.leak_at).getTime(), new Date(view.server_now).getTime())) / 1000) * h.rate);

  return (
    <>
      <Head left="Hull breach" right={`Water ${Math.round(water)}%`} />
      <p className="tb-q">{info.title}</p>
      {job !== "hatch" && sensor === "off" && (
        <button className="p-btn2" onClick={() => void askSensor()}>
          {job === "blow" ? "Use the microphone" : job === "pump" ? "Use shaking" : "Use tilting"}
        </button>
      )}
      {sensor === "on" && <p className="p-small">{info.how}</p>}
      {sensor === "denied" && <p className="p-small">No sensor here. Use the screen instead.</p>}
      {job === "pump" && (
        <button className="tb-pump" onPointerDown={() => (work.current += 1)}>
          Pump
        </button>
      )}
      {(job === "blow" || job === "hatch") && (
        <button
          className={`tb-press${hold || blowing ? " on" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setHold(true);
            if (job === "hatch") holding.current = true;
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {job === "hatch" ? (hold ? "Holding…" : "Press and hold") : hold || blowing ? "Clearing…" : "Hold to blow"}
        </button>
      )}
      {job === "level" && (
        <>
          <div className={`tb-level-bar${Math.abs(bubble - 50) < 12 ? " ok" : ""}`}>
            <i style={{ left: `${bubble}%` }} />
            <span />
          </div>
          {sensor !== "on" && <input type="range" min={0} max={100} value={bubble} onChange={(e) => setBubble(+e.target.value)} aria-label="Level" />}
        </>
      )}
      <p className="p-small">{info.fallback}</p>
      <AirLine view={view} now={now} />
    </>
  );
}

function AirLine({ view, now }: { view: View; now: () => number }) {
  return <p className="p-small">Air {fmtAir(airNow(view, now()))}</p>;
}

// ---------- the vote ----------

function Vote({ ctx }: { ctx: Ctx }) {
  const { view, run, busy } = ctx;
  const [pick, setPick] = useState<string | null>(null);
  const others = view.players.filter((p) => p.id !== view.me && !p.dead);
  return (
    <>
      <Head left="Vote" />
      <p className="tb-q">Who goes in the airlock?</p>
      <div className="tb-opts">
        {others.map((p) => (
          <button key={p.id} className={`p-btn2${pick === p.id ? " on" : ""}`} onClick={() => setPick(p.id)}>
            {p.name}
          </button>
        ))}
        <button className={`p-btn2${pick === "skip" ? " on" : ""}`} onClick={() => setPick("skip")}>
          Nobody yet
        </button>
      </div>
      <div className="spacer" />
      <button className="p-btn" disabled={!pick || busy} onClick={() => void run("tb_vote", { p_target: pick })}>
        Vote
      </button>
      {view.tb?.mine?.role === "saboteur" && <p className="p-small">Steer it. If it ties, nobody goes in.</p>}
    </>
  );
}
