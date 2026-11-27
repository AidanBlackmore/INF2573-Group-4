"use client";

// Sound for the TV: background music, the narrator and sound effects.
// In Trapped Below the narrator is the captain, heard through a radio filter (setRadio).
// Phones stay silent. Sound is on from the start: everything plays as soon as the
// browser allows it, which is straight away where the site may autoplay (see the
// README) and otherwise on the first click or key press on the TV page.

import { NARRATION } from "./content";
import { TB_NARRATION } from "./trapped";

const LINES: Record<string, string> = { ...NARRATION, ...TB_NARRATION };

// volume is the master volume (0 to 100) for everything the TV plays: music, the narrator and the
// sound effects. muted silences all of it at once (and stops the narrator mid-line).
export type SoundSettings = { music: boolean; narrator: boolean; effects: boolean; muted: boolean; volume: number };
const KEY = "gathering:sound:v2";
const OLD_KEY = "gathering:sound";
const DEFAULTS: SoundSettings = { music: true, narrator: true, effects: true, muted: false, volume: 80 };
// The music sits under everything else: this share of the master volume.
const MUSIC_LEVEL = 0.25;

type Listener = (s: SoundSettings) => void;

// A twentieth of a second of silence, for unlocking the narrator's audio element.
const SILENT = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

// One story's music. Two copies of the track take turns: a few seconds before one
// ends, the other starts and they crossfade, so the loop never stops. Each starts
// past the track's quiet intro. A loop that isn't wanted fades out, then pauses
// where it was, so coming back to a story picks the music up again.
class Loop {
  private els: HTMLAudioElement[];
  private cur = 0;
  private xfAt = 0;
  level = 0;
  target = 0;

  constructor(src: string, private head: number, private xfade: number) {
    this.els = [0, 1].map(() => Object.assign(new Audio(src), { preload: "none" }));
    this.els.forEach((a, i) => a.addEventListener("ended", () => { if (i === this.cur && this.target > 0) this.loopNow(); }));
  }

  play() {
    const a = this.els[this.cur];
    if (a.currentTime < this.head) a.currentTime = this.head;
    return a.play();
  }

  pause() {
    this.els.forEach((a) => a.pause());
  }

  // Inside a click: start and stop each copy silently, so browsers that only let
  // media play once a click has started it (Safari) allow it later.
  prime() {
    for (const a of this.els) {
      if (!a.paused) continue;
      a.muted = true;
      a.play().then(
        () => {
          a.pause();
          a.muted = false;
        },
        () => (a.muted = false),
      );
    }
  }

  private loopNow() {
    const next = this.els[1 - this.cur];
    next.currentTime = this.head;
    next.volume = 0;
    next.play().catch(() => {});
    this.cur = 1 - this.cur;
    this.xfAt = performance.now();
  }

  step(allowed: boolean) {
    this.level += (this.target - this.level) * 0.12;
    const a = this.els[this.cur], b = this.els[1 - this.cur];
    if (this.target === 0 && this.level < 0.002) {
      if (!a.paused || !b.paused) this.pause();
      return;
    }
    if (allowed && this.target > 0 && a.paused && b.paused) this.play().catch(() => {});
    if (!a.paused && a.duration && a.currentTime > a.duration - this.xfade && b.paused) {
      b.preload = "auto";
      this.loopNow();
      return;
    }
    const f = Math.min(1, (performance.now() - this.xfAt) / (this.xfade * 1000)); // equal-power crossfade
    a.volume = Math.min(1, Math.max(0, this.level * Math.sin((f * Math.PI) / 2)));
    if (!b.paused) {
      if (f >= 1) b.pause();
      else b.volume = Math.min(1, Math.max(0, this.level * Math.cos((f * Math.PI) / 2)));
    }
  }
}

// Each story's music: the manor's ambience and Trapped Below's deep-water ambience.
export type Track = "marlowe" | "deep";

class Sound {
  settings: SoundSettings = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private phase = "join";
  private speaking = false;

