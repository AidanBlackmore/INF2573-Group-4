# The Gathering

"How well do you know your friends?" A party game for 3 to 6 players. One shared screen on a TV, phones as controllers. Everyone joins The Gathering, then the group picks a story to play together. Two stories are playable: **Murder at Marlowe Manor** (one of you is secretly the murderer, and everyone else has to work out who before it's too late) and **Trapped Below** (a submarine 400 m down, a saboteur aboard, and an air clock running out).

Live: **https://the-gatheringg.vercel.app** (it opens on the TV screen).

- `/` (also `/host`): the shared screen (the TV). Open it on a laptop connected to the TV. It also plays the music, the narrator and the sound effects. Sound is on by default; see [Sound on the TV](#sound-on-the-tv) for the one-time browser setting that lets it start without a click.
- `/play/CODE`: the phone. Scanning the QR code on the TV opens it and joins straight away.
- `/join`: for phones that can't scan: type the room code.

Phones and the laptop never talk to each other directly. Every action goes to Supabase, and Supabase Realtime tells each screen when something changed. Each screen then reloads what it is allowed to see. That is also how a phone recovers after a refresh or after the screen locks.

## What is in this repo

- **The repo root** is the current game (Next.js + Supabase). This is what runs and what Vercel deploys.
- **`research/`**: interview transcripts, interview synthesis, opportunity solution tree and product brainstorming.
- **`legacy/express-ai-gm/`**: the earlier Express + Socket.io version with the AI Game Master, casting quiz and secret chapters. Archived as-is, with its own README for running it.

## How a game works

1. **Join The Gathering.** Open the site on the laptop. It shows the title, a QR code, the address (`the-gatheringg.vercel.app/join`) and a room code (like `OAK47`). Every time the page loads it opens a new room with a new code. Each phone scans the QR code, which takes it straight in (or goes to `/join` and types the code into the five boxes), then types a **name** and **what they look like** ("curly hair, round glasses, a big scarf") and taps **Draw me**. A pen-and-ink portrait is drawn from it (up to 3 tries), and once they tap **I'm in** it appears on the TV. Each player also gets a colour automatically for their name tag. With 3 or more in, the host taps **We're in** (on the TV, or on the host's phone: the first player in is the host). Anyone who joined the room but didn't finish is left out of this gathering.
2. **Pick a story.** The TV becomes a full-screen story browser. Anyone can swipe on their phone (or use the arrows and thumbnails on the TV) and every screen follows, with the new story wiping in over the old one. Marlowe Manor brings rain, lightning and its music; Trapped Below has rising bubbles and its deep-water ambience. The host taps **Enter this story** to step in.
3. **Stepping into Marlowe Manor**, the first thing is the **guest book** on the TV ([`app/host/guestbook.tsx`](app/host/guestbook.tsx)). Lord Fenwick's visitors' book opens and its pages flutter past; a quill writes each guest's name (as typed when they joined) into the book, one handwriting font per guest, beside their portrait and an arrival time. Then the pages flutter back, the book shuts, slides to the middle and is sealed with wax. It runs on a fixed timetable (about 6.5 s, plus 2.9 s per guest, plus 7.4 s to close), so it needs no database; the TV can **Skip** it. Phones show "Eyes on the TV" meanwhile.
   Then the TV plays a short **intro** (four beats, about 45 seconds, read by the narrator): the storm and the dinner, the murder, how your answers become the clues, and how you catch the murderer. Phones show "Eyes on the TV" meanwhile. The TV has **Next** (the next beat) and **Skip intro**; a phone carries on by itself when the intro would end, or with **Done on the TV? Continue**.
   Then each phone offers a **practice round** (**Start practice** or **I know how to play**). Players who know how go straight on. New players get a **practice round** on their phone, about 30 seconds: one round in six glances on mock screens (open your role, see you're a detective, cut a fuse-box wire, see the clue behind the lock, vote, done). Each step is a spotlight and one short line; steps with something to do wait for you to do it, the rest move on by themselves. Nothing in it is saved and nobody else sees it; it can be skipped at any point. Both are remembered per room, so coming back to the manor doesn't repeat them. No database changes: see [`lib/gathering/onboarding.ts`](lib/gathering/onboarding.ts) and [`app/play/[code]/practice.tsx`](app/play/[code]/practice.tsx).
4. **Inside Marlowe Manor**, each player picks one of six detective portraits and answers **three questions** ("What's your most irrational fear?"). Players can shuffle to a different question but must answer to continue. Answers are private and final.
5. **Start the night** (on the TV, or on the host's phone: the first player to join gets host controls). Each phone opens a sealed envelope with its secret role: one **murderer**, everyone else **detectives**. The night starts once everyone has tapped **Got it**.
6. **Each round is an hour of the night** (nine o'clock to dawn). Everyone is split into pairs (a trio if odd), with new partners each round. Each pair goes to a room of the house and opens a **lock** together. Each lock needs both phones:
   - **Fuse box:** one phone sees the wires, the other has the manual.
   - **Charades** and **Sketch:** one phone sees what to act or draw, the other types the guess.
   - **Two truths and a lie:** one player tells three things about themselves, the others spot the lie. Every round, one pair gets this lock.
7. **Behind every lock is a torn note**, and each partner sees half. Every answer from the start is a note somewhere in the house; the murderer's say "the murderer" and everyone else's say "an innocent person". One pair finds one of the murderer's notes each round, while they last. Locks nobody opens keep their notes for later rounds.
8. **The murderer** has secret moves on their phone: **forge a note** once (a fake secret that turns up as one of theirs) and **strike someone** in even rounds. The person who was with the victim looks guilty.
9. **The meeting.** When time runs out (or the host calls it), everyone gathers. If a murderer's note turned up or someone died, the TV shows the notes and the group talks it through, then everyone **votes** on their phone (or skips). The TV counts the votes one mark at a time, then the verdict. If nothing turned up, there's no vote that round.
10. **Ghosts.** Killed or voted out players become ghosts: they still pair up and open locks, but can't vote.
11. **The end.** The detectives win by voting out the murderer. The murderer wins when only one detective is left. The TV then reveals whose every note was. **Play again** starts a new night with the same players and answers; **Choose another story** goes back to the story browser with the same group.

Every timer is 2 minutes (locks, discussion and vote). The host's phone can add a minute.

**Where to look.** Whenever the game moves between the TV and the phones, both say so. The TV shows a tag in the corner naming who should check their phone and what for (picking a detective and answering, reading your role, opening your lock, voting). A phone that isn't needed shows an **Eyes on the TV** bar at the top; a phone that just started needing its player flashes **Your move** (and vibrates on Android). See [`lib/gathering/focus.ts`](lib/gathering/focus.ts).

### Trapped Below

At any moment each player has one place to look. When the TV matters, phones go dark and show an arrow pointing up ("Eyes on the TV"). When a phone needs its player, it chimes, glows and shows **Your move**, and the TV's green tag says who should check their phone.

The story: the research sub *Meridian* creeps along the trench floor, 412 m down. One of the crew is a saboteur who wants her to sink. Every fix buys air and every breakdown or mistake costs some, so the air clock is the crew's time to work out who it is.

Captions follow the captain word by word (the spoken word lights up). The TV's sound bar has a master volume (music, narrator and effects together) and a Mute button that silences everything and turns red while muted. The TV always says which device to use: numbered steps marked **Phone**, **TV** or **Talk** on every screen, and a big green **Look at your phone** banner naming who should. Phones that need their player show a green **Your turn: use this phone** bar; the rest say **Eyes on the TV**.

1. **How to play.** The captain explains the game one card at a time (with a checklist of what's been covered): air is the time limit, repairs in pairs (find your name on the TV, look at your phone, talk), all hands (everyone on their phone), one saboteur (secret orders after the crew file), meet and vote, and how it ends. Phones stay dark. If **all** players tap **We know how to play**, it skips ahead.
2. **Seal the hatch.** Everyone presses and holds their bolt on their phone at the same time for 3 seconds. The TV groups the bolts in drill pairs (a trio if odd), the way the watches will pair people up. If anyone lets go early, the bolt clunks loose and they try again: nothing is lost. After two slips the captain counts them in.
3. **Dim the lights.** The TV asks the room to turn the lights down; the host taps **Lights are down. Dive.** The sub sinks to 412 m.
4. **Crew file.** Everyone plays as the portrait drawn when they joined. Each phone answers four light get-to-know questions (nothing personal or painful), and each says what it's for: a favourite colour (one of six wire colours), how spicy they like food (1 to 9), what they'd bring on a submarine for a week, and one question picked from a bank (comfort food, dream holiday, karaoke song...; shuffle for another). The host taps **Hand out the orders**.
5. **Sealed orders.** Each phone unscrews a porthole to read its orders. One player is always the **saboteur** (3 to 6 players).
6. **Four watches.** The air clock (8:00 to start, the tank holds 10:00) runs during watches. Pairs (a trio if odd) each get a repair. Every repair is about a crewmate (the "target"), chosen from outside the pair when there is one, so it tests how well you know each other. You can ask the target across the room, but the saboteur may lie.
   - **Wires** (engine, control, sonar rooms): the manual phone names the target and gives two hints from the crew file ("not red or white", "the number is odd"). The panel phone has six wires and a keypad, but doesn't know whose they are. Cut the target's favourite colour and enter their spice level. A wrong restart costs 0:10 and says how many of the two were right; after three, the repair fails.
   - **Oxygen bay** (also galley, quarters): both phones see a question about the target ("What would Maya bring?" in watches 1 and 2, their last answer in 3 and 4). The controls phone has up to four real answers from the crew file; the log phone rules one wrong answer out ("‘tea’ is Kit's answer"). A wrong press costs 0:15 and crosses it out; two wrong (one, with three answers) and the repair fails.
   - A fix adds air (3 minutes a watch, shared across the pairs), climbs toward the surface, and puts the target's checked answers on the **evidence board**.
7. **All hands** after watches 1 to 3:
   - **Identity check:** security has cleared one crewmate but scrambled the name; the TV and phones show their crew file ("My favourite colour is green. I like my food 4 out of 9 spicy..."). Everyone picks a name on their phone; if most are right, that person is **cleared** and their answers go on the evidence board. It's never the saboteur's file.
   - **Ballast pipes:** make one path from the sea intake to the tank. The TV shows the real pipes, with a phone icon by each row naming who turns it and whose phone has its map. Each phone shows how one row should look and has the valves for another row.
   - **Hull breach:** each phone has a job (shake to pump, blow into the microphone, hold the phone flat, or hold the hatch; the screen works too). Get the water to 0% before it reaches 100%.
   Each success adds a minute of air.
8. **The saboteur** can lie about anyone's answers, fail a repair on purpose, and once a watch **loosen a bolt** (a system fails at the start of the next watch: −0:30).
9. **Crew meeting:** the air clock stops. The TV shows the **evidence board**: clues about the saboteur on top (the first fix of each watch turns up one of their crew file answers), and every checked answer for each player below. A checked answer that doesn't match the saboteur's is struck through and that person is marked **Ruled out**; identity checks mark people **Cleared**. The group talks, then votes on their phones. The wrong person in the airlock costs a minute of air; they keep repairing but can't vote.
10. **The end.** The crew wins by voting out the saboteur. The saboteur wins if the air runs out, only one crew member is left, or they reach the surface undiscovered. The TV shows everyone's crew file. **Play again** deals new orders with the same crew files; **Choose another story** goes back to the browser.

Sound: the deep-water ambience loops all game. Each room of the sub has its own sound (made in the browser), on the TV and quietly on each phone. Hull creaks nudge the screen, breakdowns shake it, and a heartbeat starts when the air drops under 1:30. Phones vibrate rarely (Android only): a breakdown in your room and the air dropping low.

## Where things live

- **Database and rules:** [`supabase/migrations/0001_the_gathering.sql`](supabase/migrations/0001_the_gathering.sql). Every rule runs here: joining with a name and portrait, the story browser, pairing, locks, notes, the murderer's moves, votes and the ending. It also holds the charades and sketch words. To change the timers, change the `task_secs`, `talk_secs` and `vote_secs` defaults on `rooms`. Trapped Below has its own section near the end (`tb_*` tables and functions): the onboarding, crew files, repairs, emergencies, the air clock and the logs. Its timers are in `tb_start_watch` (150 s a watch), `tb_end_watch` (120 s an emergency), `tb_after_hands` (90 s to talk) and `tb_next` (60 s to vote); the starting air is `air_left` on `tb_games`.
- **Story and text:** [`lib/gathering/content.ts`](lib/gathering/content.ts). The list of stories (`STORIES`: title, art, colours, sky and music for each), the questions, the story for each hour, every narrated line, room names and the floor plan.
- **Trapped Below's text:** [`lib/gathering/trapped.ts`](lib/gathering/trapped.ts). The crew-file questions, the wire colours, the briefing's timing, the blueprint's rooms, the evidence board's columns, the pipes and every line the captain says.
- **Screens:** [`app/host/tv.tsx`](app/host/tv.tsx) (the TV) and [`app/play/[code]/phone.tsx`](app/play/[code]/phone.tsx) (the phone). Trapped Below's screens are in [`app/host/trapped.tsx`](app/host/trapped.tsx) and [`app/play/[code]/trapped.tsx`](app/play/[code]/trapped.tsx). Shared pieces (avatars, timer ring, floor plan, rain, bubbles) are in [`app/_ui/`](app/_ui). The design system is [`app/gathering.css`](app/gathering.css); Trapped Below's look (brass and steel, the rooms, the blueprint) is [`app/trapped.css`](app/trapped.css).
- **Sound:** [`lib/gathering/sound.ts`](lib/gathering/sound.ts). Music, narrator and sound effects, TV only. In Trapped Below the narrator is the captain, heard through a radio filter. [`lib/gathering/deep.ts`](lib/gathering/deep.ts): Trapped Below's room sounds, creaks, heartbeat and the phones' chime, made in the browser.
- **Images, music and narration:** [`public/`](public).
  - `public/figma/`: backgrounds, portraits, clue art and paper ephemera from the Figma design system.
  - `public/audio/ambience.mp3`: Marlowe Manor's music. It plays on the manor's page in the story browser and all night inside the story.
  - `public/audio/deep.mp3`: Trapped Below's deep-water ambience. It plays on its page in the story browser and all game inside the story, under the captain.
  - `public/trapped/`: Trapped Below's art: `bg/` (the rooms of the sub), `crew/` (the six crew portraits), `kit/` (brass and steel buttons, panels, the air tank, the porthole) and `sub.webp` (the blueprint).
  - Both loop by crossfading the end of the track into the start. Switching stories fades one out and the other in.
  - `public/narration/<line>.mp3`: the narrator (ElevenLabs, "Harry"). One file per line in `NARRATION` in `content.ts`. If a file is missing, the browser's own voice reads that line. The intro's four lines (`intro-1` to `intro-4`) aren't recorded yet, so for now the browser reads them. Trapped Below's captain (ElevenLabs, "Oswald") is `tb-*.mp3`, one file per line in `TB_NARRATION` in `trapped.ts`.
  - `public/sfx/<name>.mp3` (optional): recorded sound effects (`thunder`, `lock`, `chime`, `scream`, `sting`, `gavel`, `bark`, `heartbeat`, `tick`). Without them, the sounds are synthesised in the browser.

## Privacy and server rules

- **Only the server writes.** Devices can only read rooms and the players in their own room. Every action (join, pick a portrait, answer, open a lock, forge, strike, vote, next) is a database function that checks the request first. Examples: only the TV or the host's phone can move the game on, only the lead in a pair can see what to act or draw, only the murderer can forge or strike, and ghosts can't vote.
- **Secrets stay on the server.** Who the murderer is, the notes, the lock answers and the votes are in tables no device can read. Each screen reads its own slice through `get_view()`: the TV gets the public picture, each phone also gets its own role, its side of its lock and its half of the note. Whose note was whose only comes out at the end.

- **Portraits are checked twice.** The description is checked against a word list on the phone and again on the server before anything is drawn, so nothing rude reaches the shared TV. A player can only save a pre-drawn portrait or one they uploaded themselves.
- **What is sent where.** The description goes to Cloudflare to be drawn (the name never does). The drawing is stored in a public Supabase Storage bucket so the TV can show it. Every drawing is also sent to PostHog AI observability (the description inside the prompt, plus the picture) so it can be evaluated; that is the only place a player's words reach PostHog. Other analytics never include the description.

## Character portraits

On the join screen each player describes what they look like and gets a portrait in the house style (pen and ink on old paper). It's free:

1. **Drawing:** [`app/api/portrait/route.ts`](app/api/portrait/route.ts) sends the description, wrapped in a fixed style prompt (`portraitPrompt` in [`lib/gathering/look.ts`](lib/gathering/look.ts)), to FLUX.1 schnell on **Cloudflare Workers AI's free plan**: 10,000 neurons a day, about 58 per portrait, so roughly 170 portraits a day. Past that Cloudflare refuses until midnight UTC; it never charges.
2. **Keeping the style:** the phone turns whatever comes back into ink on old paper with a hand-drawn border ([`lib/gathering/portrait.ts`](lib/gathering/portrait.ts)), then uploads it to the `portraits` bucket in Supabase Storage (about 70 KB each; the free plan has 1 GB).
3. **Limits:** 3 drawings per player, only while the room is joining (`use_draw` in the database).
4. **Backup:** if Cloudflare isn't set up, is out of today's allowance or takes too long, the phone picks the closest pre-drawn portrait from [`public/portraits/`](public/portraits) by matching words (`LIBRARY` in `look.ts`). Add more drawings there, with their words in `LIBRARY`, to make the backup better.

### Set up Cloudflare (once)

1. Make a free account at [dash.cloudflare.com](https://dash.cloudflare.com). No card is needed for the free plan.
2. Copy your **Account ID** (on the account home page, or under **Workers & Pages** on the right).
3. Go to **My Profile > API Tokens > Create Token**, use the **Workers AI** template, and create it. Copy the token.
4. In Vercel, add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (below), then redeploy.

Without them the game still works: every player gets a pre-drawn portrait.

### Evaluating the portraits (PostHog)

Each drawing is reported to PostHog as an `$ai_generation` ([`lib/gathering/observe.ts`](lib/gathering/observe.ts)), after the phone already has its answer: the full prompt, the picture, how long it took, any error, `prompt_version` (`PROMPT_VERSION` in `look.ts`) and `steps`. They show under **AI observability > Generations**, and the **Evaluations** tab scores them:

| Evaluation | Kind | Checks |
|---|---|---|
| Portrait was drawn | code (free) | Cloudflare returned a picture |
| Portrait matches the description | AI judge, 1–5 (pass is 4+) | each feature the player mentioned is in the picture |
| Portrait follows the house style | AI judge, pass/fail | thick black brush ink in the Figma avatars' caricature style, one person, cream or plain paper, no text or frame |

- **The judges need an AI key.** In PostHog, **Settings > AI observability > Bring your own key**, add a Gemini key (free from [Google AI Studio](https://aistudio.google.com/apikey)), then switch both judges on in the Evaluations tab.
- **To improve the model:** change `portraitPrompt` (or the model or `steps`), bump `PROMPT_VERSION`, play a few games, then compare the evaluation scores by `prompt_version`.

## Environment variables

| Name | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | PostHog project API key. Without it, analytics is skipped. |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com` |
| `FEEDBACK_URL` | no | "Give feedback" link on the TV's ending screen. Hidden if empty. |
| `NEXT_PUBLIC_SITE_URL` | no | Only used when the TV is on `localhost`: where its QR code and "or go to" line send phones (e.g. your laptop's network address). Defaults to `https://the-gatheringg.vercel.app`. Anywhere else the QR code points to the address the TV is on, so a branch preview's phones get that branch's code. |
| `CLOUDFLARE_ACCOUNT_ID` | no | Cloudflare account for drawing portraits (see Character portraits). Server only. |
| `CLOUDFLARE_API_TOKEN` | no | Cloudflare API token with Workers AI permission. Server only: never prefix it with `NEXT_PUBLIC_`. |

### Analytics (PostHog)

PostHog records pageviews plus the events below. Every event has `screen` (`tv` or `phone`) and, once there is one, `room_id`. **Group events come from the TV only**, so each is counted once per room; phones only send what happens to that one player. No answers, names or other things players type are sent with these events (the portrait description goes only to AI observability, see Evaluating the portraits).

**Joining** (is it easy to get a group in?)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `room_created` | TV | The TV opens a new lobby (every page load) | |
| `join_failed` | phone | A typed code is wrong, the room is full or already started | `error` |
| `portrait_drawn` | phone | A player taps **Draw me** | `engine` (`ai`, `library` when Cloudflare failed, or `blocked`), `ms`, `reason`, `look_length` (never the words) |
| `player_joined` | phone | A player sets their name and portrait | `join_method` (`qr` or `code`), `seconds_to_join`, `portrait` (`ai` or `library`) |
| `lobby_completed` | TV | The host taps **We're in** | `players`, `lobby_seconds` |
| `phone_rejoined` | phone | A refreshed or relocked phone comes back into its room | |

**Choosing a story** (which stories do groups want?)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `story_viewed` | TV | A story comes on screen in the browser | `story`, `story_name`, `playable` (false for Coming soon), `position`, `players` |
| `story_entered` | TV | The group steps into a story | `story`, `story_name`, `players`, `browse_seconds`, `stories_viewed` |

The events come in two layers, so you can look at the whole game or at one story:

- **Game-wide events** have the same name and the same core properties in every story. Break them down by `story` to compare stories. `story` is the story's key (`marlowe`, or `station` for Trapped Below) and `story_name` is its title.
- **Story events** start with the story's prefix (`marlowe_` or `trapped_`) and carry that story's own details: locks and murders for Marlowe Manor, repairs and air for Trapped Below.

**Playing: every story** (game-wide)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `game_started` | TV | Roles are dealt (Marlowe: envelopes; Trapped Below: sealed orders), or the first game screen the TV sees | `story`, `story_name`, `players`, `has_traitor` (false only for 3-player Trapped Below dives before December 2026, which were co-op), `setup_seconds` (from entering the story or picking Play again to roles being dealt), `game_number` (1 for the room's first game, 2+ for replays), `stories_played` |
| `game_ended` | TV | The ending | `story`, `story_name`, `outcome` (the story's own words: `detectives`/`murderer` or `crew`/`saboteur`), `winner` (the same words for every story: `group` or `traitor`), `has_traitor`, `rounds`, `minutes`, `game_number`, `players` |

**Playing: Murder at Marlowe Manor** (`marlowe_*`, all with `story = marlowe`)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `marlowe_intro_skipped` | TV | The TV skips the intro | `beat` (which of the four was showing) |
| `marlowe_practice_choice` | phone | A player answers "Have you played before?" | `played_before` |
| `marlowe_practice_finished` | phone | A player finishes or skips the practice round | `completed`, `step` (where they stopped), `steps`, `seconds` |
| `marlowe_answers_submitted` | phone | A player locks in their three answers | `shuffles` (questions skipped), `seconds` |
| `marlowe_round_started` | TV | Each round (hour) starts | `round`, `players`, `pairs` |
| `marlowe_lock_opened` | TV | A pair opens their lock | `lock_type` (`fuse`, `charade`, `sketch` or `lie`), `tries` (failed tries first), `seconds`, `pair_size`, `round`, `players` |
| `marlowe_round_ended` | TV | The search ends | `locks_opened`, `locks_total`, `timed_out`, `seconds`, `murderer_notes`, `death`, `meeting` (false = a quiet round, no vote) |
| `marlowe_vote_revealed` | TV | The verdict is shown | `ejected`, `was_murderer`, `tie`, `votes_cast`, `round` |
| `marlowe_game_ended` | TV | The ending | `outcome`, `winner`, `rounds`, `minutes`, `locks_opened`, `survivors` |

**Playing: Trapped Below** (`trapped_*`, all with `story = station`; TV events from the sealed orders on also have `saboteur`, true when there is one)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `trapped_onboarding_completed` | TV | The hatch is sealed | `skipped` (everyone tapped "We know how to play"), `slips`, `seconds` |
| `trapped_crew_file_submitted` | phone | A player files their crew file | `shuffles` (deep questions skipped), `seconds` (never the answers) |
| `trapped_round_started` | TV | Each watch starts | `round`, `pairs`, `air_left` (seconds) |
| `trapped_repair_done` | TV | A pair finishes a repair | `kind` (`wires` or `guide`), `result` (`ok`, or `fail` when out of tries), `tries`, `seconds`, `round` |
| `trapped_round_ended` | TV | A watch's repairs end | `round`, `repairs_done`, `repairs_total`, `seconds`, `air_left`, `air_change` (seconds of air gained or lost over the watch: negative means used, fixes add some back), `emergency` (an all-hands emergency follows) |
| `trapped_emergency_done` | TV | An all-hands emergency ends | `kind` (`riddle`, `pipes` or `leak`; `sonar` before December 2026), `ok`, `tries`, `floods`, `seconds`, `round` |
| `trapped_vote_revealed` | TV | The verdict is shown | `ejected`, `was_saboteur`, `tie`, `votes_cast`, `round` |
| `trapped_game_ended` | TV | The ending | `outcome`, `winner`, `end_reason` (`surfaced`, `saboteur_caught`, `air_out`, `crew_lost` or `saboteur_escaped`), `rounds`, `minutes`, `air_left`, `fixes`, `repairs_ok`, `repairs_failed` (`repairs_half` before December 2026) |

**Coming back** (do groups want more?)

| Event | Sent by | When | Properties |
|---|---|---|---|
| `replay_chosen` | TV | From the ending, the host picks what's next | `story` (the story just played), `choice` (`same_story` or `another_story`), `games_played`, `players` |
| `feedback_clicked` | TV | **Give feedback** on the ending screen | `story`, `outcome`, `winner` |
| `game_abandoned` | TV | The TV is closed, reloaded or starts a new room while a group is still in it | `story` (empty in the lobby and story browser), `phase`, `round`, `players`, `in_game`, `games_played`, `minutes`, `how` (`closed` or `new_room`) |
| `action_failed` | phone | Anything a player tries is refused (name taken, no portrait yet, etc.) | `action`, `phase`, `error` |

Dashboards in PostHog (project 654207):

- **[The Gathering: game health](https://us.posthog.com/project/654207/dashboard/2231394)**: the whole game, every story. The group funnel `room_created → lobby_completed → story_entered → game_started → game_ended` (where groups stop is the biggest thing to fix), games by story, who wins by story (`winner`), game length by story, story demand, joining, replays and where groups give up.
- **The Gathering: Murder at Marlowe Manor**: the `marlowe_*` events. Who wins (aim for close to 50/50), whether the vote catches the murderer, lock difficulty by `lock_type`, rounds where the timer ran out, and question shuffles.
- **The Gathering: Trapped Below**: the `trapped_*` events. How dives end (`end_reason`), air left at the end and per watch (to tune the 8:00 air clock), repairs by `kind`, emergencies by `kind`, onboarding skips and slips, and whether the vote catches the saboteur.

Other things worth checking: median `seconds_to_join` and QR vs typed (`join_method`); `portrait_drawn` by `engine` (lots of `library` means Cloudflare's free allowance is running out or it's too slow, `ms`); `action_failed` by `error`; and `phone_rejoined` (how often phones drop out).

Renamed in November 2026: the story-specific events got their story's prefix. `answers_submitted`, `round_started`, `lock_opened`, `round_ended` and `vote_revealed` from Marlowe Manor are now `marlowe_*`; `onboarding_completed`, `repair_done`, `emergency_done`, and Trapped Below's `round_started` and `vote_revealed` are now `trapped_*`. Older data stays under the old names. The game also used to send `stories_opened` (now `lobby_completed`), `round_quiet` and `meeting_called` (now `round_ended`), plus `act_started`, `round_N_started`, `universe_*`, `vote_submitted`, `choice_auto_selected`, `icebreaker_answered` and `mystery_*` from the old versions. To hide them, go to **Data management > Events** in PostHog and mark them hidden.

On Vercel, changes to environment variables only apply after a redeploy (**Deployments**, then **...** next to the latest deployment, then **Redeploy**).

## Run it locally

You need Node.js 20 or newer.

1. Copy `.env.example` to `.env.local` and fill in the values. Find the Supabase ones in the Supabase dashboard under **Project Settings > API Keys**.
2. In the Supabase dashboard, open **Authentication > Sign In / Providers** and turn on **Allow anonymous sign-ins**.
3. Paste [`supabase/migrations/0001_the_gathering.sql`](supabase/migrations/0001_the_gathering.sql) into **SQL Editor** and click **Run**. It's one file for the whole game; run it again whenever it changes (this version adds the join and story-browser steps). On a project that ran the old Alternate Universes migrations, it removes those tables first (any old games are deleted). It's safe to run again.
4. Install and start the app:

```bash
npm install
npm run dev
```

### Test with real phones on the same Wi-Fi

`npm run dev` listens on every network interface, so other devices on your Wi-Fi can reach it. You need your laptop's local IP address. On a Mac, open **System Settings > Wi-Fi**, click **Details…** next to your network, and copy the **IP address**. You can also run this in Terminal:

```bash
ipconfig getifaddr en0
```

1. In `.env.local`, set `NEXT_PUBLIC_SITE_URL=http://<your IP>:3000` (for example `http://192.168.1.23:3000`) and restart `npm run dev`. Otherwise the QR code sends phones to the live Vercel site. Don't use `localhost`: on a phone that means the phone itself.
   Then open `http://localhost:3000` on the laptop.
2. Scan the QR code with each phone's camera.

University and guest Wi-Fi networks often block devices from talking to each other. In that case, test the deployed Vercel version instead.

## Sound on the TV

The music and narrator are on by default, but browsers don't let a website play sound until someone has clicked or pressed a key on the page, or the browser has been told to allow sound for that site. Do this once on the laptop that runs the TV, and sound then starts by itself every time:

- **Chrome or Edge:** open the site, click the icon left of the address, then **Site settings**, and set **Sound** to **Allow**.
- **Safari:** open the site, choose **Safari > Settings for the-gatheringg.vercel.app…**, and set **Auto-Play** to **Allow All Auto-Play**.
- **Firefox:** click the icon left of the address and set **Autoplay** to **Allow Audio and Video**.

Without it, sound starts on the first click or key press anywhere on the TV page (for example **We're in**), and any narration that was due is read then.

## Deploy to Vercel

Vercel redeploys automatically every time the `claude/lucid-heisenberg-cgg0ll` branch is pushed to GitHub.

First-time setup:

1. On [vercel.com](https://vercel.com), sign in with GitHub, click **Add New > Project**, and import the repository.
2. Before clicking Deploy, open **Environment Variables** and add the variables from the table above.
3. Click **Deploy**. Open `https://the-gatheringg.vercel.app` on the laptop. The QR code points to that address, so phones can join from any network. The QR code always points to the address the TV is open on, so this also works for branch previews and if the project is renamed.

## Test checklist

- [ ] Open the site. The title, a room code and a QR code appear. Scanning the QR code opens `the-gatheringg.vercel.app/play/CODE` and goes straight to the name step.
- [ ] Three or four phones join, each with a name and a description. **Draw me** shows a pen-and-ink portrait within a few seconds (or a pre-drawn one with a note if Cloudflare is busy), and a rude description is refused. After **I'm in** the portraits appear on the TV without a refresh. **We're in** stays disabled until 3 are in. A phone that joined but didn't finish sees "Already started" after **We're in**.
- [ ] Swipe on a phone: the TV and every phone move to the next story with the wipe. On Marlowe Manor: rain, lightning and the manor's music. On Trapped Below: bubbles and the deep-water ambience, which keeps looping. Only the host's phone (or the TV) can enter.
- [ ] Enter Marlowe Manor. Each phone picks a portrait (a portrait someone else has is shown as taken) and answers three questions. **Start the night** stays disabled until everyone has answered.
- [ ] Start. Each phone opens its envelope: one murderer, the rest detectives. The narrator reads the prologue. The night starts once everyone taps **Got it**.
- [ ] Each pair sees the same room and lock. Open each lock type: the fuse box (wires on one phone, manual on the other), charades and sketch (only the lead sees the word; the sketch appears on the partner's phone), two truths and a lie (a wrong pick swaps roles).
- [ ] An opened lock shows each partner half of a torn note. The TV clicks and marks the lock opened.
- [ ] On the murderer's phone, forge a note. In round 2, strike someone. At the meeting the TV reports the death and the victim's phone says they're a ghost (no vote).
- [ ] Refresh a phone mid-round. It comes back as the same player on the same screen.
- [ ] Vote. The TV counts the votes one at a time, then **Reveal the verdict**. Vote out the murderer: the detectives win and the TV shows whose every note was.
- [ ] **Play again** starts a new night with the same players. **Choose another story** goes back to the story browser with the same group.
- [ ] Refresh the laptop. It opens a new room with a different code; phones join again. (A game already under way carries on for the phones, but the TV leaves it, so only refresh between games.)
- [ ] Optional: a 7th phone tries to join and sees "This game is full".
- [ ] Enter Trapped Below. The captain explains while the board fills in; phones show "Eyes on the TV". Three phones tap **We know how to play**: nothing happens; the fourth: it jumps to the hatch.
- [ ] Hold all bolts together for 3 seconds: sealed. Let one go early: it slips, nothing is lost.
- [ ] Dim the lights, dive (host's phone), fill in four crew files, hand out the orders, unscrew the portholes. With 4 players one phone says Saboteur.
- [ ] Watch 1: the air clock runs. Fix the wires (ask your partner) and a "Who said it?". The air goes up; a wrong restart costs 10 seconds.
- [ ] Sonar: the listener's phone beeps (and vibrates on Android); another phone types the word. Pipes: turn the valves of your row. Hull breach: shake, blow, level and hold until the water is gone.
- [ ] Meeting: a log about the saboteur, the air paused, then a vote. Vote out the saboteur: the crew wins and the TV shows every crew file. **Play again** and **Choose another story** both work.
