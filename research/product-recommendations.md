# Product Recommendations from Research

**Sources**

- `opportunity-solution-tree.md`: opportunity numbers (Opp 1–19) and North Star tags **[ENG] [PERS] [CONT]**
- `interview-opportunities.md`: needs, pains and desires. P1 = `interview-transcript.md`, P2 = `Transcript_1.md`
- `Product_Brainstorming.pdf`: Principles, "Human always control", Strategy
- The current prototype (`README.md`, `CHANGES.md`, code at commit `8523829`)

**How to read this**

- Each recommendation says what the research says, what the prototype does today, and what to change, with the files involved.
- Quotes are copied from the synthesis docs with their line tags, e.g. (P2 L35).
- Priority: **Now** = small changes that close a gap with our own Principles. **Next** = bigger features with strong evidence. **Later / validate** = weak evidence or in tension with the strategy.

---

## What the prototype already gets right

Keep these. They map directly onto evidence, so they shouldn't be lost in future changes.

| Opportunity | Evidence | Already in the prototype |
|---|---|---|
| Opp 4: low game skill | "Yes, but I played very badly." (P1 L45), "It just feels like you can never win." (P2 L71) | Choice- and vote-based play only. No reflex or aiming mechanics. |
| Opp 5: watching instead of playing | "you watching people play" (P1 L45) | Every player gets their own private decision in each `secret` chapter. |
| Opp 2: learning how friends handle situations | "learn about, like, people's approaches to how they go about like, you know different situations" (P1 L57) | One-at-a-time reveal with an optional "why" for each choice. |
| Opp 6: learning together as equals | "the experience is fun, only because we were both new in the game" (P1 L57) | A fresh world every game. Nobody has an experience advantage. |
| Opp 7: activities that fit the group | "if I'm going to an event and I don't really care about it" (P1 L41) | The group votes on the world. |
| Opp 9: badly organized experiences | "if the event or the place that we're in is badly organized" (P1 L41) | Room code, host-paced flow, the GM handles setup and recap. |
| Opp 17: motion discomfort | "the camera, like, moves around a lot" (P1 L61) | Card- and text-based UI with almost no motion. |

---

## Now: close gaps with our own Principles

### 1. Add "skip" and "pass" everywhere a player is asked something
**Opp 10, 14 · [ENG] [PERS]**

- **Research:** People come to hangouts drained. "I was kind of like drained" (P1 L37). Sometimes they just want to decompress: "I don't want to talk. I [want to use] my phone." (P2 L55). The brief's Principles say "Users should be able to decline, skip, or change content they don't want to participate in."
- **Today:** There is no skip option anywhere. The only way past a player who won't answer is the host's force-reveal, which makes the moment awkward.
- **Change:**
  - Add a **"Pass"** button on every quiz question and every secret decision. A pass is revealed neutrally ("Sam kept their cards close"), never as a failure.
  - Let players hide their "why" from the reveal, or remove it before the host gets to their card.
  - Let a player **skip being the subject** of a "who would…" vote (opt out of being voted on).
- **Files:** `server/rooms.js` (`answer`, `quizAnswer`, `everyoneAnswered`), `server/results.js`, `public/app.js` (`renderAnswering`, quiz screen), `server/gm/mock.js` and the `## secret` section of `task-instructions.md` (tell the GM how a pass carries into the next chapter).

### 2. Let players accept, swap or edit their role
**Opp 18 · [PERS]**

- **Research:** This is an assumption, but it comes straight from the brief: "the AI doesn't define who a person is for the player". The Summary's "Don't" list includes "Let the AI define characters or relationships for players".
- **Today:** The casting quiz assigns each player a trait by group vote, the GM writes a role on top of it, and the player has no say.
- **Change:** On the roles screen, add **"Keep it" / "Give me my second-most-voted trait"** and allow a short edit of the role's one-line description before anyone else sees it. This is cheap to build and makes the "Human always control" promise visible from the first minute.
- **Files:** `server/rooms.js` (`assignTraits`, `finishQuiz`, new `acceptRole` event), `server/index.js`, `public/app.js`.

### 3. Promise "no losing" in the GM prompt
**Opp 4 · [ENG]**

- **Research:** "It just feels like you can never win." (P2 L71) was the reason P2 quit Temple Run. P1 quits first-person games: "I just end up, like, quitting the game" (P1 L61).
- **Today:** `gm-system.md` allows "mild peril", but never says that no player is ever eliminated or that every path leads to a satisfying ending.
- **Change:** Add a rule to `server/prompts/gm-system.md`: *no player character dies, is eliminated or sits out; bad choices produce funny complications, not failure; the epilogue always lands for everyone.* Check the mock consequences in `config/mock/*.json` against the same rule.

