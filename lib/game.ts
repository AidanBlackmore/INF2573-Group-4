export type Phase = "lobby" | "choosing" | "revealed";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  phase: Phase;
  round: number;
  created_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  submitted_round: number;
  created_at: string;
};

export type Choice = {
  id: string;
  room_id: string;
  round: number;
  player_id: string;
  chosen_player_id: string;
};

export const SCENARIO =
  "Your group is stranded overnight in an abandoned mall. Only one person can control the group's remaining money. Who should it be?";

export const MIN_PLAYERS = 2;

export function hasSubmitted(player: Player, room: Room): boolean {
  return room.phase !== "lobby" && player.submitted_round === room.round;
}

// "3 chose Mary", most votes first. Players nobody chose are left out.
export function tally(choices: Choice[], players: Player[]) {
  const counts = new Map<string, number>();
  for (const choice of choices) {
    counts.set(choice.chosen_player_id, (counts.get(choice.chosen_player_id) ?? 0) + 1);
  }
  return players
    .filter((p) => counts.has(p.id))
    .map((p) => ({ player: p, count: counts.get(p.id)! }))
    .sort((a, b) => b.count - a.count || a.player.name.localeCompare(b.player.name));
}
