# LAST LIGHT
## Version 3 — The people at Alex’s table

4–6 players · Six rounds · Approximately 35–45 minutes · One shared screen and private phones · No elimination · No AI required

This revision supersedes the version 2 “play only as yourself” premise. Players keep their chosen names and speak naturally, but each receives a short fictional identity, a relationship with Alex, a secret, and a plausible motive. Nobody is required to perform an accent, disclose personal experiences, or invent facts that contradict evidence.

The running narrative is authored in `server/story.js`. The rules and evidence are implemented in `server/last-light.js`; these files are the exact text and behavior delivered by the application.

## The story that holds the evening together

Rain House was built by people who believed it would belong to something larger than its owner. Alex Vale has accepted an offer to sell it. Tonight he has invited the people with the strongest claims on its past. He intends to settle their disputes before an audit compares his edited account with the original records.

Each guest has something to lose. Alex has kept the papers that could protect them, expose them, or let him tell the story in their place. His announcement makes the dinner feel like a summons. Then the lights fail for four minutes. When they return, Alex is missing.

The mystery has two linked questions: **why did everyone fear this dinner?** and **which of them actually killed Alex?** Correspondence answers the first. Time, access, guest codes, and physical traces answer the second. A compelling motive is never treated as proof of guilt.

## Identities and motive design

Shuffle six unique roles independently of murderer assignment; use one per player, with unused roles absent from the case. The murderer is uniformly random among the active players. The public screen shows only each role’s title and a short introduction. Each phone alone receives its owner’s relationship, secret, motive, and objective.

- **The co-founder:** helped build Rain House with Alex. Alex removed their ownership claim; the original agreement is in his archive. The sale threatens to erase their life’s work.
- **The fund keeper:** moved restricted funds to emergency repairs at Alex’s urging. He now intends to omit those instructions and call the transfer theft. Their reputation depends on the originals.
- **The restorer:** signed unfinished work as complete after Alex threatened to replace them. Alex intends to deny the pressure; their career is at risk.
- **The programme organiser:** promised another year of support while trying to prevent closure. Alex means to read those promises aloud and assign them the blame for the programme’s end.
- **The archivist:** redacted private donor stories to honor confidentiality. Alex demands the names back for the sale presentation and threatens to expose the intervention.
- **The former protégé:** wants credit for work Alex claimed. He threatens to send a selective account of their dispute to a prospective employer.

Each role has a role-specific ending explanation if that player becomes the murderer. No guest receives a predetermined alibi or power. All guests could access the timer and the three weapons. The fictional role does not change anyone’s odds, actions, or evidence rights.

### How secrets emerge

1. Before the first vote, each player can read their identity under **My objective**. The **people at Alex’s table** panel introduces the public cast.
2. Round 1 search rewards may reveal Alex’s meeting note and the signed sale offer, showing the announcement was not a consultation.
3. In Round 3, every player receives one paper trail about a *different* active guest. It describes a documented dispute. They choose whether to publish it.
4. In Round 5, relevant dispute records for all active guests and the original meeting context become public in both archive routes. The privacy choice concerns unrelated personal letters, not suppression of the case’s motives.
5. The ending connects the actual murderer’s motive to the locked forensic chain and recaps the other guests’ stakes without calling them guilty.

## The six rounds

### 1. The envelope at your place

Rain, an uncomfortable invitation, Alex’s sale announcement, and an envelope left beside his glass establish the story. A relevant receipt is caught inside a personal letter from Morgan, a fictional non-attendee.

**Shared decision:** read the whole envelope (A) or take only the receipt (B). No preference is available. A wins only with strictly more votes than B; ties choose B.

**Speaking purpose:** argue for what should be revealed or protected. Players can vote privately *during* the rotating 20-second turns and revise until the host closes voting after everyone’s turn. Passing is always allowed.

Both routes publish the audit receipt. A also publishes Morgan’s letter and creates a public door-log copy in Round 4. B preserves the letter and gives seat 1 an additional private verification in Round 4.

**Shared search 1:** seat 1 searches the envelope’s inner pocket. Preview the exact roll bands before rolling; show the actual rewards afterwards.

