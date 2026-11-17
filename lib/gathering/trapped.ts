// Everything the screens say and show for Trapped Below (story 1).
// The rules and anything secret (the saboteur, the crew files, the answers) live in the
// database; see the Trapped Below section of supabase/migrations/0001_the_gathering.sql.

export const TB_TITLE = "Trapped Below";

// ---------- the crew file ----------
// Each story has its own questions. Trapped Below asks four: two "panel" questions with fixed
// choices (the repair riddles need answers the game can check), the "trapped" question that
// "Who said it?" uses, and one deeper question from the bank (shuffle for another).
export const WIRE_COLOURS = ["red", "blue", "yellow", "green", "white", "black"] as const;
export type WireColour = (typeof WIRE_COLOURS)[number];
export const WIRE_HEX: Record<WireColour, string> = { red: "#d64532", blue: "#3f78d6", yellow: "#e6c13b", green: "#4ea36a", white: "#eef3f3", black: "#1b2124" };
export const BRING_Q = "Trapped underwater for a week: what one thing do you bring?";
export const DEEP_QUESTIONS = [
  "What's your biggest fear?",
  "What do you miss most when you're far from home?",
  "What did you want to be when you were little?",
  "What did you have for breakfast today?",
  "Lost in the dark: what sound would you want to hear?",
  "What would you name a creature nobody has ever seen?",
  "Where does your mind go when you can't sleep?",
  "Who would you call from the bottom of the ocean?",
  "What's something small that makes you feel safe?",
];

// The six crew portraits (cosmetic, like Marlowe's detective portraits; not game roles).
export const CREW = [
  { key: "captain", name: "Captain" },
  { key: "engineer", name: "Engineer" },
  { key: "sonar", name: "Sonar op" },
  { key: "cook", name: "Cook" },
  { key: "doctor", name: "Doctor" },
  { key: "navigator", name: "Navigator" },
];
export const crewPic = (portrait: number | null | undefined) => `/trapped/crew/${CREW[((portrait ?? 1) - 1 + 6) % 6].key}.webp`;

// ---------- the sub ----------
// Rooms with their own background (public/trapped/bg) and sound.
export type Place = "exterior" | "corridor" | "control" | "engine" | "sonar" | "escape" | "pipewall" | "cargo" | "quarters" | "galley" | "torpedo" | "flooded" | "wreck" | "dawn";
export const PLACE_NAME: Record<string, string> = {
  engine: "Engine room", oxygen: "Oxygen bay", control: "Control room", sonar: "Sonar room", galley: "Galley", quarters: "Crew quarters",
  ballast: "Ballast tanks",
};
// Where each repair happens, as a background.
export const PLACE_BG: Record<string, Place> = {
  engine: "engine", oxygen: "torpedo", control: "control", sonar: "sonar", galley: "galley", quarters: "quarters",
};
export const bg = (p: Place) => `/trapped/bg/${p}.webp`;

// The blueprint: each compartment's rectangle on the drawing (x, y, width, height, in the drawing's pixels).
export const COMPARTMENTS: [string, string, number, number, number, number][] = [
  ["engine", "Engine", 392, 334, 268, 94], ["oxygen", "Oxygen", 666, 334, 272, 94], ["control", "Control", 946, 334, 216, 94],
  ["quarters", "Quarters", 1170, 334, 275, 94], ["galley", "Galley", 1453, 334, 263, 94], ["sonar", "Sonar", 1724, 340, 114, 86],
  ["ballast", "Ballast", 420, 452, 238, 108], ["cargo", "Cargo", 666, 452, 272, 122], ["airlock", "Airlock", 946, 452, 216, 122],
  ["torpedo", "Torpedo", 1170, 452, 275, 122], ["stores", "Stores", 1453, 452, 259, 112],
];
export const BOLT_PLACES = ["engine", "oxygen", "sonar", "ballast", "control"];

// ---------- the emergencies ----------
export const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", I: "..", K: "-.-", L: ".-..", O: "---", P: ".--.", R: ".-.", S: "...", U: "..-", Y: "-.--",
};
// Pipes: tiles 0 to 8, straight (I) or corner (L), the turn that carries the water, and which tiles carry it.
export const PIPE_TYPE = ["I", "L", "I", "L", "L", "L", "I", "L", "L"] as const;
export const PIPE_TARGET = [0, 2, 1, 1, 0, 2, 0, 3, 0];
export const PIPE_PATH = [0, 1, 4, 5, 8];
export const LEAK_JOB: Record<string, { title: string; how: string; fallback: string }> = {
  pump: { title: "Shake your phone to pump.", how: "Shake it like you mean it.", fallback: "Tap fast to pump." },
  blow: { title: "Blow into your phone to clear the intake.", how: "Blow steadily at the bottom of your phone.", fallback: "Press and hold to clear the intake." },
  level: { title: "Hold your phone flat to keep the pump level.", how: "Lay it flat in your hand and keep it still.", fallback: "Keep the bubble in the middle." },
  hatch: { title: "Hold the hatch shut.", how: "Keep your thumb on the hatch.", fallback: "Keep your thumb on the hatch." },
};