### 4. Make awards playful, not rankings
**Opp 3 · [ENG]**

- **Research:** P1 likes competition only "in a control bin market" (probably "controlled environment") (P1 L57), where "even you are competitive, it's not. seen as aggressive" (P1 L57).
- **Today:** The recap includes count-based awards like **Most Voted** and **Lone Wolf** ("went against the group 3 times"). Out of context, these can read as scoring friends against each other.
- **Change:** Keep the stats but give them yearbook-style names and lead with the GM's funny `titles`, which already exist. For example, "Most Voted" becomes "The Group's Usual Suspect". Never show a leaderboard or a "last place".
- **Files:** `server/recap.js`, recap screen in `public/app.js`.

### 5. Frame the product as something to do together, not "a game"
**Opp 4 and the "Gaps to validate" note · [ENG]**

- **Research:** "Games? No" (P2 L59), "I'm not really a gamer." (P2 L63). The opportunity tree concludes this "supports framing the product as a social activity rather than 'a game'".
- **Today:** The home screen says "A party game for friends…".
- **Change:** Rewrite the tagline around the outcome, e.g. *"Something to do together when the conversation runs out. Your group, in another world, making choices you'll argue about later."* Use "episode" instead of "game" in the UI wherever it reads naturally.
- **Files:** `public/app.js` (home screen, around line 88).

---

## Next: features with strong evidence

### 6. "Phones down" discussion prompt after each reveal
**Opp 1, 15 · [ENG]**

- **Research:** This is the pain both participants named. "Eventually, we kind of got tired of talking and kind of ran out things to talk. So we individually just started going on our phones." (P2 L35). P1 mentions "cottage for the weekend" lulls (P1 L41).
- **Today:** The reveal shows choices and emoji reactions. The conversation that should follow happens only if the group starts it.
- **Change:** After the last card of each chapter, show a full-screen **talking point** written by the GM from that chapter's real choices, e.g. *"3 of you let the captain drown. Sam, you didn't. Why?"*. Ask everyone to look up from their phones, and leave the host's "Next" button hidden for a few seconds. This turns the reveal into conversation, which is the North Star.
- **Files:** add a `talkingPoint` field to the `secret` output (`server/gm/validate.js`, `server/gm/live.js` schema, `task-instructions.md`), mock pools, `public/app.js` reveal screen.

### 7. Episode length: "Quick round" vs "Full episode"
**Opp 8, 10 · [ENG]**

- **Research:** "if the person was tired, like energy levels, if everyone' kind of tired" (P1 L41). The brief also calls for a short (~15 min) episode anyone can start during a lull.
- **Today:** The length is fixed at 3 chapters in `config/round-plan.json`, and only someone editing that file can change it.
- **Change:** Add a lobby choice: **Quick (1 chapter, ~5 min)** or **Full (3 chapters, ~15 min)**. Also let the host **"Wrap it up"** at any reveal to jump to the recap.
- **Files:** `config/round-plan.json` (named plans), `server/rooms.js` (`start`, `nextRound`, `finish`), lobby in `public/app.js`.

### 8. Shareable recap card for the group chat
**Opp 11, 13 · [PERS] [CONT]**

