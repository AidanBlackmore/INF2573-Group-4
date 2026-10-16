// The murder mystery universe. One player is secretly the murderer, and the
// body is hidden in one room of the mansion. Each act the group votes on a
// room to search. Finding the body reveals the murderer's icebreaker answer as
// a clue, and the next act is the accusation. At most 10 acts: 9 searches and
// the accusation. The rules run in the database (supabase/migrations/0007).
//
// Placeholders: {framed} in evidence lines is the framed player's name.
// {winner} and {murderer} in the accusation outcomes are player names.

import type { AccusationAct, MansionRoom, SearchAct, Universe } from "./universes";

// The blueprint: a 3 by 3 floor plan. col and row place each room on the map.
export const MANSION_ROOMS: MansionRoom[] = [
  {
    key: "library",
    name: "Library",
    col: 0,
    row: 0,
    empty: "Shelves of unread books and one very judgemental bust of Shakespeare. Nothing here.",
    evidence: "Wedged between two encyclopedias: a bookmark with {framed}'s name on it, stained red.",
  },
  {
    key: "study",
    name: "Study",
    col: 1,
    row: 0,
    empty: "A cold cup of tea and an unfinished crossword. Whoever did this, they weren't here.",
    evidence: "In the desk drawer: a letter in {framed}'s handwriting that just says 'Tonight.'",
  },
  {
    key: "conservatory",
    name: "Conservatory",
    col: 2,
    row: 0,
    empty: "Orchids, a dripping tap and a cat who refuses to explain itself. Empty.",
    evidence: "Muddy footprints lead out to the garden. They're exactly {framed}'s shoe size.",
  },
  {
    key: "ballroom",
    name: "Ballroom",
    col: 0,
    row: 1,
    empty: "A chandelier sways slightly. The dance floor is spotless. Too spotless? No, just clean.",
    evidence: "Under the piano: one of {framed}'s cufflinks, as if dropped in a hurry.",
  },
  {
    key: "hall",
    name: "Grand Hall",
    col: 1,
    row: 1,
    empty: "Twelve portraits stare down at you. None of them saw anything, apparently.",
    evidence: "On the coat rack hangs {framed}'s scarf, damp and smelling of the cellar.",
  },
  {
    key: "dining",
    name: "Dining Room",
    col: 2,
    row: 1,
    empty: "Half-eaten trifle, abandoned place cards. Lord Fenwick's chair is still pushed out.",
    evidence: "{framed}'s place card has been torn in half and tucked under Lord Fenwick's plate.",
  },
  {
    key: "cellar",
    name: "Wine Cellar",
    col: 0,
    row: 2,
    empty: "Dusty bottles, a flickering bulb and the drip of something you hope is wine. Nothing.",
    evidence: "An empty bottle of the 1962 Bordeaux, with {framed}'s fingerprints all over the glass.",
  },
  {
    key: "kitchen",
    name: "Kitchen",
    col: 1,
    row: 2,
    empty: "The cook's knives are all accounted for. You count twice. Still all there.",
    evidence: "A dessert spoon with {framed}'s initials scratched into the handle, left in the sink.",
  },
  {
    key: "billiards",
    name: "Billiard Room",
    col: 2,
    row: 2,
    empty: "A game left mid-play. The eight ball is missing, but there's no body.",
    evidence: "Chalked on the scoreboard, in a hurry: '{framed} owes me.'",
  },
];

// One line per search act, building toward dawn.
const SEARCHES: Omit<SearchAct, "kind" | "rooms">[] = [
  {
    title: "The empty chair",
    scenario:
      "Dinner at Marlowe Manor. Between the soup and the trifle, Lord Fenwick excused himself and never came back. The butler swears he heard a thud. One of you knows exactly where he is. Where do you search first?",
  },
  {
    title: "Nine o'clock",
    scenario: "The grandfather clock strikes nine. The phones have no signal and the storm is getting worse. Which room next?",
  },
  {
    title: "Ten o'clock",
    scenario: "The lights flicker. Somebody's glass of port is suddenly empty. Which room next?",
  },
  {
    title: "Eleven o'clock",
    scenario: "Footsteps upstairs, though everyone is standing right here. Supposedly. Which room next?",
  },
  {
    title: "Midnight",
    scenario: "Midnight. The butler has locked himself in the pantry and refuses to come out. Which room next?",
  },
  {
    title: "One o'clock",
    scenario: "The storm cuts the power. You search by candlelight now. Which room next?",
  },
  {
    title: "Two o'clock",
    scenario: "Everyone is tired and nobody trusts anybody. Someone suggests splitting up. Nobody agrees. Which room next?",
  },
  {
    title: "Three o'clock",
    scenario: "The fire is dying. Lord Fenwick's dog sits by the door, whining at nothing. Which room next?",
  },
  {
    title: "Last chance",
    scenario:
      "The police will arrive at dawn, and by then the murderer will have tidied everything away. This is your last search. Which room?",
  },
];

const ACCUSATION: AccusationAct = {
  kind: "accusation",
  title: "The accusation",
  scenario:
    "Lord Fenwick has been found, and the note on him was written by someone at this table. Who is the murderer?",
  outcomes: {
    caught:
      "It was {murderer}. The group saw straight through them. {murderer} sighs, straightens their jacket, and asks if they can at least finish the trifle.",
    escaped:
      "The group points at {winner}. But it was {murderer} all along, who quietly helps themselves to the last of the trifle and says nothing at all.",
  },
};

export const MURDER_MYSTERY: Universe = {
  id: "murder-mystery",
  title: "Murder at Marlowe Manor",
  tagline: "One of you did it. The body is somewhere in the house.",
  tone: "Murder mystery",
  meta: "About 15-25 min · 3-6 players · one secret murderer",
  minPlayers: 3,
  mystery: {
    rooms: MANSION_ROOMS,
    maxSearches: SEARCHES.length,
    bodyFound:
      "Lord Fenwick is slumped in the {room}, very much dead. Pinned to his jacket is a note, in handwriting you almost recognise.",
    dragged: "While you were searching, something heavy was dragged across the floor somewhere in the house.",
  },
  acts: [...SEARCHES.map((s) => ({ ...s, kind: "search" as const, rooms: MANSION_ROOMS })), ACCUSATION],
};
