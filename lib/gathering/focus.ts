// "One place to look" for The Gathering and Marlowe Manor (Trapped Below has its own, phoneFocus in
// app/host/trapped.tsx). At any moment a player either needs their phone or should watch the TV.
// The TV names who should check their phone and what for; a phone that doesn't need its player
// says "Eyes on the TV", and one that starts needing them flashes "Your move".

import type { View } from "./game";

// true: this player needs their phone now. false: they should watch the TV.
// null: either is fine (the story browser, where every screen follows every swipe).
export function marloweFocus(view: View, id: string): boolean | null {
  const p = view.players.find((x) => x.id === id);
  if (!p) return false;
  switch (view.room.phase) {
    case "join":
      return !p.joined;
    case "browse":
      return null;
    case "lobby":
      // First the guest book, then picking a detective and answering.
      if (!view.room.book_at) return !p.signed_at;
      return !(p.picked && p.answered);
    case "roles":
      return !p.ready;
    case "tasks":
      return Boolean(view.pairs?.some((pair) => pair.members.includes(id) && !pair.solved));
    case "meeting":
      return !p.dead && !p.voted;
    default:
      // discuss (the notes are on the TV), quiet, tally, revealed, ended.
      return false;
  }
}

// What the phone is for right now, for the TV's "check your phone" tag.
export const PHONE_FOR: Partial<Record<string, string>> = {
  lobby: "pick your detective and answer three questions",
  roles: "read your secret role, then tap “Got it”",
  tasks: "open your lock with your partner",
  meeting: "vote, or skip",
};
