# Last Light · Alternate Universe

A playable, real-time mystery for **4–6 friends**, one shared screen, and private phones. Six rounds, approximately 35–45 minutes. Players keep their chosen names and receive a lightweight fictional identity, relationship with Alex, and motive. No acting performance, elimination, mandatory personal disclosure, or AI service is required.

## Run

Requires Node.js 18 or newer.

```sh
npm ci
npm start
```

Open `http://localhost:3000` on the computer. The server also prints the local Wi-Fi address for phones. Connect all devices to the same network; campus Wi-Fi may isolate devices. `PORT=3017 npm start` selects another port.

1. Create a room on the host’s **phone**. Everyone else enters the room code and their own name.
2. Open **Open the shared screen** on the computer/projector. This is a separate public view, not a mirror of the host’s private phone.
3. Start when 4–6 players have joined. The host controls pacing through a visible next-step panel on their phone, without access to other players’ private secrets, objectives, or clues.
4. Use the four phone tabs: **Now**, **My clues**, **Notebook**, and **My objective**.
5. Keep the private recovery credential if you might need to move to another browser. Reloading the same tab automatically reconnects. Do not share recovery credentials: they grant access to that player’s private view.

The shared-screen URL is `/?screen=ABCD`; the join link is `/?room=ABCD`. A room code grants public-screen access and lobby joining, but never access to existing players’ private views. New players cannot join after the game starts.

## Rules implemented

- Uniformly random murderer, independently shuffled identities, and a distinct motive for every guest. Secrets emerge through other players’ clue cards and the archive. Names and roles have no effect on murderer assignment.
- Six rounds: envelope decision → blackout → discovery → investigation → archive decision → final accusation.
- Three private group decisions (envelope, investigation priority, archive), each offering No preference. Voting is available during the 20-second speaking turns. A wins only if A has more votes than B; otherwise B wins. Individual choices remain private after the aggregate reveal.
- Secret room and weapon selection in Round 2; the solution locks when that round ends. Three rooms × three weapons generate nine consistent case combinations.
- Exactly three server-generated dice events in Rounds 1, 3, and 5, rotating through seats 1, 2, and 3. No rerolls; low rolls never block the case. Rolls of 1–2 grant zero extras, 3–5 grant one, and 6 grants two. Before/after panels show the guaranteed evidence, reward titles, recipients, and destinations.
- Asymmetric evidence, complementary door-log/register and trace/inventory pairs, voluntary permanent publication, and a persistent People/Rooms/Objects/Timeline board.
- Private verification copies in Rounds 4 and 5. The register unlocks in Round 5. Both archive routes keep evidence accessible. The envelope choice adds a public door log or an extra private verification.
- Optional local-only notebooks. Text is never transmitted to the server and never used in the recap.
- Rotating 20-second speaking turns in Rounds 1, 3, and 5, with automatic timeout and Done / Pass. Suggested discussion and ballot timers leave pacing under host control.
- One optional suggested statement per player in Round 4, explicitly labelled unverified and separated from official evidence.
- Independent, revisable final ballots with Not enough evidence for each field. Results remain hidden until the host closes voting. A strict majority of innocent guests must identify all three parts correctly; the murderer’s ballot is excluded.
- Solution and complete evidence-chain reveal, all final ballots, and an event-based 45–56-second recap with Pause, Skip, Read again, and a static transcript. The ending explains the murderer’s role-specific motive and everyone else’s stakes.

The user’s requested feature numbering skips 15; every supplied feature is represented above without inventing a missing requirement.

The host can advance if somebody is absent. Missing actions default to No preference, Observe, a missing verification card, or Not enough evidence. Missing murderer selections are random. The host can roll for an absent designated roller. Speaking prompts can always be passed.

## Manuscript and design status

The implementation follows `design/03-last-light-party-game.md` (version 3). `design/03-last-light-player-guide.md` is the spoiler-free player guide. Version 3 supersedes the earlier no-fictional-identity premise. The full narrative and role text live in `server/story.js`.

