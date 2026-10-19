// Everything the screens say and show for Murder at Marlowe Manor.
// The rules and anything secret (who the murderer is, lock answers) live in the
// database; see supabase/migrations/0001_the_gathering.sql.

export const TITLE = "Murder at Marlowe Manor";

// ---------- The Gathering: the stories ----------
// The group browses these together after joining. Only Marlowe Manor is playable so far;
// the order matches rooms.focus in the database (0 = Marlowe Manor).
export type Sky = "rain" | "dust" | "stars";
export type Story = {
  key: string;
  short: string;
  title: string;
  tag: string;
  line: string;
  desc: string;
  chips: string[];
  bg: string;
  thumb: string;
  // The story's own colours: accent, title ink and its card on phones.
  hue: string;
  ink: string;
  tile: string;
  sky: Sky;
  music: "marlowe" | "station" | null;
  open: boolean;
  coming?: boolean;
};
const COMING: Omit<Story, "key"> = {
  short: "Coming soon", title: "Coming soon", tag: "Uncharted", line: "Coming soon", desc: "New worlds, same game. This timeline is still being written.",
  chips: [], bg: "", thumb: "", hue: "#ededef", ink: "#ededef", tile: "#ededef", sky: "stars", music: null, open: false, coming: true,
};
export const STORIES: Story[] = [
  {
    key: "marlowe", short: "Marlowe Manor", title: "Murder at Marlowe Manor", tag: "Timeline 01 · 1891", line: "One of you is the murderer.",
    desc: "A storm traps everyone at Lord Fenwick's birthday dinner. By dessert, he's dead, and one of you knows why.",
    chips: ["3–6 players", "25 min", "1 murderer"], bg: "/figma/bg-marlowe-hall.jpg", thumb: "/figma/bg-map-exterior.jpg",
    hue: "#c42b22", ink: "#e8d9b8", tile: "#e8d9b8", sky: "rain", music: "marlowe", open: true,
  },
  {
    key: "station", short: "Station Zero", title: "Sabotage on Station Zero", tag: "Timeline 02 · 2187", line: "One of you is a spy.",
    desc: "A research station drifts at the edge of the system. Someone aboard is cutting the lines, one by one.",
    chips: ["3–6 players", "25 min", "1 spy"], bg: "/figma/bg-station.jpg", thumb: "/figma/thumb-station.jpg",
    hue: "#e8833a", ink: "#d8ece9", tile: "#d5e0e0", sky: "dust", music: "station", open: false,
  },
  { key: "soon-1", ...COMING },
  { key: "soon-2", ...COMING },
];

// The three questions each player answers. Every answer becomes a note hidden in the house.
export const QUESTIONS = [
  "Write down an embarrassing moment.",
  "What's the weirdest thing you've ever eaten?",
  "What's a secret talent nobody here knows about?",
  "What's your most irrational fear?",
  "What's the worst gift you've ever given?",
  "What's a lie you told as a kid that you never confessed?",
  "What's the strangest thing in your search history?",
  "What's a song you secretly know every word to?",
  "What's the pettiest reason you've ever stopped liking someone?",
  "What's the most useless thing you're weirdly good at?",
  "What's a rule you break every single day?",
  "What's the worst haircut you've ever had?",
  "What's the dumbest way you've ever hurt yourself?",
  "What's a food combination you love that everyone else hates?",
  "What did you want to be when you grew up, and why?",
  "What's the most embarrassing thing you've said to a teacher?",
  "What's a habit you'd never admit to on a first date?",
  "What's the last thing you cried at?",
  "What's the strangest compliment you've ever received?",
  "What would your autobiography be called?",
];