- **Research:** Humor is how these groups bond. "Just making jokes, honestly." (P2 L31), "we do send memes" (P2 L59). Texting counts as real contact (P2 L107), while passively forwarding content does not (P2 L115). A recap with the group's own moments is personal, not a forwarded video.
- **Today:** The recap exists only on screen and disappears when the server restarts.
- **Change:** Add a **"Share to group chat"** button that renders a meme-style image or text card (world, each player's title, the top memory) using the Web Share API, with copy to clipboard as a fallback.
- **Files:** recap screen in `public/app.js`, `public/style.css`. No server change is needed.

### 9. Remember the group between sessions ("seasons")
**Opp 12, 7, 16 · [CONT] [PERS]**

- **Research:** Closeness comes from repetition: "more experiences over time" (P1 L69), "having, like, more positive memories or positive association with them" (P1 L69), "almost like this unspoken, like, "I'll see you next Friday."" (P2 L75). P1 picks activities based on "our history" (P1 L29).
- **Today:** Everything is in memory. Each game starts from zero, and "Play again" forgets the last game's callbacks.
- **Change (smallest version first):**
  1. At the end of a game, save a **"season file"** on the host's device (localStorage, plus an export code) containing the world, titles, memories and a few key choices. There are no accounts, which fits the prototype.
  2. When the host loads a season, the GM gets it as context and opens with a callback: *"Last time, Sam sold the group out for a hot shower…"*.
  3. End a Full episode on a **cliffhanger** line that the next session picks up.
  4. In the world vote, mark the world the group picked last time, and suggest a new one based on what got the most reactions.
- **Files:** `server/rooms.js` (`gmContext`, `playAgain`), `server/prompts/task-instructions.md` (setup and recap sections), `public/app.js`.

### 10. Themed content for every world, and a custom world option
**Opp 7 · [PERS]**

- **Research:** People have different interests, and an activity that doesn't fit theirs is boring (P1 L29, L41).
- **Today:** Only `zombie` and `generic` have written secret chapters in mock mode, so Office, Reality TV, Fantasy and High School feel generic in play-tests. This is listed as a known gap in `CHANGES.md`.
- **Change:** Write three secret chapters each for the other four worlds. In live mode, let the group **type their own world** ("our office's holiday party", "the group trip to Lisbon") as an extra option in the world vote.
- **Files:** `config/mock/*.json`, `config/worlds.json`, world vote in `public/app.js` and `server/rooms.js`.

### 11. Bring back one light competitive beat
**Opp 3, 2 · [ENG] [PERS]**

- **Research:** P1 wants friendly competition and likes learning "people's approaches" (P1 L57).
- **Today:** `predict` rounds, including the "Mind Reader" award, still exist in the code, but the default plan now has only `secret` chapters.
- **Change:** Add one `predict` round between chapters 2 and 3 of the Full plan: "How well do you know Sam?". It is competitive in a low-stakes way and teaches the group something about the person in the spotlight.
- **Files:** `config/round-plan.json` only.

---

## Later / validate first

### 12. Hosted version: one link, no shared Wi-Fi
**Opp 9, P1 Need 5 · [ENG]**

- "It's very spontaneous hang up like, oh, I'm in the area." (P1 L17). Today a laptop has to run the server, and every phone has to be on the same Wi-Fi network. The README warns that university Wi-Fi often blocks this. For spontaneous hangouts, that setup is the biggest source of friction.
- This needs room cleanup, rate limits and the API key kept on the server (see "Prototype limits" in the README). Worth doing before any play-test outside our own laptops.

### 13. Async "one decision a day" between sessions
**Opp 13 · [CONT]**

- P2 says friendships fade without contact (P2 L83), and daily updates matter (P2 L23).
- **Tension:** P2 also says that seeing each other "especially in person, kind of reconnects that bond" (P2 L79), and the North Star is about *in-person* relationships. An async mode could replace hangouts instead of feeding them. Validate before building. The shareable recap (#8) and seasons (#9) cover part of this need without that risk.

### 14. Icebreaker for new groups
**Opp 19**

- Based on a single example (P1's Go date), and it falls outside "Where to play: existing friend groups". Park it.

---

## What to test in the next play-tests

The weakest links in the evidence are the places where the product makes its biggest promises. Use the next sessions to check them:

1. **Can a 15-minute session produce "I learned something about my friend"?** All the strong personalization quotes come from week-long trips or dates (P2 L51, P1 L57). After each test, ask: *"Did anyone's choice surprise you? Whose?"*
2. **Do people talk after the reveal, or tap "Next"?** Time how long the group talks before the host moves on, with and without the talking-point screen (#6).
3. **Does anyone use Pass?** If nobody does, the content is probably comfortable. If many do, the dilemmas are too personal.
4. **Do awards and the casting quiz feel fun or judgmental?** Watch the moment the roles appear.
5. **Would they open it again next week?** Ask directly, and ask what would make them. This tests the continuity bet (#9).

## Summary

| # | Change | Opportunities | Priority | Effort |
|---|---|---|---|---|
| 1 | Skip / pass / hide your reason | 10, 14 | Now | S |
| 2 | Accept, swap or edit your role | 18 | Now | S |
| 3 | "No losing" rule in the GM prompt | 4 | Now | XS |
| 4 | Playful awards, no rankings | 3 | Now | XS |
| 5 | Social-activity framing on the home screen | 4 | Now | XS |
| 6 | "Phones down" talking point after reveals | 1, 15 | Next | M |
| 7 | Quick vs Full episode, "Wrap it up" | 8, 10 | Next | S |
| 8 | Shareable recap card | 11, 13 | Next | S |
| 9 | Seasons: remember the group, cliffhangers | 12, 7, 16 | Next | M–L |
| 10 | Themed mock chapters for every world + custom world | 7 | Next | M |
| 11 | One `predict` round in the Full plan | 3, 2 | Next | XS |
| 12 | Hosted version (no shared Wi-Fi) | 9 | Later | L |
| 13 | Async decision between sessions | 13 | Validate | M |
| 14 | Icebreaker for new groups | 19 | Park | n/a |
