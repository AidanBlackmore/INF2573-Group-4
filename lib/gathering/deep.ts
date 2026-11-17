"use client";

// Trapped Below's sound effects, made in the browser with Web Audio (no files to load).
// - Each room of the sub has its own sound (engine hum and clanks, sonar pings, drips, the galley
//   kettle...). The TV plays the room on screen; each phone plays its own room quietly.
// - Hull creaks now and then, a heartbeat when the air runs low, the hatch clanking, a flooding rush.
// - Phones chime when they need their player ("your move").
// The ambience track and the captain are in sound.ts (TV only).

import type { Place } from "./trapped";

// Each room's level, measured so it sits clearly on top of the ambience track.
const ROOM_GAIN: Partial<Record<Place, number>> = {
  engine: 1, sonar: 3.2, quarters: 3.6, galley: 4.2, corridor: 3, cargo: 3, escape: 3, control: 3, torpedo: 3, pipewall: 2.6, exterior: 1.4, wreck: 1.4, dawn: 1.4, flooded: 1.3,
};

type Room = { stop: () => void };

class Deep {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private roomBus: GainNode | null = null;
  private roomLP: BiquadFilterNode | null = null;
  private noise: Record<string, AudioBuffer> = {};
  private cur: Room | null = null;
  private curName: Place | null = null;
  private wanted: Place | null = null;
  // Phones play their room quietly; the TV plays it out loud.
  level = 1;
  // The TV's sound settings (mute, effects off) switch this off.
  enabled = () => true;

  constructor() {
    const wake = () => {
      const c = this.ctx();
      if (c && c.state !== "running") void c.resume().then(() => this.apply());
      else this.apply();
    };
    addEventListener("pointerdown", wake, { capture: true });
    addEventListener("keydown", wake, { capture: true });
    setTimeout(wake, 0);
  }

