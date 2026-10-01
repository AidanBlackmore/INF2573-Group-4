# Task instructions

Each `## section` below is sent to the Game Master for one kind of request.
The section name must match the task or round type used in the code
(setup, choice, vote_player, predict, secret, recap). Edit the wording freely;
the facts of the game (players, roles, history) are added automatically.

## setup

Cast the group into this world.

- `intro`: 1–2 sentences setting the scene for everyone.
- `roles`: exactly one role per player (use their id in `playerId`). A `title` (a few words, funny, specific to this world) and a one-sentence `blurb`. Each role must be built on the trait the group voted that player in the casting quiz (listed in the facts): whoever the group called "gets things done" becomes the one in charge of doing things, and so on. The fun is the group recognising their own votes in the cast. Roles should give people something to tease each other about, not lore.
- `relationships`: one relationship per player, each connecting two *different* players (ids in `from` and `to`, names in `text`). Make them things the group can argue about during the game: debts, grudges, suspicions, secret alliances, petty rivalries. One sentence each. Try to involve every player at least once.

## choice

Write an **individual choice** round: every player picks what *they* would do.

- `scene`: up to 3 short sentences. A dilemma in this world that puts the group under pressure.
- `prompt`: one short question, e.g. "What do you do?"
- `options`: 3–4 short options. Great options make people reveal something about themselves and then defend it out loud. It's fine for an option to name another player ("Send Sam to check first").
- `callback`: if the scene references an earlier moment, say which one in a few words; otherwise "".

## vote_player

Write a **group vote about a player**: everyone votes for which player in the group best fits the prompt. The app automatically makes every player an option, so leave `options` as an empty list.

- `scene`: up to 3 short sentences setting up the question.
- `prompt`: a "Who would…" / "Who is most likely to…" question about the players themselves, e.g. "Who would betray the others for the last can of food?". Teasing but friendly. It should make people look at each other and laugh.
- Use the history. If the group already voted someone "most likely to betray", a later vote can escalate or flip it.
- `callback`: as above.

## predict

Write a **prediction round** about the TARGET player named below. The target answers honestly for themselves; everyone else tries to guess what the target will pick.

- `scene`: up to 3 short sentences putting the target in a situation. Use their name.
- `prompt`: one short question, e.g. "What does Sam do?"
- `options`: 3–4 short options that are all believable for this person, so guessing is genuinely hard and the answer says something about them. Use their role, relationships and earlier answers.
- `callback`: as above.

## secret

Write a **secret-information chapter**. Everyone shares one scene, but each player privately gets a different piece of information and a different decision that only they can make, based on their role. Nobody sees anyone else's brief until the reveal, where each player's secret, choice and reason are shown to the group one by one.

- `title`: a short chapter name (2–5 words).
- `scene`: up to 3 short sentences everyone sees. A shared situation that puts the group under pressure.
- `briefs`: exactly one per player (id in `playerId`). Make them fit together: one player might know food is running out, another knows a dangerous route to more supplies, another must decide who gets the last medicine. Several briefs should affect or involve other players, so the reveal sparks "wait, you knew that?!" and "why would you pick me?".
  - `secret`: 1–2 sentences only this player knows. Fit it to their role.
  - `prompt`: the decision they must make alone, one short question.
  - Either set `pickPlayer: true` when the decision is choosing a person in the group ("Who gets the last medicine?"), leave `options` empty, and write `outcome` with the placeholder `{choice}` for the chosen player's name. Use this for about one or two briefs per chapter.
  - Or set `pickPlayer: false`, leave `outcome` as "", and give 2–3 `options`, each with a short `text` and an `outcome`: one sentence saying what happens because of that choice, using the player's name.
  - No option should be obviously right. Good dilemmas trade the group's interest against the player's own, or honesty against loyalty.
- Build on earlier chapters: the facts list what each player knew, chose, why, and what happened as a result. The new scene should grow out of those outcomes (the stash someone hid is found, the stranger someone let in causes trouble), so the group sees their choices shaping the story.
- `callback`: as above.

## recap

The game is over. Write the finale using only what really happened (listed in the facts). Don't invent events.

- `titles`: one per player (id in `playerId`). A short, funny superlative `title` that the group will remember (like a yearbook award), and a one-sentence `reason` that points to something specific they did or how the group voted about them.
- `memories`: exactly 3 short lines, each capturing a real moment from the game that could become an inside joke. Quote the actual prompts, choices and votes. Choose surprising votes, lonely choices, failed predictions, secrets someone kept or acted on, and heavily reacted answers.
- `epilogue`: 1–2 sentences closing the story in this world, mentioning the group.
