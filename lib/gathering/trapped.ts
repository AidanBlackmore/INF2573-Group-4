// Everything the screens say and show for Trapped Below (story 1).
// The rules and anything secret (the saboteur, the crew files, the answers) live in the
// database; see the Trapped Below section of supabase/migrations/0001_the_gathering.sql.
//
// The story: the research sub Meridian creeps along the trench floor, 412 m down. One of the crew
// is a saboteur who wants her to sink. Every repair buys air and every breakdown or mistake costs
// some, so the air clock is the time the crew has to work out who is doing it. Each fix also turns
// up a clue about the saboteur (from their crew file), and after each watch the crew meets and
// votes someone into the airlock.

export const TB_TITLE = "Trapped Below";
export const SUB = "Meridian";

// ---------- the crew file ----------
// Four light get-to-know questions, each used later (the phone says where). Nothing personal or
// painful: tastes and choices friends can guess about each other. The first two have fixed choices
// so the game can check them: the colour is the wire to cut, the spice level is the code. Oxygen
// bay asks about the "bring" answer in watches 1 and 2 and the last answer in watches 3 and 4.
// All four can turn up as clues about the saboteur.
// Roles are dealt after the file, so nobody (not even the saboteur) can tailor their answers.
export const WIRE_COLOURS = ["red", "blue", "yellow", "green", "white", "black"] as const;
export type WireColour = (typeof WIRE_COLOURS)[number];
export const WIRE_HEX: Record<WireColour, string> = { red: "#d64532", blue: "#3f78d6", yellow: "#e6c13b", green: "#4ea36a", white: "#eef3f3", black: "#1b2124" };
export const BRING_Q = "Stuck on a submarine for a week: what one thing would you bring?";
// The last question: pick one (shuffle for another). Short, light, and guessable by friends.
export const DEEP_QUESTIONS = [
  "What's your go-to comfort food?",
  "Where would you go on your dream holiday?",
  "What's a hobby you'd love to try?",
  "What's your perfect way to spend a free Saturday?",
  "What song would you pick for karaoke?",
  "What's your favourite film or TV show right now?",
  "If you could have any animal as a pet, what would it be?",
  "What's your favourite snack?",
  "What superpower would you pick?",
  "What's your favourite season?",
];

export const CREW_FILE = [
  { q: "What's your favourite colour?", note: "Pick the closest wire colour. In a repair, a crewmate may have to cut the wire in your colour." },
  { q: "How spicy do you like your food?", note: "1 = no spice at all, 9 = bring the fire. In a repair, a crewmate may have to type your number." },
  { q: BRING_Q, note: "In a repair, a crewmate may have to pick your answer out of several." },
  { q: "", note: "Pick a question you like (shuffle for another). Later repairs ask about it." },
];