// ---------- the captain ----------
// Every line the captain says, word for word. Recordings are at /narration/<id>.mp3 (ElevenLabs);
// the TV plays them through a radio filter. If one is missing, the browser's own voice reads it.
export const TB_NARRATION: Record<string, string> = {
  "tb-title": "Trapped Below. A submarine, four hundred metres down. Not everyone aboard wants to come back up.",
  "tb-brief-open": "This is your captain. Welcome aboard. We're heading for the bottom of the trench, and I'll be honest with you: not everyone on this boat wants to come back up.",
  "tb-brief-sub": "This is our sub. Down there, things break. The TV will show you what.",
  "tb-brief-air": "We have eight minutes of air. Every repair buys more. Every mistake costs a little.",
  "tb-brief-pair": "Repairs take two of you, and only your partner knows how. So talk.",
  "tb-brief-sab": "And one more thing. Somebody aboard has different orders. Watch each other.",
  "tb-brief-hatch": "Before we dive, seal the hatch. Four bolts, one each. Hold them all at the same time.",
  "tb-skip": "Right. Straight to it, then. Seal the hatch: all four bolts, at the same time.",
  "tb-hatch-countin": "On three, crew. One. Two. Three.",
  "tb-hatch-sealed": "Hatch sealed. Good work, crew.",
  "tb-dim": "Dim the lights. We're diving.",
  "tb-dive": "Flooding the tanks. Next stop, four hundred metres.",
  "tb-depth": "Four hundred and twelve metres. Before the first watch, the sub needs to know who's aboard.",
  "tb-crewfile": "This is your captain. The sub needs to know who's aboard. Answer honestly. Your crew will need it.",
  "tb-orders": "Somebody aboard is cutting the lines. Your orders are sealed on your phone. Read them, and keep them to yourself.",
  "tb-watch-1": "Watch one. The engine and the oxygen scrubber are down. Get to your stations.",
  "tb-watch-2": "Watch two. More trouble below decks. Check your phones.",
  "tb-watch-3": "Watch three. She's getting tired, and so are we. Stay sharp.",
  "tb-watch-4": "Last watch. Hold her together a little longer.",
  "tb-engine": "Engine room, report. Talk to each other.",
  "tb-oxygen": "Oxygen bay. Say your guess out loud.",
  "tb-sonar": "All hands. Sonar contact. Somebody tell me what's out there.",
  "tb-ballast": "All hands. We're taking on water. Route it to the ballast tank.",
  "tb-breach": "Hull breach! Pump, clear the intake, keep her level, and hold that hatch!",
  "tb-meeting": "Crew meeting. Read the logs. Then decide who goes in the airlock.",
  "tb-logs": "We recovered something from the logs. Read it carefully.",
  "tb-no-logs": "No logs this time. You'll have to trust your instincts.",
  "tb-vote": "Time to vote. Who goes in the airlock?",
  "tb-airlock-right": "Airlock sealed. The lines have stopped going quiet. That was our saboteur.",
  "tb-airlock-wrong": "Airlock sealed. And the engine just coughed again. We got the wrong one.",
  "tb-airlock-none": "No one goes in. The saboteur is still among us.",
  "tb-end-crew": "This is your captain. We're surfacing. Well done, crew.",
  "tb-end-saboteur": "This is your captain. It has been an honour.",
  "tb-airout": "That's the last of the air. I'm sorry, crew.",
  "tb-quiet": "Quiet watch. Too quiet. Keep your eyes open.",
  "tb-fixed": "That's holding. Good work.",
  "tb-failed": "That's not right. Try again, and quickly.",
  "tb-air-low": "Air is getting thin. Breathe slow, work fast.",
  "tb-air-30": "Thirty seconds of air. Whatever you're doing, do it now.",
};

// The briefing: the board fills in as the captain talks. Each beat starts this many seconds in
// (the recordings' lengths plus a short pause), matching tb_brief_secs() in the database.
export const BRIEF_BEATS = [
  { id: "tb-brief-open", at: 0, title: "Welcome aboard", tick: "" },
  { id: "tb-brief-sub", at: 9.2, title: "Things break", tick: "Things break. The TV shows what." },
  { id: "tb-brief-air", at: 15.0, title: "Air runs out", tick: "Repairs buy air. Mistakes cost air." },
  { id: "tb-brief-pair", at: 21.2, title: "Fix it in pairs", tick: "Repairs take two. Talk to your partner." },
  { id: "tb-brief-sab", at: 26.4, title: "Someone's lying", tick: "Somebody aboard has different orders." },
  { id: "tb-brief-hatch", at: 31.6, title: "Seal the hatch", tick: "" },
];
export const beatAt = (secs: number) => BRIEF_BEATS.reduce((b, x, i) => (secs >= x.at ? i : b), 0);

export const fmtAir = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;