// How each answer reads when it's found as a note about the murderer.
const CLUE_LEAD: Record<string, string> = {
  "Write down an embarrassing moment.": "the most embarrassing thing the murderer has ever done is",
  "What's the weirdest thing you've ever eaten?": "the weirdest thing the murderer has ever eaten is",
  "What's a secret talent nobody here knows about?": "the murderer's secret talent is",
  "What's your most irrational fear?": "the murderer's most irrational fear is",
  "What's the worst gift you've ever given?": "the worst gift the murderer has ever given is",
  "What's a lie you told as a kid that you never confessed?": "a lie the murderer told as a kid and never confessed is",
  "What's the strangest thing in your search history?": "the strangest thing in the murderer's search history is",
  "What's a song you secretly know every word to?": "a song the murderer secretly knows every word to is",
  "What's the pettiest reason you've ever stopped liking someone?": "the pettiest reason the murderer ever stopped liking someone is",
  "What's the most useless thing you're weirdly good at?": "the most useless thing the murderer is weirdly good at is",
  "What's a rule you break every single day?": "a rule the murderer breaks every single day is",
  "What's the worst haircut you've ever had?": "the murderer's worst haircut ever was",
  "What's the dumbest way you've ever hurt yourself?": "the dumbest way the murderer has ever hurt themselves is",
  "What's a food combination you love that everyone else hates?": "a food combination the murderer loves (and everyone else hates) is",
  "What did you want to be when you grew up, and why?": "when the murderer was little, they wanted to be",
  "What's the most embarrassing thing you've said to a teacher?": "the most embarrassing thing the murderer has said to a teacher is",
  "What's a habit you'd never admit to on a first date?": "a habit the murderer would never admit to on a first date is",
  "What's the last thing you cried at?": "the last thing the murderer cried at was",
  "What's the strangest compliment you've ever received?": "the strangest compliment the murderer has ever received is",
  "What would your autobiography be called?": "the murderer's autobiography would be called",
};

// How a note opens: the murderer's notes say "the murderer", everyone else's "an innocent person".
export function noteLead(question: string, murderer: boolean): string {
  const base = CLUE_LEAD[question] ?? `when asked "${question}", the murderer answered`;
  return murderer ? base : base.replace("the murderer's", "an innocent person's").replace("the murderer", "an innocent person");
}

// The whole note, as everyone reads it at the meeting.
export function noteText(note: { q: string; a: string; murderer: boolean }): string {
  return `It says ${noteLead(note.q, note.murderer)}: “${note.a.replace(/[.!]$/, "")}”.`;
}

// One partner's half of a torn note.
export function halfText(note: { q: string; murderer: boolean; half: number; words: string }): string {
  return note.half === 0
    ? `…${noteLead(note.q, note.murderer)}: “${note.words} …`
    : `… ${note.words || "(the rest is torn off)"}”`;
}

// The story. Lord Fenwick kept a file of secrets on every guest; each round is an hour of the night.
export const PROLOGUE =
  "A storm has trapped you at Marlowe Manor for Lord Fenwick's birthday dinner. The lights went out, and when they came back on, he was face-down in the trifle. He kept secret files on every guest, locked around the house. One of you killed him to keep yours buried.";

export const CHAPTERS = [
  { time: "Nine o'clock", title: "The empty chair", text: "The road has flooded. Lord Fenwick's files on all of you are locked around the house. Find them." },
  { time: "Ten o'clock", title: "The lights flicker", text: "Someone's glass of port is empty. Wet footprints lead to the cellar. More files wait behind locks." },
  { time: "Eleven o'clock", title: "The dog won't stop barking", text: "The spaniel sits by a door nobody admits opening. The murderer has had all night to tidy up." },
  { time: "Midnight", title: "Twelve strokes", text: "The clock strikes twelve. The killer is getting comfortable, and comfortable people make mistakes." },
  { time: "One o'clock", title: "Candlelight", text: "The power is out. You search by candlelight, close enough to hear each other breathe." },
  { time: "Four o'clock", title: "Before dawn", text: "When the road clears, the murderer walks free. This is your last chance." },
];
export const chapterOf = (round: number) => CHAPTERS[Math.min(Math.max(round, 1), CHAPTERS.length) - 1];

