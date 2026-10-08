import {
  getUniverse,
  type Act,
  type OptionAct,
  type Split,
  type Universe,
} from "@/content/universes";

export type Phase = "lobby" | "choosing" | "revealed" | "ended";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  phase: Phase;
  round: number;
  universe_id: string | null;
  act: number;
  act_kind: "player" | "option" | null;
  act_options: string[];
  run_start_round: number;
  tie_pick: string | null;
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
  chosen_player_id: string | null;
  chosen_option: string | null;
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PLAYER_HINT = "Needs 2 to 6 players. Open on a laptop, everyone joins with their phone.";

export function hasSubmitted(player: Player, room: Room): boolean {
  return (room.phase === "choosing" || room.phase === "revealed") && player.submitted_round === room.round;
}

export function currentUniverse(room: Room): Universe | undefined {
  return getUniverse(room.universe_id);
}

export function currentAct(room: Room): Act | undefined {
  return currentUniverse(room)?.acts[room.act - 1];
}

// What the database needs to validate choices for an act.
export function actConfig(act: Act) {
  return {
    p_act_kind: act.kind,
    p_act_options: act.kind === "option" ? act.options.map((o) => o.key) : [],
  };
}

function answerOf(choice: Choice): string {
  return choice.chosen_player_id ?? choice.chosen_option ?? "";
}

// ---------------------------------------------------------------------------
// One act's result
// ---------------------------------------------------------------------------

export type Candidate = { key: string; label: string };

export type ActResult = {
  split: Split;
  // Everything that got at least one vote, most votes first.
  counts: { candidate: Candidate; count: number }[];
  // Candidates sharing the most votes. More than one means the host decides.
  tied: Candidate[];
  // Null until the host has broken a tie.
  winner: Candidate | null;
  runnerUp: Candidate | null;
};

export function candidatesFor(act: Act, players: Player[]): Candidate[] {
  return act.kind === "player"
    ? players.map((p) => ({ key: p.id, label: p.name }))
    : act.options.map((o) => ({ key: o.key, label: `${o.key}) ${o.label}` }));
}

export function computeResult(
  act: Act,
  choices: Choice[],
  players: Player[],
  tiePick: string | null,
): ActResult {
  const votes = new Map<string, number>();
  for (const choice of choices) {
    const key = answerOf(choice);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }

  // Stable sort: equal counts keep player join order / option order.
  const ranked = candidatesFor(act, players)
    .map((candidate) => ({ candidate, count: votes.get(candidate.key) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const total = choices.length;
  const top = ranked[0]?.count ?? 0;
  const topGroup = ranked.filter((r) => r.count === top).map((r) => r.candidate);

  const split: Split =
    total > 0 && top === total ? "together" : top > total / 2 ? "majority" : "divided";

  const tied = topGroup.length > 1 ? topGroup : [];
  const winner = tied.length ? (tied.find((c) => c.key === tiePick) ?? null) : (topGroup[0] ?? null);
  // Second place: the best of the rest. Only the top spot is ever left to the host.
  const runnerUp = winner ? (ranked.find((r) => r.candidate.key !== winner.key)?.candidate ?? null) : null;

  return {
    split,
    counts: ranked.filter((r) => r.count > 0),
    tied,
    winner,
    runnerUp,
  };
}

// Opener placeholder. Later this can return an AI-generated line that reacts
// to how the group voted. Keep the written outcomes untouched; only swap this.
export function getOpener(act: OptionAct, split: Split): string {
  return act.openers[split];
}

export function actOutcome(act: Act, result: ActResult): { opener?: string; outcome: string } | null {
  const { winner, runnerUp, split } = result;
  if (!winner) return null;

  if (act.kind === "player") {
    const outcome = act.outcomes[split]
      .replaceAll("{winner}", winner.label)
      .replaceAll("{runner_up}", runnerUp?.label ?? winner.label);
    return { outcome };
  }

  const option = act.options.find((o) => o.key === winner.key);
  return { opener: getOpener(act, split), outcome: option?.outcome ?? "" };
}

// ---------------------------------------------------------------------------
// Ending recap: counts only, never motives
// ---------------------------------------------------------------------------

export type Recap = {
  totalActs: number;
  agreedActs: number;
  mostSame: { pairs: string[]; count: number } | null;
  mostDifferent: { pairs: string[]; count: number } | null;
};

export function computeRecap(universe: Universe, room: Room, choices: Choice[], players: Player[]): Recap {
  const acts = universe.acts.map((_, i) => {
    const round = room.run_start_round + i;
    const answers = new Map<string, string>();
    for (const c of choices) if (c.round === round) answers.set(c.player_id, answerOf(c));
    return answers;
  });

  const agreedActs = acts.filter((answers) => {
    const values = [...answers.values()];
    return values.length >= 2 && values.every((v) => v === values[0]);
  }).length;

  const pairs: { label: string; same: number; different: number }[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      let same = 0;
      let different = 0;
      for (const answers of acts) {
        if (!answers.has(a.id) || !answers.has(b.id)) continue;
        if (answers.get(a.id) === answers.get(b.id)) same++;
        else different++;
      }
      pairs.push({ label: `${a.name} and ${b.name}`, same, different });
    }
  }

  // Ties are listed together rather than picked.
  const best = (key: "same" | "different") => {
    const count = Math.max(0, ...pairs.map((p) => p[key]));
    if (count === 0) return null;
    return { pairs: pairs.filter((p) => p[key] === count).map((p) => p.label), count };
  };

  return {
    totalActs: universe.acts.length,
    agreedActs,
    mostSame: best("same"),
    mostDifferent: best("different"),
  };
}
