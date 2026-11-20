// Character portraits: what a player looks like, in the house pen-and-ink style.
// Shared by the phone (lib/gathering/portrait.ts) and the drawing route
// (app/api/portrait/route.ts), so both check descriptions the same way.

export const LOOK_MAX = 120;
// Drawings per player, also enforced by use_draw() in the database.
export const DRAWS = 3;

// The TV is shared, so some words never get drawn. Checked on the phone and on the server.
const BLOCKED = [
  "nude", "naked", "nsfw", "sexy", "sex", "porn", "boob", "breast", "penis", "vagina", "genital", "lingerie", "bikini",
  "blood", "gore", "corpse", "dead body", "decapitat", "suicide", "kill", "gun", "rifle", "pistol", "knife", "weapon",
  "nazi", "swastika", "kkk", "hitler", "terrorist",
  "fuck", "shit", "cunt", "bitch", "dick", "cock", "slut", "whore", "nigg", "fag", "retard",
];

// Why a description can't be drawn, or null when it's fine.
export function lookProblem(look: string): string | null {
  const t = look.trim().toLowerCase();
  if (t.length < 3) return "Describe what you look like first.";
  if (t.length > LOOK_MAX) return `Keep it under ${LOOK_MAX} characters.`;
  // Matched at the start of a word, so "skill" or "Sussex" are fine.
  if (BLOCKED.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t))) return "That one won't go on the TV. Describe your hair, face, clothes or a hat instead.";
  return null;
}

// The player's words go inside this fixed prompt, so everyone is drawn in the same hand.
// The phone then turns the result into ink on paper with a hand-drawn border (portrait.ts).
// Bump this whenever portraitPrompt's wording changes, so PostHog can compare the versions'
// evaluation scores (it's sent as `prompt_version` with every drawing).
export const PROMPT_VERSION = "v2";

// v2: the player's description comes first (FLUX weighs the start most), every feature they
// typed must show, their clothes win over the style, and the style matches the Figma avatars
// (public/figma/av-*.jpg): thick brush ink, caricature features, warm cream paper, tight crop.
export function portraitPrompt(look: string): string {
  const clean = look.replace(/[^\p{L}\p{N} ,.'&-]/gu, " ").replace(/\s+/g, " ").trim().replace(/[ ,.]+$/, "");
  return (
    `A head-and-shoulders portrait of a person: ${clean}. ` +
    "Every feature listed must be clearly visible: hair, face, glasses, facial hair, accessories and the clothes described. " +
    "Drawn as a caricature in thick, confident black brush-ink lines, like a vintage editorial cartoon: " +
    "slightly exaggerated features, expressive heavy-lidded eyes, flat shading with only a little hatching, on warm cream paper. " +
    "One person, centred, cropped tightly at the shoulders."
  );
}

// Pre-drawn portraits (public/portraits), used when the drawing service is busy, slow or out of
// today's free allowance. The phone picks the one whose words best match the description.
export const LIBRARY: Record<string, string> = {
  butler: "butler suit bow tie bowtie tuxedo tired sad slick neat tall thin man short hair formal waiter",
  maid: "maid apron bonnet dark hair bun worried servant woman girl collar dress",
  lady: "lady big hat wide hat flower earrings necklace pendant elegant woman curls blonde fancy dress posh",
  lord: "lord monocle moustache mustache old bald grey gray white hair waistcoat rich posh gentleman tie elderly",
  gardener: "gardener straw hat stubble beard overalls leaf farmer scruffy young man dungarees",
  captain: "captain cap uniform navy officer sailor anchor leader boss man moustache mustache",
  mechanic: "mechanic engineer goggles freckles overalls wrench tools messy curly woman girl dungarees",
  radio: "radio headphones headset glasses specs curly sweater jumper vest music nerd",
  cook: "cook chef apron round smile happy food baker scarf chubby",
  doctor: "doctor old beard grey gray white glasses stethoscope coat professor elderly scientist wild hair",
  navigator: "navigator map cap bun scarf woman girl explorer compass",
};

export function matchLibrary(look: string, seed = ""): string {
  const words = new Set(look.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean));
  let best = "", top = -1;
  for (const [key, tags] of Object.entries(LIBRARY)) {
    const hits = tags.split(" ").filter((w) => words.has(w)).length;
    // Ties go to a stable but varied pick, so two players with no matches don't both get the butler.
    const score = hits + (hash(seed + look + key) % 1000) / 10000;
    if (score > top) [best, top] = [key, score];
  }
  return `/portraits/${best}.jpg`;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
