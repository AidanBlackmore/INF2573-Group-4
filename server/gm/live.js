// Live Game Master: calls Claude through the Anthropic API and asks for structured JSON.
// The prompts live in server/prompts/*.md and are re-read on every call, so the team
// can edit them while the server is running.
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod');
const { GMValidationError } = require('./validate');

const MODEL = process.env.GM_MODEL || 'claude-sonnet-5';
const EFFORT = process.env.GM_EFFORT || 'medium';
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

// ---------- output schemas (what Claude must return) ----------
// Round type and target are decided by the game code, so Claude only writes the content.

const SetupSchema = z.object({
  intro: z.string(),
  roles: z.array(z.object({ playerId: z.string(), title: z.string(), blurb: z.string() })),
  relationships: z.array(z.object({ from: z.string(), to: z.string(), text: z.string() })),
});

const RoundSchema = z.object({
  scene: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
  callback: z.string(),
});

const SecretSchema = z.object({
  title: z.string(),
  scene: z.string(),
  briefs: z.array(z.object({
    playerId: z.string(),
    secret: z.string(),
    prompt: z.string(),
    pickPlayer: z.boolean(),
    options: z.array(z.object({ text: z.string(), outcome: z.string() })),
    outcome: z.string(),
  })),
  callback: z.string(),
});

const RecapSchema = z.object({
  titles: z.array(z.object({ playerId: z.string(), title: z.string(), reason: z.string() })),
  memories: z.array(z.string()),
  epilogue: z.string(),
});

// ---------- prompt building ----------

function readPrompt(file) {
  return fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
}

function taskInstructions(name) {
  const text = readPrompt('task-instructions.md');
  const match = text.split(/^## /m).find((part) => part.startsWith(`${name}\n`));
  if (!match) throw new Error(`No "## ${name}" section in task-instructions.md`);
  return match.slice(name.length + 1).trim();
}

function describeFacts({ world, players, traits, quizTallies, cast, history }) {
  const name = (id) => (players.find((p) => p.id === id) || { name: id }).name;
  const lines = [
    `# World\n${world.name}: ${world.tagline}\nTone: ${world.tone}`,
    `# Players\n${players.map((p) => `- ${p.id}: ${p.name}`).join('\n')}`,
  ];
  if (quizTallies) {
    lines.push(`# How the group sees each other (casting quiz, everyone voted)\n${quizTallies.map((q) => `- "${q.question}" ${q.tally.map((t) => `${name(t.playerId)} ${t.count}`).join(', ') || 'no votes'}`).join('\n')}`);
  }
  if (traits) {
    lines.push(`# Trait each player's role must be built on\n${players.map((p) => `- ${p.name} (${p.id}): ${traits[p.id].label} (${traits[p.id].votes} of ${traits[p.id].of} votes)`).join('\n')}`);
  }
  if (cast) {
    lines.push(`# Cast\n${cast.intro}\n${players.map((p) => `- ${p.name} (${p.id}) is "${cast.roles[p.id].title}": ${cast.roles[p.id].blurb}`).join('\n')}`);
    if (cast.relationships.length) lines.push(`# Relationships\n${cast.relationships.map((r) => `- ${r.text}`).join('\n')}`);
  }
  if (history && history.length) {
    lines.push(`# What has happened so far\n${history.map((h) => `- Round ${h.round} (${h.type}${h.targetId ? `, about ${name(h.targetId)}` : ''}) "${h.prompt}": ${h.outcome}`).join('\n')}`);
  }
  return lines.join('\n\n');
}

// ---------- API call ----------

let client = null;
function getClient() {
  // Fail fast in a live room: short timeout, one SDK-level retry, then we fall back to mock.
  client ||= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

async function ask(schema, userText) {
  const outputConfig = { format: zodOutputFormat(schema) };
  if (!MODEL.includes('haiku')) outputConfig.effort = EFFORT; // Haiku doesn't support effort
  const started = Date.now();
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: readPrompt('gm-system.md'),
    messages: [{ role: 'user', content: userText }],
    output_config: outputConfig,
  });
  console.log(`[gm] ${MODEL} replied in ${((Date.now() - started) / 1000).toFixed(1)}s (${response.usage.output_tokens} output tokens)`);
  if (response.stop_reason === 'refusal') throw new GMValidationError('model declined');
  if (response.stop_reason === 'max_tokens') throw new GMValidationError('response cut off');
  if (!response.parsed_output) throw new GMValidationError('no parseable JSON');
  return response.parsed_output;
}

// ---------- the three tasks ----------

async function setup(ctx) {
  return ask(SetupSchema, `${describeFacts(ctx)}\n\n# Your task\n${taskInstructions('setup')}`);
}

async function round(ctx) {
  const { plan, roundNumber, totalRounds, players } = ctx;
  const target = players.find((p) => p.id === plan.targetId);
  const specifics = [
    `This is round ${roundNumber} of ${totalRounds}.${roundNumber === totalRounds ? ' It is the final round, so make it a big one.' : ''}`,
    target ? `TARGET player: ${target.name} (${target.id}).` : '',
  ].filter(Boolean).join('\n');
  const schema = plan.type === 'secret' ? SecretSchema : RoundSchema;
  const raw = await ask(schema, `${describeFacts(ctx)}\n\n# Your task\n${taskInstructions(plan.type)}\n\n${specifics}`);
  return { ...raw, type: plan.type, targetPlayerId: plan.targetId || '' };
}

async function recap(ctx) {
  const { stats, players } = ctx;
  const name = (id) => (players.find((p) => p.id === id) || { name: id }).name;
  const facts = [
    `# Awards already computed\n${stats.awards.map((a) => `- ${a.label}: ${a.playerIds.map(name).join(', ')} (${a.detail})`).join('\n') || '- none'}`,
    `# Candidate moments (most memorable first)\n${stats.highlights.map((h) => `- ${h}`).join('\n') || '- none'}`,
  ].join('\n\n');
  return ask(RecapSchema, `${describeFacts(ctx)}\n\n${facts}\n\n# Your task\n${taskInstructions('recap')}`);
}

module.exports = { setup, round, recap, MODEL };
