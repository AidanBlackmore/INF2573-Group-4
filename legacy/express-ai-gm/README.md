# Alternate Universe (prototype)

> **Archived.** This is the earlier Express + Socket.io version with the AI Game Master, kept here so nothing is lost. The game that runs from the repo root is now the Next.js + Supabase version (see the main [README](../../README.md)).
>
> To run this version, do everything below from this folder:
>
> ```bash
> cd legacy/express-ai-gm
> npm install
> npm start
> ```

A party game for 3–6 friends in the same room, each on their own phone. An AI Game Master drops the group into a fictional world (zombie apocalypse, reality TV villa, office…).

1. **Casting quiz.** Everyone votes on questions like "Who has the strongest execution?" or "Who is the most unpredictable?". Each player gets the trait the group voted them, and a role built on it.
2. **Secret chapters.** Everyone shares one scene, but each player privately gets different information and a different decision based on their role. One player knows food is running out, another knows a dangerous route to more supplies, someone else decides who gets the last medicine. Each player chooses alone and can add a short "why".
3. **The reveal.** The host reveals each player's secret, choice, reason and its consequence one at a time, and the group reacts. Those consequences open the next chapter.
4. **Recap.** A recap at the end collects the secrets, choices and reactions that could become inside jokes.

The AI acts as a Game Master: it sets up situations, adapts the story and connects earlier decisions to later events, but the important choices always come from the players.

**Design principle:** the story is only a backdrop. Every feature should serve interaction between players, not the plot.

## Run it

Requires Node 18+.

```bash
npm install
npm start
```

The server prints two addresses:

```
Alternate Universe running (GM mode: mock)
  This computer:  http://localhost:3000
  Phones on Wi-Fi: http://192.168.1.23:3000
```

1. Connect every phone to the **same Wi-Fi** as the laptop and open the "Phones on Wi-Fi" address.
2. One person taps **Create a room** and becomes the host (👑). The others enter the 4-letter code, or open the link shown in the lobby.
3. The host controls the pace: start, lock in the world, next round.

If phones can't connect, your OS firewall is probably blocking port 3000. Allow Node through it, or try a phone hotspot. University Wi-Fi often blocks device-to-device traffic.

**Testing alone:** open several browser tabs, each one is a separate player. Or run the bot smoke test:

```bash
npm run simulate        # 4 bots play a full game in mock mode
node scripts/simulate.js 6
```

## Mock vs live Game Master

| Mode | What it does | Needs |
|---|---|---|
| `mock` (default) | Canned scenes from `config/mock/*.json`. Instant, free, offline. | Nothing |
| `live` | Claude writes roles, rounds and the recap for your group, adapting to earlier votes and reactions. | An Anthropic API key |

To switch, copy `.env.example` to `.env` and edit:

```bash
GM_MODE=live
ANTHROPIC_API_KEY=sk-ant-...
GM_MODEL=claude-sonnet-5   # try claude-haiku-4-5 if rounds feel slow
GM_EFFORT=medium           # low = faster, high = more considered
```

Then restart `npm start`. The footer of every screen shows where the last GM output came from: `mock`, `live`, or `fallback`. If a live call fails or returns bad JSON, the server retries once and then quietly uses a mock scene, so a play-test never gets stuck. `fallback` in the footer means that happened; the server console shows why.

## Where to change things

| I want to… | Edit |
|---|---|
| **Tune the Game Master's personality and rules** | `server/prompts/gm-system.md` |
| Change what the GM is asked for in each task (setup, each round type, recap) | `server/prompts/task-instructions.md` (one `## section` per task) |
| Change the **casting quiz** questions and traits | `config/quiz.json` (each trait's `id` matches the `trait` on mock roles and secret-chapter briefs) |
| Add or edit a **world** | `config/worlds.json` (live mode works with any world immediately) |
| Write mock content for a world | `config/mock/<world id>.json` (copy `zombie.json`). Worlds without a file, or without a pool for a round type, use `generic.json`. |
| Change the **number, order or type of rounds**, player limits, or reaction emoji | `config/round-plan.json` |
| Change colours and sizes | `public/style.css` (tokens at the top) |

The prompt and config files are re-read on every use, so you can edit them while the server is running. Prompt and mock changes apply from the next GM call; world and round-plan changes apply from the next game.

### Round types

`round-plan.json` lists the rounds in order. Each entry is `{ "type": "..." }`:

| Type | How it plays |
|---|---|
| `secret` (default) | A chapter: each player gets a private secret and their own decision, based on their role. Options are either written per player or "pick a player" (e.g. who gets the medicine). The host reveals decisions one player at a time; each shows the secret, choice, optional reason and consequence. Consequences are listed at the start of the next chapter and passed to the GM. |
| `choice` | Everyone picks what they'd do. The reveal shows who picked what, by name. |
| `vote_player` | "Who would…?" Everyone votes for a player (self-votes allowed). Tallies first; the host can then reveal who voted for whom. |
| `predict` | The spotlight player answers honestly and everyone else guesses their answer. The target rotates to whoever has had the spotlight least. |

**Emoji reactions** aren't a round type: they appear after every reveal, so players can react to each other's answers. They feed into the GM's history and the recap.

The code decides each round's *type* and *target*; the GM only writes the *content*. This keeps the game reliable and gives every player a turn in the spotlight.

Adding a brand-new round type touches: `server/results.js` (score it and describe it), `server/gm/validate.js` (what output it needs), `public/app.js` (`renderResult`, plus any instructions in `renderAnswering`), a `## section` in `task-instructions.md`, and a pool in each `config/mock/*.json`.

## How it fits together

```
server/
  index.js          Express + Socket.IO; one socket event per player action
  rooms.js          In-memory rooms and the phase machine (the only code that changes state)
  results.js        Scores a finished round and summarises it in plain text for the GM
  recap.js          End-of-game stats and awards, computed from what really happened
  gm/index.js       Chooses mock/live, validates output, falls back to mock
  gm/live.js        Anthropic API call with structured JSON output
  gm/mock.js        Canned responses
  gm/validate.js    Checks and cleans GM output before the UI sees it
  prompts/*.md      The GM prompts (team-editable)
config/             Worlds, round plan, mock scripts (team-editable)
public/             Plain HTML/CSS/JS client, no build step
scripts/simulate.js Bot smoke test
```

Game flow: `lobby → world (everyone votes, host locks in) → quiz (casting votes) → roles → [answering → reveal + reactions] × rounds → recap`.

The GM returns JSON like this for a round. The app adds the round type, the target, and, for votes, the player list:

```json
{
  "scene": "The last can of peaches sits on the food court table. Everyone saw it.",
  "prompt": "Who would secretly eat the last can of peaches tonight?",
  "options": [],
  "callback": ""
}
```

Each request includes the world, the players, their roles and relationships, and a one-line summary of every earlier round: choices, vote tallies, prediction results and the most-reacted answers. That summary is what lets the GM call back to earlier moments. For secret votes it only includes the tallies, so the GM can't give away who voted for whom.

## Prototype limits

- Everything is in memory. Restarting the server ends all games.
- No accounts, and rooms are never cleaned up. Fine for a play-test, not for hosting.
- Players can't join after the lobby, but a player who reloads or loses connection can come back (automatically, or with **Rejoin** on the home screen).
- If the host disconnects, the next connected player becomes host.