// Every narrated line, word for word. Each has a recording at /narration/<id>.mp3;
// if one is missing, the browser's own voice reads it. Lines never include player names.
export const NARRATION: Record<string, string> = {
  prologue: `${TITLE}. ${PROLOGUE}`,
  ...Object.fromEntries(CHAPTERS.map((c, i) => [`round-${i + 1}`, `${c.time}. ${c.title}. ${c.text}`])),
  quiet: "No murderer's notes tonight. The house is quiet. Nobody points a finger yet.",
  gather: "Everyone gathers in the Grand Hall.",
  scream: "A scream echoes through the house. Someone won't be joining you for dessert.",
  "no-clues": "No murderer's notes yet. Who's been acting strangely?",
  meeting: "Somebody at this table is lying. Who spends the night in the wine cellar?",
  "verdict-murderer": "They lock the accused in the wine cellar. A quiet laugh, then silence. The footsteps upstairs stop.",
  "verdict-innocent": "They lock the accused in the wine cellar. An hour later, the footsteps upstairs start again.",
  "verdict-none": "Nobody agrees. Everyone drifts back into the dark.",
  "end-detectives": "Dawn. The police find the murderer by the fire, Lord Fenwick's file in their lap.",
  "end-murderer": "Dawn. The road clears, and the murderer walks out with Lord Fenwick's last secret.",
};

export const MEET_PROMPTS = [
  "Read your notes aloud. Whose could they be?",
  "Does a note sound like you? Tell the real story.",
  "Whose guesses keep pointing away from themselves?",
];

// ---------- the house ----------
export type RoomKey = "library" | "study" | "conservatory" | "ballroom" | "hall" | "dining" | "cellar" | "kitchen" | "billiards";

export const ROOM_NAMES: Record<RoomKey, string> = {
  library: "Library", study: "Study", conservatory: "Conservatory",
  ballroom: "Ballroom", hall: "Grand Hall", dining: "Dining Room",
  cellar: "Wine Cellar", kitchen: "Kitchen", billiards: "Billiard Room",
};
export const roomName = (key: string | null | undefined) => ROOM_NAMES[key as RoomKey] ?? "somewhere";

// Floor plan: each room's rectangle on the drawing (x, y, width, height).
export const PLAN: Record<RoomKey, [number, number, number, number]> = {
  library: [10, 10, 200, 140], study: [210, 10, 150, 140], conservatory: [360, 10, 250, 140],
  ballroom: [10, 150, 180, 150], hall: [190, 150, 220, 150], dining: [410, 150, 200, 150],
  cellar: [10, 300, 150, 130], kitchen: [160, 300, 250, 130], billiards: [410, 300, 200, 130],
};

// A line of story for each pair, so the TV reads like the night unfolding.
export const BEATS: Record<RoomKey, string> = {
  library: "slip between the shelves of the Library", study: "ease open the Study door",
  conservatory: "push through the ferns of the Conservatory", ballroom: "cross the dark Ballroom floor",
  hall: "climb the Grand Hall stairs", dining: "circle the Dining Room table",
  cellar: "creep down into the Wine Cellar", kitchen: "search the cold Kitchen", billiards: "slip into the Billiard Room",
};

// The room each pair opened, from the design system's backgrounds (closest match where there's no dedicated room art).
export const ROOM_SCENE: Record<RoomKey, string> = {
  library: "bg-room-library", dining: "bg-vote-dining", ballroom: "bg-title-hallway", hall: "bg-lobby-entrance",
  study: "bg-evidence-wall", cellar: "bg-blackout-ink", conservatory: "bg-map-exterior", kitchen: "bg-evidence-wall",
  billiards: "bg-title-hallway",
};

// ---------- locks ----------
export type LockType = "lie" | "charade" | "sketch" | "fuse";
export const LOCK_NAME: Record<LockType, string> = { lie: "Two truths and a lie", charade: "charades", sketch: "a sketch", fuse: "a fuse box" };
export const WIRE_HEX: Record<string, string> = { red: "#dc2626", blue: "#2563eb", yellow: "#facc15", white: "#f5f5f4", black: "#1c1917" };
export const FUSE_RULES = [
  "If there are no red wires, cut the second wire.",
  "Otherwise, if the last wire is white, cut the last wire.",
  "Otherwise, if there is more than one blue wire, cut the last blue wire.",
  "Otherwise, cut the first wire.",
];

// ---------- small helpers ----------
export const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list.join(""));
export const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
