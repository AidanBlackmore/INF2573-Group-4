// Everything the screens say and show for Trapped Below (story 1).
// The rules and anything secret (the saboteur, the crew files, the answers) live in the
// database; see the Trapped Below section of supabase/migrations/0001_the_gathering.sql.
//
// The story, in one breath: the research sub Meridian dives into the trench to bring home the
// black box of the Calypso, a sub that never came back. Her systems are keyed to her crew, which is
// why she asks about you before the first watch. One of you has orders to make sure the box never
// surfaces: they wiped their own crew file, and they break what the others fix. Every repair buys
// air, brings the sub up, and restores a piece of the wiped file. After each watch the crew meets,
// reads what came back, and votes someone into the airlock.

export const TB_TITLE = "Trapped Below";
export const SUB = "Meridian";

// ---------- the crew file ----------
// Four questions, each used later, and the phone says where. The two "panel" questions have fixed
// choices so the game can check them: the colour is the wire to cut, the number is the code. "Who
// said it?" asks about the "bring" answer in watches 1 and 2 and the deeper answer in watches 3 and
// 4. All four come back, one a meeting, as the clues about the saboteur.
// Roles are dealt after the file, so nobody (not even the saboteur) can tailor their answers.
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

export const CREW_FILE = [
  { q: "What's your favourite colour?", note: "Pick one of the wire colours. The engine panels are wired by crew colour: a crewmate will have to cut yours." },
  { q: "Pick a lucky number from 1 to 9.", note: "This is your access code. A crewmate will have to punch it in." },
  { q: BRING_Q, note: "In a repair, a crewmate will have to guess this." },
  { q: "", note: "Later repairs ask about this one. Shuffle for another question." },
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
  "tb-brief-mission": "We came for the black box of the Calypso. She went down in this trench last year, and somebody aboard would rather nobody found out why.",
  "tb-brief-sub": "This is our sub. Down there, things break. The TV will show you what.",
  "tb-brief-pair": "Repairs take two of you, and only your partner knows how. So talk.",
  "tb-brief-air": "We have eight minutes of air. Every repair buys more. Every mistake costs a little.",
  "tb-brief-sab2": "One of you has orders to keep that black box down here. They'll lie about their answers and break what you fix. Orders come after the crew file, so right now, not even they know who it is.",
  "tb-brief-vote": "Every fix restores a piece of the saboteur's crew file. After each watch we meet: read it, talk, and vote someone into the airlock. Choose wrong, and it costs us a minute of air.",
  "tb-brief-hatch2": "Last thing before we dive. Seal the hatch, in pairs, the way you'll work down there. Everyone holds their bolt at the same time. If one slips, just try again.",
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
  "tb-engine": "Engine room, report. Talk to each other.",
  "tb-oxygen": "Oxygen bay. Say your guess out loud.",
  "tb-sonar": "All hands. Sonar contact. Somebody tell me what's out there.",
  "tb-ballast": "All hands. We're taking on water. Route it to the ballast tank.",
  "tb-breach": "Hull breach! Pump, clear the intake, keep her level, and hold that hatch!",
  "tb-logs-first": "Crew meeting. Every system we fixed brought back a piece of the file the saboteur wiped. Read it. Does it sound like anyone? Then vote.",
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

// The briefing: the board fills in as the captain talks, one tile per thing to know. Each beat starts
// this many seconds in (the recording's length, or a generous guess for the lines the browser's voice
// reads, plus a short pause). The last beat ends at tb_brief_secs() in the database.
export const BRIEF_BEATS = [
  { id: "tb-brief-open", at: 0, title: "Welcome aboard", tick: "" },
  { id: "tb-brief-mission", at: 9.2, title: "The mission", tick: "Bring home the Calypso's black box." },
  { id: "tb-brief-sub", at: 22, title: "Things break", tick: "The TV shows what, and who goes where." },
  { id: "tb-brief-pair", at: 27.8, title: "Fix it in pairs", tick: "One phone has the panel. The other has the manual, all about their partner." },
  { id: "tb-brief-air", at: 33, title: "Air runs out", tick: "Repairs buy air and bring us up. Mistakes cost air. Big breakdowns need every phone at once." },
  { id: "tb-brief-sab2", at: 39.2, title: "One saboteur", tick: "Lies about their answers and breaks what you fix. Dealt after the crew file." },
  { id: "tb-brief-vote", at: 57, title: "Meet and vote", tick: "Fixes bring back the saboteur's answers. Vote someone into the airlock. Wrong: −1:00." },
];
export const BRIEF_SECS = 72;
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
