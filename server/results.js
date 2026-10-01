// Turns a finished round's raw answers into results the UI can show, and into
// a one-line plain-text summary the GM reads so later rounds can call back to it.

function nameOf(players, id) {
  const p = players.find((pl) => pl.id === id);
  return p ? p.name : '?';
}

// "Ana", "Ana and Ben", "Ana, Ben and Chi"
function listNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function optionText(round, optionId) {
  const opt = round.gm.options.find((o) => o.id === optionId);
  return opt ? opt.text : '?';
}

// One player's part of a secret round: what only they knew, what they chose and why, and what it led to.
function describeSecret(round, playerId) {
  const brief = round.gm.briefs[playerId];
  if (!brief) return null;
  const value = round.answers[playerId];
  const opt = brief.options.find((o) => o.id === value);
  const outcomeTpl = opt ? (brief.pickPlayer ? brief.outcome : opt.outcome) : '';
  const self = brief.pickPlayer && value === playerId; // "gave the last medicine to themselves"
  return {
    secret: brief.secret,
    prompt: brief.prompt,
    answered: Boolean(opt),
    pickPlayer: brief.pickPlayer,
    choice: opt ? (self ? `${opt.text} (themselves)` : opt.text) : '',
    reason: (round.reasons && round.reasons[playerId]) || '',
    outcome: opt && outcomeTpl ? outcomeTpl.replace(/\{choice\}/g, self ? 'themselves' : opt.text) : '',
  };
}

function computeResult(round, players) {
  const answers = round.answers;
  switch (round.plan.type) {
    case 'choice': {
      const byOption = round.gm.options.map((o) => ({
        optionId: o.id,
        text: o.text,
        playerIds: Object.keys(answers).filter((pid) => answers[pid] === o.id),
      }));
      return { byOption };
    }
    case 'vote_player': {
      // Every player appears, most-voted first. Who voted for whom stays in `answers`
      // and is only sent to players if the host reveals it.
      const tally = players
        .map((p) => ({ playerId: p.id, count: Object.values(answers).filter((v) => v === p.id).length }))
        .sort((a, b) => b.count - a.count);
      const top = tally[0] ? tally[0].count : 0;
      const winners = top > 0 ? tally.filter((t) => t.count === top).map((t) => t.playerId) : [];
      return { tally, winners };
    }
    case 'predict': {
      // The target answers for themselves; everyone else guesses the target's answer.
      const targetId = round.plan.targetId;
      const actual = answers[targetId] ?? null;
      const guessers = Object.keys(answers).filter((pid) => pid !== targetId);
      const correctIds = actual ? guessers.filter((pid) => answers[pid] === actual) : [];
      return { actual, guesserIds: guessers, correctIds };
    }
    case 'secret':
      // Everyone with a brief gets a turn in the reveal, in seating (join) order.
      return { order: players.map((p) => p.id).filter((pid) => round.gm.briefs[pid]) };
    default:
      return {};
  }
}

// What one player's answer means in words, e.g. for reaction cards and the recap.
function answerText(round, players, playerId) {
  const value = round.answers[playerId];
  if (value === undefined) return '';
  switch (round.plan.type) {
    case 'vote_player': return value === playerId ? 'voted for themselves' : `voted for ${nameOf(players, value)}`;
    case 'predict': return playerId === round.plan.targetId ? `chose "${optionText(round, value)}"` : `guessed "${optionText(round, value)}"`;
    case 'secret': {
      const s = describeSecret(round, playerId);
      return s.pickPlayer ? `picked ${s.choice}` : `chose "${s.choice}"`;
    }
    default: return `chose "${optionText(round, value)}"`;
  }
}

// Reaction totals per answer, most reacted first: [{ playerId, total, counts: {emoji: n} }]
function reactionSummary(round) {
  return Object.entries(round.reactions || {})
    .map(([playerId, byReactor]) => {
      const counts = {};
      for (const e of Object.values(byReactor)) counts[e] = (counts[e] || 0) + 1;
      return { playerId, total: Object.values(byReactor).length, counts };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

function emojiString(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([e, c]) => e.repeat(c)).join('');
}

// Short factual summary of what happened, e.g. for the GM's history and the recap.
function describeRound(round, players) {
  const reactions = reactionSummary(round).slice(0, 2)
    .map((x) => `${nameOf(players, x.playerId)} (${answerText(round, players, x.playerId)}) got ${emojiString(x.counts)}`);
  const base = describeOutcome(round, players);
  return reactions.length ? `${base} Reactions: ${reactions.join('; ')}.` : base;
}

function describeOutcome(round, players) {
  const r = round.result || {};
  const n = (id) => nameOf(players, id);
  switch (round.plan.type) {
    case 'choice': {
      const parts = r.byOption
        .filter((o) => o.playerIds.length)
        .map((o) => `${o.playerIds.map(n).join(', ')} chose "${o.text}"`);
      return parts.join('; ') || 'Nobody answered.';
    }
    case 'vote_player': {
      if (!r.winners.length) return 'Nobody voted.';
      const counts = r.tally.filter((t) => t.count).map((t) => `${n(t.playerId)} ${t.count}`).join(', ');
      let text = `The group picked ${listNames(r.winners.map(n))} (votes: ${counts}).`;
      if (round.votersRevealed) {
        text += ' Who voted for whom: ' + Object.entries(round.answers).map(([v, t]) => `${n(v)}→${n(t)}`).join(', ') + '.';
      }
      return text;
    }
    case 'predict': {
      const target = n(round.plan.targetId);
      if (!r.actual) return `${target} didn't answer, so nobody could be right.`;
      const wrong = r.guesserIds.filter((pid) => !r.correctIds.includes(pid));
      let text = `${target} chose "${optionText(round, r.actual)}".`;
      text += r.correctIds.length ? ` Guessed right: ${listNames(r.correctIds.map(n))}.` : ' Nobody guessed it.';
      if (wrong.length) text += ` Wrong: ${wrong.map((pid) => `${n(pid)} guessed "${optionText(round, round.answers[pid])}"`).join(', ')}.`;
      return text;
    }
    case 'secret':
      return r.order.map((pid) => {
        const s = describeSecret(round, pid);
        if (!s.answered) return `${n(pid)} knew "${s.secret}" but didn't decide in time.`;
        return `${n(pid)} knew "${s.secret}" and chose "${s.choice}"${s.reason ? ` (why: "${s.reason}")` : ''}. Result: ${s.outcome || 'unknown'}`;
      }).join(' ');
    default:
      return '';
  }
}

module.exports = { computeResult, describeRound, describeOutcome, describeSecret, nameOf, optionText, listNames, answerText, reactionSummary, emojiString };
