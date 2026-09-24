# Change notes

## Secret chapters, casting quiz, host reconnect (branch `feature/secret-chapters`)

Branched from `claude/lucid-heisenberg-cgg0ll`. That branch is unchanged, so this can be compared or merged when the group agrees.

### Why

The earlier rounds were mostly group votes about each other. This branch moves the game closer to the core idea: after roles are assigned, **each player gets different information and a different decision based on their role**, decides alone, and then the group sees everyone's decisions and asks "why did you do that?". Those choices affect the next part of the story. The AI stays a Game Master: it sets up situations and connects earlier decisions to later events, but the important choices come from the players.

### What changed

**1. Casting quiz before roles** (new `quiz` phase)
- After the world is locked in, everyone votes on 6 questions like "Who has the strongest execution?" or "Who is the most unpredictable?". Self-votes are allowed.
- Each player gets a different trait, and the most-voted matches are assigned first. Their role is then built on that trait. The roles screen shows why, e.g. "The group says: Gets things done (2 of 3 votes)".
- Questions and traits: `config/quiz.json`. Mock roles now have a `trait` field, and live mode passes the quiz results to the GM.

**2. New round type: `secret`** (now the default: 3 chapters in `config/round-plan.json`)
- Everyone shares one scene, but each player privately sees their own secret and decision. For example, one knows food is running out, one knows a dangerous route, and one decides who gets the last medicine.
- A decision is either 2–3 options, each with its own consequence, or "pick a player".
- Players can add an optional short "why". It is shown to everyone at the reveal.
- **Reveal one player at a time.** The host taps through each player. Each card shows their secret, choice, reason and consequence, and everyone can react with emoji.
- The next chapter opens with "Because of your last choices" (the consequences). In live mode the GM gets who knew what, chose what, why and what happened, and is told to grow the next scene out of those outcomes.
- The old types (`choice`, `vote_player`, `predict`) still work and can be mixed back in via `round-plan.json`.

**3. Host keeps the crown after a reload**
- Before: if the host reloaded or their phone slept, host moved to the next player immediately and never came back.
- Now the host has a 30-second grace period (`HOST_GRACE_MS` env var). If they return in time they're still host. If not, the next connected player takes over as before. Other players see "(host) dropped out, waiting for them to come back…" meanwhile.

**4. Recap**
- Adds memories like "Ben was secretly told: … They chose …, because …".
- Key moments list each chapter's consequences one per line.

### Files

| Area | Files |
|---|---|
| Game logic | `server/rooms.js` (quiz phase, trait assignment, one-by-one reveal, host grace period), `server/results.js`, `server/recap.js`, `server/index.js` (new socket events: `quizAnswer`, `forceQuiz`, `revealNext`) |
| Game Master | `server/gm/mock.js`, `server/gm/validate.js`, `server/gm/live.js` (new `secret` schema, quiz facts in every prompt) |
| Prompts | `server/prompts/gm-system.md`, `server/prompts/task-instructions.md` (new `## secret` section; setup now builds roles on quiz traits) |
| Config / content | `config/quiz.json` (new), `config/round-plan.json`, `config/mock/*.json` (role traits; 3 secret chapters each for `zombie` and `generic`) |
| Client | `public/app.js` (quiz, private brief, reveal screens; typed text survives re-renders), `public/style.css` |
| Tests / docs | `scripts/simulate.js` (bots now do the quiz and the step-by-step reveal), `README.md` |

### How to test

```bash
npm install
npm run simulate          # 4 bots, full game in mock mode
node scripts/simulate.js 3
node scripts/simulate.js 6
```

All three pass. To play by hand, run `npm start` and open several tabs at http://localhost:3000.

### Known gaps

- **Live mode hasn't been run against the real API yet.** The new schema loads and the validator accepts live-shaped output, but the writing quality of AI-generated secret chapters still needs a play-test with a key.
- **Mock content:** only `zombie` and `generic` have written secret chapters. Office, Reality TV, Fantasy and High School use the generic chapters in mock mode, so they're less themed. Live mode isn't affected.
