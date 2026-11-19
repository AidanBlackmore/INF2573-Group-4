// Marlowe Manor's onboarding: a short intro on the TV ("what's going on"), then a practice
// round on each phone for players who haven't played before.
//
// None of this touches the database. The intro is timed from the moment the story was entered
// (rooms.phase_at), so the TV and every phone agree on when it ends without talking to each
// other. The practice round runs on the phone only, before the player picks a detective and
// answers their questions, so "Start the night" (which waits for everyone's answers) also
// waits for anyone still practising.

// The TV holds its title card for this long after entering the story (see `entering` in tv.tsx).
export const INTRO_DELAY_MS = 1800;

export type IntroBeat = { id: string; eyebrow: string; title: string; text: string; art: string; secs: number };

// Four beats, 45 seconds in all. The narrator reads each `text` (NARRATION in content.ts).
export const INTRO: IntroBeat[] = [
  {
    id: "intro-1",
    eyebrow: "1891 · Marlowe Manor",
    title: "A storm. A birthday dinner.",
    text: "Lord Fenwick has invited you all to his birthday dinner. The road has flooded, so nobody leaves before dawn.",
    art: "bg-title-hallway",
    secs: 10,
  },
  {
    id: "intro-2",
    eyebrow: "Then the lights go out",
    title: "One of you is a murderer.",
    text: "When the lights come back on, Lord Fenwick is face-down in the trifle. One of you killed him, and only they know it.",
    art: "bg-blackout-ink",
    secs: 11,
  },
  {
    id: "intro-3",
    eyebrow: "Your secrets are the clues",
    title: "Three questions about you.",
    text: "First you answer three questions on your phone. Your answers are hidden around the house as notes. The murderer's notes give them away.",
    art: "bg-evidence-wall",
    secs: 12,
  },
  {
    id: "intro-4",
    eyebrow: "Catch them before dawn",
    title: "Open locks. Read notes. Vote.",
    text: "Each hour, pairs open locks to find the notes. Then everyone talks it over and votes. Catch the murderer before only one detective is left.",
    art: "bg-vote-dining",
    secs: 12,
  },
];

export const INTRO_MS = INTRO.reduce((t, b) => t + b.secs * 1000, 0);

// Where the intro is, `ms` after entering the story: the beat showing and how far through it.
export function introAt(ms: number): { beat: number; frac: number; done: boolean } {
  let t = ms - INTRO_DELAY_MS;
  if (t < 0) return { beat: 0, frac: 0, done: false };
  for (let i = 0; i < INTRO.length; i++) {
    const len = INTRO[i].secs * 1000;
    if (t < len) return { beat: i, frac: t / len, done: false };
    t -= len;
  }
  return { beat: INTRO.length - 1, frac: 1, done: true };
}

// Remembered per room and per device for the rest of the visit, so coming back to the manor
// ("Choose another story", a refresh) doesn't replay the intro or ask again.
const key = (what: "intro" | "practice", roomId: string) => `gathering:manor-${what}:${roomId}`;

export type PracticeChoice = "played" | "done" | "skipped";

export function seen(what: "intro" | "practice", roomId: string): string | null {
  try {
    return sessionStorage.getItem(key(what, roomId));
  } catch {
    return null;
  }
}

export function remember(what: "intro" | "practice", roomId: string, value: string) {
  try {
    sessionStorage.setItem(key(what, roomId), value);
  } catch {
    // Private mode: the intro may show again after a refresh. Fine.
  }
}