  private ctx() {
    if (!this.ac) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.ac = new C();
      this.master = this.ac.createGain();
      this.master.connect(this.ac.destination);
      this.roomLP = Object.assign(this.ac.createBiquadFilter(), { type: "lowpass" as BiquadFilterType });
      this.roomLP.frequency.value = 18000;
      this.roomBus = this.ac.createGain();
      this.roomBus.connect(this.roomLP).connect(this.master);
    }
    return this.ac;
  }
  private running() {
    return this.ac?.state === "running" && this.enabled();
  }

  private nbuf(type: "white" | "brown") {
    const c = this.ac!;
    if (this.noise[type]) return this.noise[type];
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return (this.noise[type] = b);
  }

  // ---------- rooms ----------
  // Which room's sound should play (null for none). Crossfades.
  setRoom(name: Place | null) {
    this.wanted = name;
    this.apply();
  }
  private apply() {
    if (!this.running()) {
      if (this.cur && !this.enabled()) {
        this.cur.stop();
        this.cur = null;
        this.curName = null;
      }
      return;
    }
    if (this.master) this.master.gain.value = this.level;
    if (this.wanted === this.curName) return;
    this.cur?.stop();
    this.curName = this.wanted;
    this.cur = this.wanted ? this.room(this.wanted) : null;
  }

  // Low air: the rooms sound muffled, like your ears are ringing.
  muffle(airLeft: number | null) {
    const c = this.ac;
    if (!c || !this.roomLP) return;
    const f = airLeft !== null && airLeft < 90 ? 500 + Math.max(0, airLeft / 90) * 2500 : 18000;
    this.roomLP.frequency.setTargetAtTime(f, c.currentTime, 0.4);
  }

  private room(name: Place): Room {
    const c = this.ac!;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(ROOM_GAIN[name] ?? 1, c.currentTime + 1.5);
    out.connect(this.roomBus!);
    const nodes: AudioScheduledSourceNode[] = [], timers: ReturnType<typeof setTimeout>[] = [];
    let alive = true;
    const src = <T extends AudioScheduledSourceNode>(n: T) => {
      nodes.push(n);
      n.start();
      return n;
    };
    const filt = (type: BiquadFilterType, f: number, q = 1) => {
      const x = c.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q;
      return x;
    };
    const gain = (v: number) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const bed = (type: "white" | "brown", ft: BiquadFilterType, f: number, q: number, v: number) => {
      const n = c.createBufferSource();
      n.buffer = this.nbuf(type);
      n.loop = true;
      const g = gain(v);
      n.connect(filt(ft, f, q)).connect(g).connect(out);
      src(n);
      return g;
    };
    const hum = (f: number, type: OscillatorType, v: number, lp = 400) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = gain(v);
      o.connect(filt("lowpass", lp)).connect(g).connect(out);
      src(o);
      return g;
    };
    const lfo = (param: AudioParam, rate: number, depth: number) => {
      const o = c.createOscillator();
      o.frequency.value = rate;
      o.connect(gain(depth)).connect(param);
      src(o);
    };
    const blip = (f: number, dur: number, v: number, type: OscillatorType = "sine", to = f, dest: AudioNode = out) => {
      const t = c.currentTime, o = c.createOscillator(), g = gain(0);
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start();
      o.stop(t + dur + 0.05);
    };
    const burst = (ft: BiquadFilterType, f: number, dur: number, v: number, q = 1) => {
      const t = c.currentTime, n = c.createBufferSource(), g = gain(v);
      n.buffer = this.nbuf("white");
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(filt(ft, f, q)).connect(g).connect(out);
      n.start();
      n.stop(t + dur + 0.05);
    };
    const every = (min: number, max: number, fn: () => void) => {
      const go = () => {
        if (!alive) return;
        fn();
        timers.push(setTimeout(go, min + Math.random() * (max - min)));
      };
      timers.push(setTimeout(go, Math.random() * min));
    };
    const drips = (min: number, max: number) => every(min, max, () => blip(1500 + Math.random() * 700, 0.08, 0.1, "sine", 600));
    switch (name) {
      case "exterior":
      case "wreck":
      case "dawn":
        bed("brown", "lowpass", 160, 1, 0.6);
        every(8000, 14000, () => blip(190, 2.6, 0.05, "sine", 110));
        break;
      case "corridor":
      case "cargo":
      case "escape":
        bed("brown", "lowpass", 300, 1, 0.3);
        hum(50, "sawtooth", 0.05, 150);
        drips(1400, 4000);
        if (name === "escape") every(5000, 9000, () => burst("highpass", 3500, 1.2, 0.07));
        break;
      case "control":
        hum(60, "sine", 0.07);
        bed("white", "bandpass", 2500, 1, 0.025);
        every(1200, 3000, () => blip([880, 1046, 1318][Math.floor(Math.random() * 3)], 0.09, 0.04, "square"));
        break;
      case "engine": {
        const h = hum(46, "sawtooth", 0.28, 140);
        lfo(h.gain, 3, 0.1);
        bed("brown", "lowpass", 400, 1, 0.35);
        every(1500, 2400, () => burst("bandpass", 1800, 0.12, 0.3, 8));
        break;
      }
      case "torpedo": {
        const f = bed("white", "bandpass", 900, 0.7, 0.07);
        lfo(f.gain, 7, 0.04);
        hum(120, "triangle", 0.035);
        every(4000, 7000, () => burst("highpass", 4000, 0.8, 0.06));
        break;
      }
      case "sonar": {
        hum(55, "sine", 0.06);
        const dl = c.createDelay();
        dl.delayTime.value = 0.45;
        const fb = gain(0.35);
        dl.connect(fb).connect(dl);
        dl.connect(out);
        every(4000, 4000, () => {
          blip(1250, 1.3, 0.16, "sine", 1240);
          blip(1250, 1.3, 0.1, "sine", 1240, dl);
        });
        break;
      }
      case "pipewall": {
        const h = bed("white", "highpass", 3000, 1, 0.05);
        lfo(h.gain, 0.2, 0.04);
        bed("brown", "lowpass", 250, 1, 0.2);
        every(2000, 5000, () => {
          for (let i = 0; i < 4; i++) setTimeout(() => alive && blip(180 + Math.random() * 220, 0.12, 0.08), i * 90);
        });
        break;
      }
      case "quarters":
        bed("brown", "lowpass", 250, 1, 0.22);
        drips(3000, 7000);
        break;
      case "galley": {
        bed("brown", "lowpass", 250, 1, 0.15);
        const k = bed("white", "bandpass", 1200, 3, 0.05);
        lfo(k.gain, 14, 0.04);
        every(5000, 9000, () => blip(2600, 0.25, 0.05, "sine", 2550));
        break;
      }
      case "flooded": {
        bed("white", "bandpass", 700, 0.5, 0.3);
        bed("brown", "lowpass", 300, 1, 0.3);
        let hi = true;
        every(520, 520, () => {
          blip(hi ? 440 : 330, 0.45, 0.05, "square");
          hi = !hi;
        });
        break;
      }
    }
    return {
      stop() {
        alive = false;
        timers.forEach(clearTimeout);
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.setValueAtTime(out.gain.value, c.currentTime);
        out.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
        setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              // Already stopped.
            }
          });
          out.disconnect();
        }, 1400);
      },
    };
  }

  // ---------- one-off sounds ----------
  private tone(at: number, type: OscillatorType, f: number, peak: number, dur: number, to?: number) {
    const c = this.ac!, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  // A low groan in the hull.
  creak(v = 0.25) {
    if (!this.running()) return;
    const c = this.ac!, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(72, t);
    o.frequency.linearRampToValueAtTime(46, t + 1.6);
    f.type = "bandpass";
    f.frequency.value = 320;
    f.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + 1.7);
    o.connect(f).connect(g).connect(this.master!);
    o.start();
    o.stop(t + 1.8);
  }
  // Lub-dub, under everything (not muffled).
  heartbeat() {
    if (!this.running()) return;
    const t = this.ac!.currentTime;
    this.tone(t, "sine", 58, 0.55, 0.22, 42);
    this.tone(t + 0.2, "sine", 58, 0.35, 0.22, 42);
  }
  // The hatch: a heavy clank (sealed) or a dull one (a bolt slipped).
  clank(good: boolean) {
    if (!this.running()) return;
    const t = this.ac!.currentTime;
    this.tone(t, "square", good ? 220 : 140, 0.15, 0.3, good ? 110 : 70);
    this.tone(t + 0.12, "square", good ? 330 : 90, 0.15, 0.3, good ? 165 : 45);
  }
  // The tanks flooding as the sub dives.
  flood() {
    if (!this.running()) return;
    const c = this.ac!, t = c.currentTime, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.nbuf("white");
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1600, t + 3);
    f.frequency.linearRampToValueAtTime(200, t + 6.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 1);
    g.gain.linearRampToValueAtTime(0, t + 6.5);
    n.connect(f).connect(g).connect(this.master!);
    n.start();
    n.stop(t + 7);
    this.creak(0.5);
  }
  // "Your move": a bright two-note chime. The only sound a phone makes for itself.
  chime() {
    if (!this.running()) return;
    const t = this.ac!.currentTime;
    this.tone(t, "triangle", 988, 0.14, 0.35);
    this.tone(t + 0.11, "triangle", 1319, 0.14, 0.35);
  }
  // The sonar signal: a beep for each short and long. Returns how long it takes, in seconds.
  morse(signal: string, onBeep?: (on: boolean) => void) {
    const DOT = 0.18, DASH = 0.54, GAP = 0.18, LETTER = 0.7;
    let t = 0;
    const vib: number[] = [];
    for (const ch of signal) {
      if (ch === " ") {
        t += LETTER - GAP;
        if (vib.length) vib[vib.length - 1] = Math.round(LETTER * 1000);
        continue;
      }
      const d = ch === "." ? DOT : DASH;
      const at = t;
      if (this.running()) this.tone(this.ac!.currentTime + at, "sine", 640, 0.2, d);
      setTimeout(() => onBeep?.(true), at * 1000);
      setTimeout(() => onBeep?.(false), (at + d) * 1000);
      vib.push(Math.round(d * 1000), Math.round(GAP * 1000));
      t += d + GAP;
    }
    buzz(vib);
    return t;
  }
}

// Vibration, kept rare (Android only; iPhones can't vibrate from a web page): a breakdown in your
// room, the air dropping under 1:30 and again at 0:30, and the sonar signal.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not allowed here.
  }
}

// A shake of an element (the TV, a phone screen) for a breakdown, a creak or the dive.
export function shake(el: Element | null | undefined, kind: "shake" | "nudge" | "rumble" = "shake") {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove(kind);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(kind);
  setTimeout(() => el.classList.remove(kind), kind === "rumble" ? 6600 : 700);
}

let instance: Deep | null = null;
export function deep(): Deep {
  instance ??= new Deep();
  return instance;
}