**Figma visuals integrated.** The interface uses original background fills, wax seal, and six pin SVGs from [Alternative Universe](https://www.figma.com/design/B2zj8NNZnGIC4sfuUkCJyz/Alternative-Universe?node-id=2-5), with the shared pixel-paper components and local Pixelify Sans, Special Elite, Silkscreen, and Kalam fonts. TV title/lobby/map/vote/evidence/ending/blackout frames and phone join/clue/vote frames informed the implementation. The title retains “The Gathering”; the subtitle and room labels follow the Rain House manuscript. Layouts adapt to live evidence and 4–6 guests; sample suspects, fixed vote counts, and invented routes from the mockups are not presented as real game data. Asset provenance is recorded in `public/assets/figma/provenance.json`. Screenshots are not embedded as interfaces.

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

Rule tests cover all nine solutions, 4–6 players, private-state filtering, ties/abstentions, duplicate phase requests, invalid permissions, speaking timeouts, clue copies, archive branches, and scoring, plus role secrecy, concurrent speaking/voting, investigation outcomes, and all six die faces in all three searches. Socket simulations complete full games through real connections, check the public-screen boundary, share clues, submit ballots, and verify recovery credentials and reconnects.

Human playtesting is still needed to validate session length, discussion quality, and balance. The evidence structure is fixed, so replaying changes the solution but not the underlying puzzle.

## Code map

- `server/story.js`: connected six-round prose, six fictional identities, decision prompts, and explicit dice reward previews.
- `server/last-light.js`: deterministic narrative templates, secure random selection, state transitions, evidence, scoring, recap, and separate public/private views.
- `server.js`: Vercel-compatible HTTP server export and HTTP/Socket.IO transport, recovery authentication, public spectators, rate limits, timed turns, and host handover after 30 seconds disconnected.
- `public/app.js`: phone and shared-screen interfaces, private local notebook, and recap controls.
- `public/style.css`: existing visual tokens plus responsive game layouts.
- `test/last-light.test.js`: rules and privacy tests.
- `scripts/simulate.js`: real multiplayer smoke test.

The earlier AI prototype’s modules in `server/gm`, `server/rooms.js`, `server/results.js`, `server/recap.js`, `server/prompts`, and `config` are retained for project history but are not imported by the new application. No API key is used, even if an old `.env` sets `GM_MODE=live`.

## Vercel preview deployment

This is an **Express + Socket.IO** application, not Next.js. The repository's `vercel.json` overrides a previously selected Next.js preset and build command. Do not add `next` to work around “No Next.js version detected.”

Deploy the commit containing this configuration, with the Vercel project's **Root Directory set to the repository root** (leave it blank). `server.js` is the recognized Express entrypoint and exports the HTTP server with its Socket.IO upgrade handler; the existing `npm start` still works through `server/index.js`. Vercel serves `public/` assets automatically. Fluid compute is enabled, and the browser uses WebSocket transport directly instead of a polling handshake.

After pushing the fix, check the **new** preview deployment, rather than redeploying either old failed commit. If the error still mentions Next.js, confirm the deployed commit contains `vercel.json` and the Root Directory is not a subdirectory. This repository cannot override a dashboard Root Directory setting.

**Runtime limit:** this fixes framework detection and the server entrypoint; it does not make the in-memory game store distributed. Separate players, the shared screen, or reconnecting clients can land on different Vercel instances, and WebSockets close at the function duration limit. For reliable full-length multiplayer sessions with the current storage model, run one continuously running Node process behind HTTPS. Supporting Vercel across instances requires shared room storage and cross-instance broadcast/presence coordination; a successful preview build alone does not verify that behavior.

References: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [WebSocket transport and persistent state](https://vercel.com/docs/functions/websockets), [configuration overrides](https://vercel.com/docs/project-configuration/vercel-json).

## Hosting and storage limits

Game rooms live in memory. Restarting the server ends active games; disconnected rooms expire after 24 hours. Notebooks stay in the same browser’s local storage, keyed by game and player. Use one Node process; there is no cross-instance room store. For deployment beyond a trusted local playtest, provide HTTPS through a reverse proxy and a durable room store if restart recovery is needed. The shared screen is accessible to anyone who knows its room code.

### Solo presentation mode

Create a room with only yourself, then choose **Start solo demo · add 3 bots** in the lobby. Three labelled scripted guests fill the table and automatically submit votes, search, verify records, share their clues and make evidence-based accusations. No AI service is used. Your own role remains random, so you can also demonstrate the murderer’s private choices.

Use **You’re hosting · next step** to move through chapters, advance speaking turns, close votes and roll for bots. Dice remain random; all reward bands are explained before rolling. Open the shared-screen link before starting if presenting publicly. Demo labels remain visible, and bot ballots can be incomplete when evidence was withheld. Normal multiplayer still requires 4–6 people.
