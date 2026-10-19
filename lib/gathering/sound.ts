"use client";

// Sound for the TV: background music, the narrator and sound effects.
// Phones stay silent. Browsers only allow sound after a click, so everything
// starts on the first click on the TV page.

import { NARRATION } from "./content";

export type SoundSettings = { music: boolean; narrator: boolean; effects: boolean; muted: boolean; volume: number };
const KEY = "gathering:sound";
const DEFAULTS: SoundSettings = { music: true, narrator: true, effects: true, muted: false, volume: 20 };

type Listener = (s: SoundSettings) => void;

class Sound {
  settings: SoundSettings = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private phase = "lobby";
  private speaking = false;

  // ---------- music ----------
  // Two copies of the track take turns: 4 seconds before one ends, the other
  // starts and they crossfade, so the loop never stops. Each starts past the
  // near-silent first 2.6 seconds.
  private tracks: HTMLAudioElement[] = [];
  private cur = 0;
  private xfAt = 0;
  private level = 0;
  private playing = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) this.settings = { ...DEFAULTS, ...saved };
    } catch {
      // Private mode or blocked storage: use the defaults.
    }
    this.tracks = [0, 1].map(() => Object.assign(new Audio("/audio/ambience.mp3"), { preload: "none" }));
    this.tracks.forEach((a, i) => a.addEventListener("ended", () => { if (this.playing && i === this.cur) this.loopNow(); }));
    setInterval(() => this.ramp(), 60);
    addEventListener("pointerdown", () => this.unlock(), { capture: true });
    // Lightning every 15 to 30 seconds once the game has started.
    const storm = () => setTimeout(() => {
      if (this.phase !== "lobby") {
        this.flash?.();
        setTimeout(() => this.thunder(0.45), 900);
      }
      storm();
    }, 15000 + Math.random() * 15000);
    storm();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.settings);
    return () => void this.listeners.delete(fn);
  }

  set(patch: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Not saved; fine.
    }
    if (patch.music === true) this.startMusic();
    if (patch.music === false) this.stopMusic();
    if (patch.narrator === false) this.stopVoice();
    this.listeners.forEach((fn) => fn(this.settings));
  }

  // The TV tells us which screen is showing, for the music level and the narrator.
  setPhase(phase: string) {
    this.phase = phase;
  }

  // Set by the TV so lightning can flash the screen.
  flash: (() => void) | null = null;

  private unlock() {
    this.ctx();
    if (this.settings.music && !this.playing) this.startMusic();
  }

  private startMusic() {
    const a = this.tracks[this.cur];
    if (a.currentTime < 2.6) a.currentTime = 2.6;
    a.play().then(() => (this.playing = true)).catch(() => {});
  }

  private stopMusic() {
    this.playing = false;
    this.tracks.forEach((a) => a.pause());
  }

  private loopNow() {
    const next = this.tracks[1 - this.cur];
    next.currentTime = 2.6;
    next.volume = 0;
    next.play().catch(() => {});
    this.cur = 1 - this.cur;
    this.xfAt = performance.now();
  }

  // The music dips under the narrator, sits lower while pairs work on locks,
  // and almost disappears while the votes are counted.
  private ramp() {
    const duck = (this.speaking ? 0.4 : 1) * ((({ tasks: 0.65, tally: 0.12 }) as Record<string, number>)[this.phase] ?? 1);
    const target = this.settings.muted ? 0 : (this.settings.volume / 100) * duck;
    this.level += (target - this.level) * 0.12;
    const a = this.tracks[this.cur], b = this.tracks[1 - this.cur];
    if (this.playing && !a.paused && a.duration && a.currentTime > a.duration - 4 && b.paused) {
      b.preload = "auto";
      this.loopNow();
      return;
    }
    const f = Math.min(1, (performance.now() - this.xfAt) / 4000); // equal-power crossfade
    a.volume = Math.min(1, Math.max(0, this.level * Math.sin((f * Math.PI) / 2)));
    if (!b.paused) {
      if (f >= 1) b.pause();
      else b.volume = Math.min(1, Math.max(0, this.level * Math.cos((f * Math.PI) / 2)));
    }
  }

  // ---------- narrator ----------
  private said = "";
  private run = 0;
  private clip: HTMLAudioElement | null = null;

  // Reads a screen's lines once: the recording if there is one, otherwise the browser's voice.
  narrate(key: string, ids: string[]) {
    if (key === this.said) return;
    this.said = key;
    const run = ++this.run;
    this.stopVoice();
    if (!this.settings.narrator || !ids.length) return;
    const next = (i: number) => {
      if (run !== this.run) return;
      if (i >= ids.length) {
        this.speaking = false;
        return;
      }
      const done = () => setTimeout(() => next(i + 1), 400);
      const clip = new Audio(`/narration/${ids[i]}.mp3`);
      this.clip = clip;
      clip.onplay = () => (this.speaking = true);
      clip.onended = done;
      clip.onerror = () => {
        this.clip = null;
        if (run === this.run) this.speak(NARRATION[ids[i]] ?? "", run, done);
      };
      clip.play().catch(() => {});
    };
    next(0);
  }

  private stopVoice() {
    this.run++;
    if (this.clip) {
      this.clip.onerror = this.clip.onended = null;
      this.clip.pause();
      this.clip = null;
    }
    window.speechSynthesis?.cancel();
    this.speaking = false;
  }

  // Fallback: the browser's voice, a sentence at a time.
  private speak(text: string, run: number, done: () => void) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return done();
    const voice = britishMale(synth);
    const lines = (text.match(/[^.!?]+[.!?]+["”’]?/g) ?? [text]).map((l) => l.trim());
    const say = (i: number) => {
      if (run !== this.run) return;
      if (i >= lines.length) return done();
      const u = Object.assign(new SpeechSynthesisUtterance(lines[i]), { lang: "en-GB", rate: 0.95, pitch: 1 });
      if (voice) u.voice = voice;
      u.onstart = () => (this.speaking = true);
      u.onend = u.onerror = () => setTimeout(() => say(i + 1), /[?!]$/.test(lines[i]) ? 450 : 320);
      synth.speak(u);
    };
    say(0);
  }

  // ---------- sound effects ----------
  // Thunder, the lock clicking open, the clock chiming the hour, a scream and a
  // sting when a body is found, the gavel at the verdict, a dog barking at
  // eleven, and a light heartbeat with a soft tick as the timer runs out.
  // If a recording exists at /sfx/<name>.mp3 it plays that; otherwise the sound
  // is synthesised with Web Audio.
  private audio: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private verb: ConvolverNode | null = null;
  private missing = new Set<string>();

  private ctx() {
    if (!this.audio) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.audio = new C();
    }
    if (this.audio.state === "suspended") void this.audio.resume();
    return this.audio;
  }

  private ok() {
    return this.settings.effects && !this.settings.muted;
  }

  private noiseBuf(c: AudioContext) {
    if (!this.noise) {
      this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  // A short room echo, so the scream and the bark sound like they come from elsewhere in the house.
  private room(c: AudioContext) {
    if (!this.verb) {
      const len = c.sampleRate * 2.2, b = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.verb = c.createConvolver();
      this.verb.buffer = b;
      const g = c.createGain();
      g.gain.value = 0.5;
      this.verb.connect(g).connect(c.destination);
    }
    return this.verb;
  }

  private env(c: AudioContext, at: number, peak: number, attack: number, decay: number, wet = false) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak * 0.7, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(c.destination);
    if (wet) g.connect(this.room(c));
    return g;
  }

  private noiseHit(c: AudioContext, at: number, type: BiquadFilterType, from: number, to: number, peak: number, attack: number, decay: number, wet = false) {
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
    src.connect(f).connect(this.env(c, at, peak, attack, decay, wet));
    src.start(at);
    src.stop(at + attack + decay + 0.1);
  }

  private tone(c: AudioContext, at: number, type: OscillatorType, freq: number, peak: number, attack: number, decay: number, freqTo?: number, wet = false) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, at + attack + decay);
    o.connect(this.env(c, at, peak, attack, decay, wet));
    o.start(at);
    o.stop(at + attack + decay + 0.1);
  }

  // Use the recording if there is one, else the synthesised version.
  private play(name: string, synth: (c: AudioContext, t: number) => void, vol = 0.8) {
    if (!this.ok()) return;
    const fallback = () => {
      const c = this.ctx();
      if (c) synth(c, c.currentTime);
    };
    if (this.missing.has(name)) return fallback();
    const a = new Audio(`/sfx/${name}.mp3`);
    a.volume = vol;
    a.onerror = () => {
      this.missing.add(name);
      fallback();
    };
    a.play().catch(() => {});
  }

  thunder(power = 1) {
    this.play("thunder", (c, t) => {
      this.noiseHit(c, t, "highpass", 2500, 1200, 0.3 * power, 0.01, 0.25);
      this.noiseHit(c, t + 0.05, "lowpass", 700, 90, power, 0.12, 3.2);
    }, 0.8 * power);
  }

  // A heavy latch: a sharp metal click, then the bolt drops.
  click() {
    this.play("lock", (c, t) => {
      this.noiseHit(c, t, "bandpass", 3800, 2600, 0.7, 0.001, 0.035);
      this.tone(c, t, "square", 2100, 0.18, 0.001, 0.03);
      this.noiseHit(c, t + 0.11, "bandpass", 2400, 1500, 0.9, 0.001, 0.06);
      this.tone(c, t + 0.11, "triangle", 620, 0.5, 0.002, 0.09, 380);
      this.tone(c, t + 0.12, "sine", 160, 0.6, 0.003, 0.12, 90);
    });
  }

  chime(n = 3) {
    this.play("chime", (c, t) => {
      for (let i = 0; i < n; i++)
        for (const [f, g] of [[392, 0.4], [784, 0.18], [1176, 0.09], [1568, 0.05]]) this.tone(c, t + i * 1.1, "sine", f, g, 0.005, 2.4);
    });
  }

  // A distant scream from another room: a rising, wavering voice through vowel formants.
  scream() {
    this.play("scream", (c, t) => {
      const dur = 1.7, out = c.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.55 * 0.7, t + 0.12);
      out.gain.setValueAtTime(0.55 * 0.7, t + dur - 0.5);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      out.connect(lp);
      lp.connect(c.destination);
      lp.connect(this.room(c));
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(620, t);
      o.frequency.exponentialRampToValueAtTime(1050, t + 0.25);
      o.frequency.setValueAtTime(1050, t + 0.9);
      o.frequency.exponentialRampToValueAtTime(700, t + dur);
      for (const [f, q] of [[1000, 6], [2600, 8], [3400, 10]]) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = q;
        o.connect(bp).connect(out);
      }
      const vib = c.createOscillator(), vd = c.createGain();
      vib.frequency.value = 6.5;
      vd.gain.value = 22;
      vib.connect(vd).connect(o.frequency);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.1);
      vib.stop(t + dur + 0.1);
      this.noiseHit(c, t, "bandpass", 2400, 1800, 0.12, 0.1, dur, true);
    });
  }

  sting() {
    this.play("sting", (c, t) => {
      for (const f of [110, 116.5, 164.8, 233]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.exponentialRampToValueAtTime(2200, t + 0.6);
        o.connect(lp).connect(this.env(c, t, 0.22, 0.25, 2.6));
        o.start(t);
        o.stop(t + 3);
      }
      this.tone(c, t, "sine", 1760, 0.1, 0.4, 1.8, 1500);
    });
  }

  gavel() {
    this.play("gavel", (c, t) => {
      [0, 0.32, 0.64].forEach((d, i) => {
        this.tone(c, t + d, "sine", 170, i === 2 ? 1 : 0.8, 0.003, 0.3, 60);
        this.tone(c, t + d, "triangle", 620, 0.35, 0.001, 0.05, 300);
        this.noiseHit(c, t + d, "bandpass", 1600, 500, 0.8, 0.001, 0.06);
      });
    });
  }

  // Three barks, a few rooms away.
  bark() {
    this.play("bark", (c, t) => {
      for (const d of [0, 0.3, 0.95]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(560, t + d);
        o.frequency.exponentialRampToValueAtTime(260, t + d + 0.16);
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 900;
        bp.Q.value = 2.5;
        o.connect(bp).connect(this.env(c, t + d, 0.5, 0.012, 0.17, true));
        o.start(t + d);
        o.stop(t + d + 0.25);
        this.noiseHit(c, t + d, "bandpass", 1500, 700, 0.35, 0.008, 0.12, true);
      }
    });
  }

  // A light, calm heartbeat: lub-dub, low and soft.
  heartbeat() {
    this.play("heartbeat", (c, t) => {
      this.tone(c, t, "sine", 58, 0.32, 0.012, 0.16, 42);
      this.tone(c, t + 0.2, "sine", 58, 0.2, 0.012, 0.16, 42);
    }, 0.5);
  }

  tick() {
    this.play("tick", (c, t) => {
      this.tone(c, t, "sine", 1900, 0.12, 0.001, 0.035);
      this.noiseHit(c, t, "bandpass", 4200, 3000, 0.08, 0.001, 0.02);
    }, 0.4);
  }
}

// British male voices on Apple, Chrome and Windows, best first. Prefer the newer
// neural voices, then the usual British male voices.
const VOICE_PREFS = ["Daniel", "Arthur", "Oliver", "Google UK English Male", "Microsoft Ryan", "Microsoft Thomas", "Microsoft George", "Microsoft Alfie"];
const FEMALE = /female|woman|libby|sonia|maisie|hazel|susan|kate|serena|stephanie|martha|fiona|moira/i;
function britishMale(synth: SpeechSynthesis) {
  const gb = synth.getVoices().filter((v) => /^en[-_]GB/i.test(v.lang) && !FEMALE.test(v.name));
  const score = (v: SpeechSynthesisVoice) => {
    const pref = VOICE_PREFS.findIndex((n) => v.name.includes(n));
    return (/natural|neural|online|enhanced|premium/i.test(v.name) ? 100 : 0) + (pref >= 0 ? 20 - pref * 2 : 0) + (/\bmale\b/i.test(v.name) ? 5 : 0);
  };
  return gb.sort((a, b) => score(b) - score(a))[0] ?? null;
}

let instance: Sound | null = null;
export function sound(): Sound {
  instance ??= new Sound();
  return instance;
}