- **1–2:** interruption; zero additional clues. For A, Alex returns as the letter is read. For B, a glass tips and the roller is seen holding the envelope. Neither proves guilt. The receipt stays available.
- **3–5:** one private clue, Alex’s meeting note (B1), in the roller’s My clues.
- **6:** B1 plus the signed sale offer (B2): two private clues.

Discuss the result, then continue. No moral points are awarded for either route.

### 2. A house holding its breath

The narration acknowledges whether the group read the letter. Alex leaves again. At 10:00 the lights fail; a chair scrapes, footsteps cross the corridor, and a door shuts. At 10:04 the lights return to Alex’s empty chair.

Everyone privately chooses a room to search after the lights return, or Observe. On the same screen, the murderer chooses the crime room and weapon. Room choices are Study, Library, and Billiard Room; weapons are brass candlestick, letter opener, and curtain cord. The host sees only one completion count per player.

When the host resolves the round, the solution locks. Missing search actions become Observe. Missing murderer choices are random and shown privately to the murderer. Searches after 10:04 are not alibis for the murder interval.

### 3. Something worth searching for

Everyone who searched the crime room receives discovery credit. If nobody did, a watch alert directs everyone there. K1 is published. Four shuffled players receive K2, K3, K5, and K6 respectively; a fifth receives the battery-power fact and a sixth the no-visitor fact. Every player also receives a paper trail about another guest.

**Shared decision:** reconstruct the missing minutes (A) or compare the physical traces (B).

**Speaking purpose:** use an actual clue to advocate for the investigation the group should do next. The vote is open during every speaking turn. A publishes K2; B publishes K6. Both routes preserve all other records and later individual verification access.

**Shared search 2:** seat 2 searches the selected evidence source.

- **1–2:** no additional copy. Original private clues and the guaranteed public record remain available.
- **3–5:** one private core clue the roller does not already hold.
- **6:** two distinct private core clues the roller does not already hold.

A prioritizes K3, K2, K5, K6; B prioritizes K5, K6, K3, K2. Skip already-held cards. K4 never appears as a reward here. Results list each awarded title, recipient, and the My clues destination. The group then discusses what the search changed.

### 4. What the papers leave out

The narration follows the group’s search choice: a guest number without a name, or a trace needing an inventory. The correspondence explains why everyone feared Alex; it does not place any guest in the room.

Each player privately requests one copy: K2 timing, K3 door log, K5 scene traces, or K6 inventory. Passing grants a missing card. There is no global quota: multiple players may request the same record. K4 is explicitly labelled available next round.

Apply the envelope consequence: A publishes K3; B offers seat 1 one additional private choice. If the host advances without that choice, give a missing available card.

Free discussion is about which record supports or weakens a theory. There is no disconnected mandatory speaking round. Each player may publish one suggested unverified statement about a room, object, or accusation; it remains separate from official evidence.

### 5. The price of opening everything

The archive reveals the original meeting context: Alex arranged the sale before consulting the people who built the house and intended to control whose account survived. Relevant motive records for every active guest are published in both routes. Unrelated personal letters remain subject to the group’s decision.

**Shared decision:** open the entire archive (A), or request only needed records (B).

**Speaking purpose:** identify the records a theory needs and argue how broadly to expose the archive. Vote while listening; revise until the host closes voting after the turns.

A publishes K3, K4, and the personal correspondence. B leaves personal correspondence closed. In **both** routes, everyone requests one private case record from K2–K6. Passing grants K4 if missing, otherwise another missing card. No player can monopolize the register.

**Shared search 3:** seat 3 searches the false bottom after everyone’s requested verification is saved.

- **1–2:** an unsupported allegation, zero extra clues. No existing record is removed.
- **3–5:** publish an additional card-custody slip (B5), corroborating K4’s custody rule.
- **6:** publish B5 and Alex’s unsent letter (B6), explaining how he shifted responsibility onto the others. These are two explicit extra records, not a change to the solution.

Discuss the last connections. Access to core case evidence never depends on a high roll.

### 6. Before the rain lets up