  // ---------- music ----------
  private loops: Record<Track, Loop>;
  private track: Track | null = null;
  // True once the browser allows sound (usually after the first click on the page).
  private unlocked = false;
  // Lightning only where it's storming (Marlowe Manor).
  private stormy = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      // Settings from before the master volume: keep the switches, not the old music-only volume.
      const old = saved ? null : JSON.parse(localStorage.getItem(OLD_KEY) ?? "null");
      if (saved) this.settings = { ...DEFAULTS, ...saved };
      else if (old) this.settings = { ...DEFAULTS, music: old.music ?? true, narrator: old.narrator ?? true, effects: old.effects ?? true, muted: Boolean(old.muted) };
    } catch {
      // Private mode or blocked storage: use the defaults.
    }
    this.loops = { marlowe: new Loop("/audio/ambience.mp3", 2.6, 4), deep: new Loop("/audio/deep.mp3", 0.05, 3) };
    setInterval(() => this.ramp(), 60);
    this.voice = Object.assign(new Audio(), { preload: "auto" });
    addEventListener("pointerdown", () => this.unlock(true), { capture: true });
    addEventListener("keydown", () => this.unlock(true), { capture: true });
    // Where the browser allows autoplay, start straight away.
    setTimeout(() => this.unlock(false), 0);
    // Lightning every 15 to 30 seconds while it's storming.
    const storm = () => setTimeout(() => {
      if (this.stormy) {
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
    if (patch.narrator === false || patch.muted === true) this.stopVoice();
    // Turning the sound or the narrator back on reads the screen's lines again.
    if ((patch.muted === false || patch.narrator === true) && this.audible() && this.settings.narrator && this.lastIds.length) {
      this.said = "";
      this.narrate(`again:${performance.now()}`, this.lastIds);
    }
    this.applyLevels();
    this.listeners.forEach((fn) => fn(this.settings));
  }

  // The TV tells us which screen is showing (for the music level and the narrator),
  // which story's music to play, and whether it's storming.
  setScene(phase: string, track: Track | null, stormy: boolean) {
    this.phase = phase;
    this.track = track;
    this.stormy = stormy;
  }

  // Set by the TV so lightning can flash the screen.
  flash: (() => void) | null = null;

  // Browsers only allow sound once someone has clicked the page. On every click
  // (and once at load, in case this browser allows it anyway) wake the audio
  // engine and start each audio element once, then report whether sound is on.
  private unlock(click: boolean) {
    const ctx = this.ctx();
    if (this.unlocked) return;
    if (click) Object.values(this.loops).forEach((loop) => loop.prime());
    const v = this.voice;
    if (v.paused) {
      v.onplay = v.onended = v.onerror = null;
      v.src = SILENT;
      v.play().then(() => this.allowed(), () => {});
    }
    ctx?.resume().then(() => ctx.state === "running" && this.allowed(), () => {});
  }

  private allowed() {
    if (this.unlocked) return;
    this.unlocked = true;
    // A screen the browser blocked before the click: read it now.
    const waiting = this.blocked;
    this.blocked = null;
    if (waiting) {
      this.said = "";
      this.narrate(...waiting);
    }
  }

  // The master level, 0 to 1 (0 when muted).
  level() {
    return this.settings.muted ? 0 : Math.max(0, Math.min(100, this.settings.volume)) / 100;
  }
  private audible() {
    return !this.settings.muted && this.settings.volume > 0;
  }
  // The narrator's voice and the synthesised effects follow the master volume straight away.
  private applyLevels() {
    const l = this.level();
    this.voice.volume = l;
    // Set straight away: a ramp wouldn't move while the browser has the audio engine suspended.
    if (this.out && this.audio) {
      this.out.gain.cancelScheduledValues(this.audio.currentTime);
      this.out.gain.value = l;
    }
    if (this.hiss && this.settings.muted) this.radioOff();
    for (const f of this.fx) {
      f.a.volume = f.vol * l;
      if (l === 0) {
        f.a.pause();
        this.fx.delete(f);
      }
    }
  }

  // The music dips under the narrator, sits lower while pairs work on locks,
  // and almost disappears while the votes are counted.
  private ramp() {
    // The deep-water ambience stays under the captain, just a little quieter.
    const duck = (this.speaking ? (this.track === "deep" ? 0.7 : 0.4) : 1) * ((({ tasks: 0.65, tally: 0.12 }) as Record<string, number>)[this.phase] ?? 1);
    const base = !this.settings.music ? 0 : this.level() * MUSIC_LEVEL * duck;
    for (const [key, loop] of Object.entries(this.loops) as [Track, Loop][]) {
      loop.target = key === this.track ? base : 0;
      loop.step(this.unlocked);
    }
  }

  // ---------- narrator ----------
  private said = "";
  private run = 0;
  // One element for every line: browsers that trust an element once a click has
  // started it (Safari) then let it play each line.
  private voice: HTMLAudioElement;
  private blocked: [string, string[]] | null = null;
  // The current screen's lines, to read again when the sound comes back on.
  private lastIds: string[] = [];
  // What the narrator is saying right now, for the captions: a recording (its playback position),
  // or the browser's voice (its word events, or an estimate from the time when there are none).
  private live: { id: string; len: number; el?: HTMLAudioElement; base?: number; end?: number; at?: number; char?: number | null } | null = null;

  // How far through line `id` the narrator is, from 0 to 1, or null when it isn't saying it.
  progress(id: string): number | null {
    const l = this.live;
    if (!l || l.id !== id || !l.len) return null;
    if (l.el) {
      const d = l.el.duration;
      return d && Number.isFinite(d) ? Math.min(1, l.el.currentTime / d) : 0;
    }
    const est = Math.min(l.end ?? l.len, (l.base ?? 0) + ((performance.now() - (l.at ?? 0)) / 1000) * 14);
    return Math.min(1, (l.char ?? est) / l.len);
  }

  // Reads a screen's lines once: the recording if there is one, otherwise the browser's voice.
  narrate(key: string, ids: string[]) {
    if (key === this.said) return;
    this.said = key;
    this.blocked = null;
    if (!key.startsWith("cue:")) this.lastIds = ids;
    // stopVoice() starts a new run, so take the run number after it.
    this.stopVoice();
    const run = this.run;
    if (!this.settings.narrator || !this.audible() || !ids.length) return;
    this.voice.volume = this.level();
    const next = (i: number) => {
      if (run !== this.run) return;
      if (i >= ids.length) {
        this.speaking = false;
        return;
      }
      const done = () => {
        this.radioOff();
        this.live = null;
        setTimeout(() => next(i + 1), 400);
      };
      const v = this.voice;
      v.onplay = () => {
        this.speaking = true;
        this.live = { id: ids[i], len: (LINES[ids[i]] ?? "").length, el: v };
        this.radioOn();
      };
      v.onended = done;
      v.onerror = () => {
        if (run === this.run) this.speak(ids[i], LINES[ids[i]] ?? "", run, done);
      };
      v.src = `/narration/${ids[i]}.mp3`;
      v.play().catch((e: Error) => {
        // The browser wants a click first: keep the screen's lines for then.
        if (e.name !== "NotAllowedError" || run !== this.run) return;
        this.blocked = [this.said, ids];
        this.unlocked = false;
      });
    };
    next(0);
  }

  // One line on its own, for things that happen rather than screens (a repair fixed, the air running low).
  cue(id: string) {
    this.narrate(`cue:${id}:${performance.now()}`, [id]);
  }

  // ---------- the captain's radio ----------
  // The narrator's audio goes through Web Audio once a story wants the radio: the lows and highs cut,
  // the middle pushed, a little distortion, with static underneath and a click at each end.
  private radio = false;
  private radioWet: GainNode | null = null;
  private radioDry: GainNode | null = null;
  private hiss: { src: AudioBufferSourceNode; gain: GainNode; iv: ReturnType<typeof setInterval> } | null = null;
  setRadio(on: boolean) {
    if (on === this.radio) return;
    this.radio = on;
    if (on) this.radioChain();
    const c = this.audio;
    if (c && this.radioWet && this.radioDry) {
      this.radioWet.gain.setValueAtTime(on ? 1 : 0, c.currentTime);
      this.radioDry.gain.setValueAtTime(on ? 0 : 1, c.currentTime);
    }
  }
  private radioChain() {
    const c = this.ctx();
    if (!c || this.radioWet) return;
    try {
      const src = c.createMediaElementSource(this.voice);
      const hp = Object.assign(c.createBiquadFilter(), { type: "highpass" as BiquadFilterType });
      hp.frequency.value = 380;
      const lp = Object.assign(c.createBiquadFilter(), { type: "lowpass" as BiquadFilterType });
      lp.frequency.value = 3300;
      const mid = Object.assign(c.createBiquadFilter(), { type: "peaking" as BiquadFilterType });
      mid.frequency.value = 1700;
      mid.gain.value = 6;
      const drive = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = (7 * x) / (1 + 6 * Math.abs(x));
      }
      drive.curve = curve;
      this.radioWet = c.createGain();
      this.radioDry = c.createGain();
      this.radioWet.gain.value = this.radio ? 0.9 : 0;
      this.radioDry.gain.value = this.radio ? 0 : 1;
      src.connect(hp).connect(lp).connect(mid).connect(drive).connect(this.radioWet).connect(c.destination);
      src.connect(this.radioDry).connect(c.destination);
    } catch {
      // No Web Audio routing here: the captain just sounds clean.
    }
  }
  private squelch() {
    const c = this.ctx();
    if (!c || !this.ok()) return;
    this.noiseHit(c, c.currentTime, "highpass", 2400, 2000, 0.22, 0.002, 0.06);
  }
  private radioOn() {
    if (!this.radio) return;
    const c = this.ctx();
    if (!c) return;
    this.squelch();
    if (this.hiss || !this.audible()) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf(c);
    src.loop = true;
    const f = Object.assign(c.createBiquadFilter(), { type: "bandpass" as BiquadFilterType });
    f.frequency.value = 1800;
    f.Q.value = 1.2;
    const gain = c.createGain();
    gain.gain.value = 0.025;
    src.connect(f).connect(gain).connect(this.out ?? c.destination);
    src.start();
    const iv = setInterval(() => gain.gain.setTargetAtTime(0.012 + Math.random() * 0.035, c.currentTime, 0.02), 60);
    this.hiss = { src, gain, iv };
  }
  private radioOff() {
    if (!this.hiss) return;
    clearInterval(this.hiss.iv);
    try {
      this.hiss.src.stop();
    } catch {
      // Already stopped.
    }
    this.hiss = null;
    this.squelch();
  }

  private stopVoice() {
    this.radioOff();
    this.run++;
    const v = this.voice;
    v.onplay = v.onerror = v.onended = null;
    v.pause();
    window.speechSynthesis?.cancel();
    this.speaking = false;
    this.live = null;
  }

  // Fallback: the browser's voice, a sentence at a time.
  private speak(id: string, text: string, run: number, done: () => void) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return done();
    const voice = britishMale(synth);
    const lines = (text.match(/[^.!?]+[.!?]+["”’]?/g) ?? [text]).map((l) => l.trim());
    // Where each sentence starts in the whole line, so the captions can follow along.
    let from = 0;
    const starts = lines.map((l) => {
      const at = Math.max(0, text.indexOf(l, from));
      from = at + l.length;
      return at;
    });
    const say = (i: number) => {
      if (run !== this.run) return;
      if (i >= lines.length) return done();
      const u = Object.assign(new SpeechSynthesisUtterance(lines[i]), { lang: "en-GB", rate: 0.95, pitch: 1, volume: this.level() });
      if (voice) u.voice = voice;
      u.onstart = () => {
        this.speaking = true;
        this.live = { id, len: text.length, base: starts[i], end: starts[i] + lines[i].length, at: performance.now(), char: null };
      };
      u.onboundary = (e) => {
        if (this.live?.id === id && e.name === "word") this.live.char = starts[i] + e.charIndex;
      };
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

  // Every synthesised sound goes through this, at the master volume.
  private out: GainNode | null = null;
  // Recorded effects still playing.
  private fx = new Set<{ a: HTMLAudioElement; vol: number }>();

  private ctx() {
    if (!this.audio) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.audio = new C();
      this.out = this.audio.createGain();
      this.out.gain.value = this.level();
      this.out.connect(this.audio.destination);
    }
    if (this.audio.state === "suspended") void this.audio.resume();
    return this.audio;
  }

  private ok() {
    return this.settings.effects && this.audible();
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
      this.verb.connect(g).connect(this.out ?? c.destination);
    }
    return this.verb;
  }

  private env(c: AudioContext, at: number, peak: number, attack: number, decay: number, wet = false) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak * 0.7, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.out ?? c.destination);
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
    a.volume = vol * this.level();
    // Kept while it plays, so mute and the slider reach a thunderclap already rolling.
    const fx = { a, vol };
    this.fx.add(fx);
    a.onended = () => this.fx.delete(fx);
    a.onerror = () => {
      this.fx.delete(fx);
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
      lp.connect(this.out ?? c.destination);
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

  // A soft rush of air as one story slides away and the next comes in.
  whoosh(dir = 1) {
    this.play("whoosh", (c, t) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf(c);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(dir > 0 ? 300 : 2200, t);
      f.frequency.exponentialRampToValueAtTime(dir > 0 ? 2200 : 300, t + 0.5);
      const pan = c.createStereoPanner();
      pan.pan.setValueAtTime(dir > 0 ? 0.7 : -0.7, t);
      pan.pan.linearRampToValueAtTime(dir > 0 ? -0.7 : 0.7, t + 0.5);
      src.connect(f).connect(pan).connect(this.env(c, t, 0.35, 0.18, 0.45));
      src.start(t);
      src.stop(t + 0.8);
    }, 0.5);
  }

  tick() {
    this.play("tick", (c, t) => {
      this.tone(c, t, "sine", 1900, 0.12, 0.001, 0.035);
      this.noiseHit(c, t, "bandpass", 4200, 3000, 0.08, 0.001, 0.02);
    }, 0.4);
  }

  // Marlowe Manor's guest book (app/host/guestbook.tsx): a page turning, the book shutting, the seal.
  pageTurn() {
    this.play("page", (c, t) => this.noiseHit(c, t, "highpass", 2600, 1800, 0.1 + Math.random() * 0.05, 0.05, 0.22), 0.5);
  }

  bookShut() {
    this.play("book-shut", (c, t) => {
      this.tone(c, t, "sine", 130, 0.5, 0.004, 0.4, 70);
      this.noiseHit(c, t, "lowpass", 900, 300, 0.35, 0.004, 0.3, true);
    });
  }

  seal() {
    this.play("seal", (c, t) => {
      this.tone(c, t, "sine", 230, 0.4, 0.003, 0.25, 130);
      this.noiseHit(c, t, "lowpass", 1200, 400, 0.2, 0.003, 0.18);
    }, 0.7);
  }

  // A nib on paper while a signature is written: louder as the pen moves faster. Call set(0..1) as it
  // moves and stop() at the end of the stroke.
  scratch(): { set: (v: number) => void; stop: () => void } {
    const c = this.ok() ? this.ctx() : null;
    if (!c) return { set: () => {}, stop: () => {} };
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 3800;
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.out ?? c.destination);
    src.start();
    return {
      set: (v) => {
        g.gain.setTargetAtTime(v * 0.06, c.currentTime, 0.02);
        f.frequency.setTargetAtTime(3000 + v * 2200, c.currentTime, 0.03);
      },
      stop: () => {
        g.gain.setTargetAtTime(0, c.currentTime, 0.04);
        setTimeout(() => src.stop(), 300);
      },
    };
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
