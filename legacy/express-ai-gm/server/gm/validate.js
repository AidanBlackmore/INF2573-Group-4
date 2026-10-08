// Checks and cleans GM output (live or mock) before the game uses it.
// Throws on anything the UI couldn't render; quietly fixes small problems.

class GMValidationError extends Error {}

function fail(msg) {
  throw new GMValidationError(msg);
}

function str(v, field, { required = true, max = 400 } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(`missing ${field}`);
  return s.slice(0, max);
}

function setup(raw, { players }) {
  const ids = new Set(players.map((p) => p.id));
  const roles = {};
  for (const r of raw.roles || []) {
    if (ids.has(r.playerId) && !roles[r.playerId]) {
      roles[r.playerId] = { title: str(r.title, 'role title', { max: 80 }), blurb: str(r.blurb, 'role blurb', { required: false, max: 200 }) };
    }
  }
  for (const id of ids) if (!roles[id]) fail(`no role for ${id}`);
  const relationships = (raw.relationships || [])
    .filter((r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to && typeof r.text === 'string' && r.text.trim())
    .map((r) => ({ from: r.from, to: r.to, text: r.text.trim().slice(0, 200) }));
  return { intro: str(raw.intro, 'intro', { max: 500 }), roles, relationships };
}

// Secret round: one private brief per player. Options are either written by the GM,
// or (pickPlayer) every player in the group, e.g. "Who gets the last medicine?".
function secretRound(raw, { players }) {
  const ids = new Set(players.map((p) => p.id));
  const briefs = {};
  for (const b of raw.briefs || []) {
    if (!ids.has(b.playerId) || briefs[b.playerId]) continue;
    const brief = {
      secret: str(b.secret, 'secret', { max: 300 }),
      prompt: str(b.prompt, 'brief prompt', { max: 200 }),
      pickPlayer: Boolean(b.pickPlayer),
      outcome: str(b.outcome, 'outcome', { required: false, max: 240 }),
      options: [],
    };
    if (brief.pickPlayer) {
      brief.options = players.map((p) => ({ id: p.id, text: p.name }));
    } else {
      const seen = new Set();
      for (const o of b.options || []) {
        const text = typeof o === 'string' ? o : o && o.text;
        if (typeof text !== 'string' || !text.trim() || seen.has(text.trim())) continue;
        seen.add(text.trim());
        const outcome = o && typeof o.outcome === 'string' ? o.outcome.trim().slice(0, 240) : '';
        brief.options.push({ id: 'abcdef'[brief.options.length], text: text.trim().slice(0, 90), outcome });
        if (brief.options.length === 4) break;
      }
      if (brief.options.length < 2) fail(`brief for ${b.playerId} needs 2-4 options`);
    }
    briefs[b.playerId] = brief;
  }
  for (const id of ids) if (!briefs[id]) fail(`no brief for ${id}`);
  return {
    type: 'secret',
    prompt: str(raw.title, 'title', { max: 80 }), // the chapter title stands in for the round's prompt
    scene: str(raw.scene, 'scene', { max: 500 }),
    callback: str(raw.callback, 'callback', { required: false, max: 200 }),
    targetPlayerId: '',
    options: [],
    briefs,
  };
}

function round(raw, ctx) {
  if (ctx.plan.type === 'secret') return secretRound(raw, ctx);
  const { players, plan } = ctx;
  const out = {
    scene: str(raw.scene, 'scene', { max: 500 }),
    type: plan.type, // code decides the type, not the GM
    prompt: str(raw.prompt, 'prompt', { max: 200 }),
    targetPlayerId: plan.targetId || '',
    callback: str(raw.callback, 'callback', { required: false, max: 200 }),
    options: [],
  };
  if (plan.type === 'vote_player') {
    // Every player is a candidate, self-votes allowed.
    out.options = players.map((p) => ({ id: p.id, text: p.name }));
  } else {
    const seen = new Set();
    for (const o of raw.options || []) {
      const text = typeof o === 'string' ? o : o && o.text;
      if (typeof text !== 'string' || !text.trim() || seen.has(text.trim())) continue;
      seen.add(text.trim());
      out.options.push({ id: 'abcdef'[out.options.length], text: text.trim().slice(0, 90) });
      if (out.options.length === 4) break;
    }
    if (out.options.length < 2) fail(`need 2-4 options, got ${out.options.length}`);
  }
  return out;
}

function recap(raw, { players }) {
  const ids = new Set(players.map((p) => p.id));
  const titles = {};
  for (const t of raw.titles || []) {
    if (ids.has(t.playerId) && typeof t.title === 'string' && t.title.trim()) {
      titles[t.playerId] = { title: t.title.trim().slice(0, 80), reason: typeof t.reason === 'string' ? t.reason.trim().slice(0, 200) : '' };
    }
  }
  const memories = (raw.memories || []).filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim().slice(0, 240)).slice(0, 5);
  return { titles, memories, epilogue: str(raw.epilogue, 'epilogue', { required: false, max: 400 }) };
}

module.exports = { setup, round, recap, GMValidationError };
