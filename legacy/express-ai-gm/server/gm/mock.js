// Mock Game Master: canned responses from config/mock/<world>.json.
// Returns the same shapes as the live GM so the rest of the app can't tell the difference.
const config = require('../config');

function pick(list, i) {
  return list[i % list.length];
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

async function setup({ world, players, traits }) {
  const script = config.mockScript(world.id).setup;
  const offset = Math.floor(Math.random() * script.roles.length);
  // Each player gets the role written for the trait the group voted them; anyone left over gets a spare role.
  const used = new Set();
  const byTrait = players.map((p) => {
    const role = traits && script.roles.find((r) => r.trait === traits[p.id].id && !used.has(r));
    if (role) used.add(role);
    return role;
  });
  const spare = script.roles.filter((r) => !used.has(r));
  const roles = players.map((p, i) => {
    const { title, blurb } = byTrait[i] || spare.shift() || pick(script.roles, i + offset);
    return { playerId: p.id, title, blurb };
  });
  // Pair each player with the next one so everyone is in at least one relationship.
  const relationships = players.length < 2 ? [] : players.map((p, i) => {
    const other = players[(i + 1) % players.length];
    const text = fill(pick(script.relationships, i + offset), { a: p.name, b: other.name });
    return { from: p.id, to: other.id, text };
  });
  return { intro: script.intro, roles, relationships };
}

// Secret round: a shared scene plus one private brief per player, matched to their trait.
function secretRound({ world, players, traits, history }) {
  const pool = config.mockRounds(world.id, 'secret');
  const tpl = pick(pool, history.filter((h) => h.type === 'secret').length);
  const left = [...tpl.briefs];
  const take = (b) => left.splice(left.indexOf(b), 1)[0];
  const matched = players.map((p) => {
    const b = traits && left.find((x) => x.trait === traits[p.id].id);
    return b ? take(b) : null;
  });
  const briefs = players.map((p, i) => {
    const b = matched[i] || (left.length ? left.shift() : pick(tpl.briefs, i));
    const others = players.filter((o) => o.id !== p.id);
    const vars = { name: p.name, someone: randomOf(others).name };
    return {
      playerId: p.id,
      secret: fill(b.secret, vars),
      prompt: fill(b.prompt, vars),
      pickPlayer: Boolean(b.pickPlayer),
      options: (b.options || []).map((o) => ({ text: fill(o.text, vars), outcome: fill(o.outcome, vars) })),
      outcome: b.outcome ? fill(b.outcome, vars) : '',
    };
  });
  return { title: tpl.title, scene: tpl.scene, briefs, callback: '' };
}

async function round(ctx) {
  if (ctx.plan.type === 'secret') return secretRound(ctx);
  const { world, players, history, plan } = ctx;
  const pool = config.mockRounds(world.id, plan.type);
  const usedOfType = history.filter((h) => h.type === plan.type).length;
  const tpl = pick(pool, usedOfType);
  const target = players.find((p) => p.id === plan.targetId);
  const others = players.filter((p) => p.id !== plan.targetId);
  const vars = { target: target ? target.name : 'someone', someone: randomOf(others.length ? others : players).name };
  return {
    scene: fill(tpl.scene, vars),
    type: plan.type,
    prompt: fill(tpl.prompt, vars),
    options: (tpl.options || []).map((text, i) => ({ id: 'abcdef'[i], text: fill(text, vars) })),
    targetPlayerId: plan.targetId || '',
    callback: '',
  };
}

async function recap({ world, players, stats }) {
  const script = config.mockScript(world.id).recap;
  const offset = Math.floor(Math.random() * script.titles.length);
  return {
    titles: players.map((p, i) => ({ playerId: p.id, title: pick(script.titles, i + offset), reason: '' })),
    memories: stats.highlights.slice(0, 3),
    epilogue: script.epilogue,
  };
}

module.exports = { setup, round, recap };