The narration recalls whether the archive was opened or the letters protected. Everyone now knows why each guest feared the announcement. The question is which account fits the records.

Allow final free discussion, then the host opens private accusations. Every player chooses murderer, weapon, and room; each field offers Not enough evidence. Ballots can be revised until the host closes them. Never reveal partial results.

A strict majority of innocent guests must identify all three parts correctly: two guests in a four-player game, three in a five- or six-player game. The murderer submits to preserve secrecy but is excluded from the threshold. Missing ballots are Not enough evidence.

## Fixed case and evidence

At setup, secretly assign unique codes from 17, 24, 38, 46, 59, and 63. Nobody receives their code until the register becomes available. The murderer schedules a four-minute blackout using a timer everyone could access and draws Alex to the chosen room using a role-specific pretext. Alex enters first; the murderer enters at 10:01:50 and leaves at 10:03:10. Death occurs between 10:02 and 10:03.

There is no accomplice, second entrance, remote mechanism, moved body, or exchanged guest card. These are fixed facts, never changed by the die, a role, or a spoken claim.

- **K1 — Discovery:** identifies the chosen room; the body was not moved.
- **K2 — Time and access:** establishes the interval, secured windows, and lack of alternative access or remote mechanism.
- **K3 — Door log:** gives the sole guest code entering and leaving during the interval; it does not name its owner.
- **K4 — Register:** maps every active guest to a unique code and confirms no card transfers. Available in Round 5.
- **K5 — Traces:** matches the selected weapon: chipped circular base and green wax; nicked narrow blade and decorative brass; or double-braided cord with blue fibers and resin.
- **K6 — Inventory:** describes all three objects so the trace can be matched. Previous handling proves nothing by itself.

Deduction: **K1 → room; K2 + K3 + K4 → murderer; K5 + K6 → weapon.** Motive correspondence supplies meaning and suspicion, never a substitute for this chain.

## Ending and recap

Reveal the locked solution, the murderer’s role-specific explanation, every guest’s motive, all ballots, and all six core cards. Explain the guest-majority outcome. The game never judges real honesty or intelligence.

A seven-line authored recap takes 56 seconds and references actual envelope, search-priority, discovery, sharing, archive, and result events. Offer Pause, Skip, Read again, and a static transcript. Never read private notes, infer feelings, or invent dialogue.

## Interface and implementation requirements

- UI and visual assets must come from the user’s original Figma file: `B2zj8NNZnGIC4sfuUkCJyz`, node `2:5`. Original exported artwork is now bundled locally. The interface follows the TV and phone paper components, fonts, ink borders, tape, wax seal, pins, and manor backgrounds. Live story text, evidence counts, seven manuscript rooms, and voting results replace mockup content.
- Phones retain Now, My clues, Notebook, and My objective. Notes stay local and private.
- The shared screen receives public roles, narrative, aggregate progress, speaking prompts, dice previews/outcomes, and published evidence. It never receives private identities’ secrets, hidden clues, murderer choices, or individual live votes.
- Every speaking stage contains its decision question, both options and their consequences, a private vote control, and Done / Pass for the current speaker. Turn completion does not submit a vote.
- Every search shows guaranteed evidence, 1–2/3–5/6 rewards, designated roller, actual count of extras, titles, recipients, and destination. Low rolls explicitly say zero extras and explain that baseline evidence remains.
- Host advancement is visible as **You’re hosting · next step**, not hidden inside a collapsed controls panel. The host still deliberately closes votes and ballots.
- Recovery uses a private token. Dice and phase resolution are server-authoritative. Repeated requests cannot reroll or duplicate rewards.

## Validation

Automated tests cover role uniqueness and private boundaries, all nine room/weapon solutions, all three concurrent discussion/vote stages, both investigation priorities, all six die faces at each search, immutable rewards, clue copies, archive routes, and scoring. Real socket simulations exercise 4–6 phones plus a public screen.

Human playtesting is still required for pacing, role balance, the salience of motives, and whether the new narrative gives players enough reason to discuss the decisions.

Before the first speaking turn, an untimed invitation briefing lets every player read their identity and mark Ready. The host then begins discussion; readiness is cleared and never counts as a vote.
