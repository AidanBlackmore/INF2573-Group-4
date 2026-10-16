// Icebreaker questions. Before the game starts, every player answers one on
// their phone. Everyone starts with the same question for the room, and can
// shuffle to another if they'd rather not answer it. Answers are private: the
// murder mystery reveals only the murderer's answer, as the clue on the body.
export const ICEBREAKERS: string[] = [
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

// Everyone in a room starts with the same question, picked from the room id.
export function roomIcebreaker(roomId: string): number {
  let hash = 0;
  for (const ch of roomId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % ICEBREAKERS.length;
}

// Shuffle: any other question.
export function shuffleIcebreaker(current: number): number {
  const next = Math.floor(Math.random() * (ICEBREAKERS.length - 1));
  return next >= current ? next + 1 : next;
}
