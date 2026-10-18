# Last Light · Alternate Universe

A playable, real-time mystery for **4–6 friends**, one shared screen, and private phones. Six rounds, approximately 35–45 minutes. Players use their own names. No acting, elimination, mandatory personal disclosure, or AI service is required.

## Run

Requires Node.js 18 or newer.

```sh
npm ci
npm start
```

Open `http://localhost:3000` on the computer. The server also prints the local Wi-Fi address for phones. Connect all devices to the same network; campus Wi-Fi may isolate devices. `PORT=3017 npm start` selects another port.

1. Create a room on the host’s **phone**. Everyone else enters the room code and their own name.
2. Open **Open the shared screen** on the computer/projector. This is a separate public view, not a mirror of the host’s private phone.
3. Start when 4–6 players have joined. The host controls pacing from their phone without access to other players’ objectives or clues.
4. Use the four phone tabs: **Now**, **My clues**, **Notebook**, and **My objective**.
5. Keep the private recovery credential if you might need to move to another browser. Reloading the same tab automatically reconnects. Do not share recovery credentials: they grant access to that player’s private view.

The shared-screen URL is `/?screen=ABCD`; the join link is `/?room=ABCD`. A room code grants public-screen access and lobby joining, but never access to existing players’ private views. New players cannot join after the game starts.

## Rules implemented

- Uniformly random murderer; everyone else investigates. Only the murderer receives the fictional motive. Names have no effect on assignment.
- Six rounds: envelope decision → blackout → discovery → investigation → archive decision → final accusation.
- Two private group decisions, each offering No preference. A wins only if A has more votes than B; otherwise B wins. Individual choices remain private after the aggregate reveal.
- Secret room and weapon selection in Round 2; the solution locks when that round ends. Three rooms × three weapons generate nine consistent case combinations.
- Exactly three server-generated dice events in Rounds 1, 3, and 5, rotating through seats 1, 2, and 3. No rerolls; low rolls never block the case.
- Asymmetric evidence, complementary door-log/register and trace/inventory pairs, voluntary permanent publication, and a persistent People/Rooms/Objects/Timeline board.
- Private verification copies in Rounds 4 and 5. The register unlocks in Round 5. Both archive routes keep evidence accessible. The envelope choice adds a public door log or an extra private verification.
- Optional local-only notebooks. Text is never transmitted to the server and never used in the recap.
- Rotating 20-second speaking turns in Rounds 1, 3, and 5, with automatic timeout and Done / Pass. Suggested discussion and ballot timers leave pacing under host control.
- One optional suggested statement per player in Round 4, explicitly labelled unverified and separated from official evidence.
- Independent, revisable final ballots with Not enough evidence for each field. Results remain hidden until the host closes voting. A strict majority of innocent guests must identify all three parts correctly; the murderer’s ballot is excluded.
- Solution and complete evidence-chain reveal, all final ballots, and an event-based 45–56-second recap with Pause, Skip, Read again, and a static transcript.

The user’s requested feature numbering skips 15; every supplied feature is represented above without inventing a missing requirement.

The host can advance if somebody is absent. Missing actions default to No preference, Observe, a missing verification card, or Not enough evidence. Missing murderer selections are random. The host can roll for an absent designated roller. Speaking prompts can always be passed.

## Manuscript and design status

The implementation follows `design/03-last-light-party-game.md` (version 2.0). `design/03-last-light-player-guide.md` is the spoiler-free player guide. The manuscript’s “not implemented” wording describes its original publication status; this branch adds the digital implementation.

**Figma visual matching is pending.** The supplied design is [Alternative Universe, node 2:5](https://www.figma.com/design/B2zj8NNZnGIC4sfuUkCJyz/Alternative-Universe?node-id=2-5). Both design-context and screenshot requests returned an edit-access error from the Figma connector, including retries after access was requested. This branch extends the repository’s existing visual tokens and components; it does not claim to reproduce the inaccessible Figma design. No Figma assets have been substituted or embedded as screenshots.

## Verification

```sh
npm test
# With the server running in another terminal:
npm run simulate
node scripts/simulate.js 5
node scripts/simulate.js 6
# Alternate port:
TEST_URL=http://localhost:3017 node scripts/simulate.js 4
```

Rule tests cover all nine solutions, 4–6 players, private-state filtering, ties/abstentions, duplicate phase requests, invalid permissions, speaking timeouts, clue copies, archive branches, and scoring. Socket simulations complete full games through real connections, check the public-screen boundary, share clues, submit ballots, and verify recovery credentials and reconnects.

Human playtesting is still needed to validate session length, discussion quality, and balance. The evidence structure is fixed, so replaying changes the solution but not the underlying puzzle.

## Code map

- `server/last-light.js`: deterministic narrative templates, secure random selection, state transitions, evidence, scoring, recap, and separate public/private views.
- `server/index.js`: HTTP/Socket.IO transport, recovery authentication, public spectators, rate limits, timed turns, and host handover after 30 seconds disconnected.
- `public/app.js`: phone and shared-screen interfaces, private local notebook, and recap controls.
- `public/style.css`: existing visual tokens plus responsive game layouts.
- `test/last-light.test.js`: rules and privacy tests.
- `scripts/simulate.js`: real multiplayer smoke test.

The earlier AI prototype’s modules in `server/gm`, `server/rooms.js`, `server/results.js`, `server/recap.js`, `server/prompts`, and `config` are retained for project history but are not imported by the new application. No API key is used, even if an old `.env` sets `GM_MODE=live`.

## Hosting and storage limits

Game rooms live in memory. Restarting the server ends active games; disconnected rooms expire after 24 hours. Notebooks stay in the same browser’s local storage, keyed by game and player. Use one Node process; there is no cross-instance room store. For deployment beyond a trusted local playtest, provide HTTPS through a reverse proxy and a durable room store if restart recovery is needed. The shared screen is accessible to anyone who knows its room code.