// Everyone plays as the portrait drawn when they joined. The old crew portraits are only a
// fallback for a player without one.
const CREW = ["captain", "engineer", "sonar", "cook", "doctor", "navigator"];
export const crewPic = (portrait: number | null | undefined) => `/trapped/crew/${CREW[((portrait ?? 1) - 1 + 6) % 6]}.webp`;
export const facePic = (p: { portrait_url: string | null; portrait: number | null } | undefined) => p?.portrait_url ?? crewPic(p?.portrait);

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
  "tb-brief-open": "This is your captain. Welcome aboard. We're heading for the bottom of the trench, and I'll be honest with you: not everyone on this boat wants to come back up.",
  "tb-brief-air": "We have eight minutes of air. Every repair buys more. Every mistake costs a little.",
  "tb-brief-pairs": "Things will break. Each watch, the TV splits you into pairs. Find your name on the board, then look at your phone. Each of you has half of the job, so talk it through.",
  "tb-brief-hands": "Sometimes something big breaks. Then it's all hands: everyone works on their own phone at once, and the TV shows how it's going.",
  "tb-brief-sab2": "One of you is a saboteur. They want the Meridian to sink. They'll lie, botch repairs, and loosen bolts so things break. Everyone gets secret orders on their phone after the crew file.",
  "tb-brief-vote": "Every fix also turns up a clue about the saboteur. After each watch we meet. Read the clues, talk, then everyone votes on their phone. Most votes goes in the airlock. Get it wrong, and it costs us a minute of air.",
  "tb-brief-win": "Catch the saboteur within four watches, and we surface safely. Run out of air, or surface with them still aboard, and the saboteur wins.",
  "tb-brief-hatch2": "Last thing before we dive. Seal the hatch. Look at your phone, and everyone hold your bolt at the same time. If one slips, just try again.",
  "tb-skip2": "Right. Straight to it, then. Seal the hatch: everyone hold your bolt, at the same time.",
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
  "tb-riddle": "All hands. Identity check. Security has cleared one of you, but the name got scrambled. All it kept is their crew file. Whose is it? Get it right, and that one is in the clear.",
  "tb-ballast": "All hands. We're taking on water. Route it to the ballast tank.",
  "tb-breach": "Hull breach! Pump, clear the intake, keep her level, and hold that hatch!",
  "tb-logs-first": "Crew meeting. Every system we fixed turned up a clue about the saboteur. Check the board. Does it sound like anyone? Then vote.",
  "tb-logs": "We recovered something from the logs. Read it carefully.",
  "tb-no-logs": "No logs this time. You'll have to trust your instincts.",
  "tb-vote": "Time to vote. Who goes in the airlock?",
  "tb-airlock-right": "Airlock sealed. The lines have stopped going quiet. That was our saboteur.",
  "tb-airlock-wrong": "Airlock sealed. And the engine just coughed again. We got the wrong one.",
  "tb-airlock-none": "No one goes in. The saboteur is still among us.",
  "tb-end-crew": "This is your captain. We're surfacing. Well done, crew.",
  "tb-end-saboteur": "This is your captain. It has been an honour.",
  "tb-airout": "That's the last of the air. I'm sorry, crew.",
  "tb-fixed": "That's holding. Good work.",
  "tb-failed": "That's not right. Try again, and quickly.",
  "tb-air-low": "Air is getting thin. Breathe slow, work fast.",
  "tb-air-30": "Thirty seconds of air. Whatever you're doing, do it now.",
};

// The briefing, one thing at a time: the TV shows one big card per line, with a checklist of what's
// been covered. Each beat starts this many seconds in: the previous recording's length plus a short pause. BRIEF_SECS matches tb_brief_secs() in the database.
export const BRIEF_BEATS = [
  { id: "tb-brief-open", at: 0, title: "Welcome aboard the Meridian", tick: "A research sub, 412 m down. Not everyone aboard wants to come back up." },
  { id: "tb-brief-air", at: 9.2, title: "Air is your time limit", tick: "Every fix adds air. Every breakdown or mistake takes some away." },
  { id: "tb-brief-pairs", at: 15.4, title: "Repairs: in pairs", tick: "1. Find your name on the TV. 2. Look at your phone. 3. Talk to your partner: you each have half the job." },
  { id: "tb-brief-hands", at: 27.4, title: "All hands: everyone", tick: "Big breakdowns: everyone works on their own phone at once. The TV shows how it's going." },
  { id: "tb-brief-sab2", at: 36.7, title: "One of you is the saboteur", tick: "They want the sub to sink: they lie, botch repairs and loosen bolts. Orders come to your phone, in secret." },
  { id: "tb-brief-vote", at: 49.8, title: "Meet, then vote", tick: "Fixes turn up clues. After each watch: read them on the TV, talk, vote on your phone. Wrong vote: −1:00 of air." },
  { id: "tb-brief-win", at: 65.1, title: "How it ends", tick: "Crew: vote out the saboteur within 4 watches. Saboteur: run the air out, or stay hidden all 4." },
];
export const BRIEF_SECS = 76;
export const beatAt = (secs: number) => BRIEF_BEATS.reduce((b, x, i) => (secs >= x.at ? i : b), 0);

export const fmtAir = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

// The hatch drill pairs the crew up the way the watches will (a trio if odd), so the first repair
// isn't the first time anyone is told to find a partner. Join order; the watches shuffle for real.
export function drillPairs(players: { id: string }[]): string[][] {
  const ids = players.map((p) => p.id);
  const groups: string[][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) groups.push(ids.slice(i, i + 2));
  if (ids.length % 2 === 1) {
    if (groups.length) groups[groups.length - 1].push(ids[ids.length - 1]);
    else groups.push([ids[0]]);
  }
  return groups;
}

// The evidence board's columns: the four crew file answers.
export const FIELDS = [
  { key: "colour", label: "Colour" },
  { key: "num", label: "Spice" },
  { key: "bring", label: "Would bring" },
  { key: "deep", label: "Last answer" },
] as const;
