# Project context

A short brief for anyone (or any AI session) picking up this project, so the background doesn't have to be rediscovered each time. The README covers how to run, deploy and test; this file covers what we're building, why, and how we work. Keep it up to date when the direction changes.

## What this is

**The Gathering** is a party game for a group in one room: a shared screen (a laptop on a TV) plus everyone's phones. The TV shows a QR code; phones scan it to join, pick a name and a colour, then the group browses **stories** together and picks one. Each story is its own game world. The tagline is "How well do you know your friends?": the games are built on what players reveal about themselves.

- **Course:** INF2573, Group 4. Repo: `AidanBlackmore/INF2573-Group-4`.
- **Live site:** https://the-gatheringg.vercel.app. The front page is the TV screen.
- **Design:** Figma file "Alternative Universe" (https://www.figma.com/design/B2zj8NNZnGIC4sfuUkCJyz/Alternative-Universe?node-id=159-2). Exported art is in `public/figma/`.
- **Demo:** an interactive HTML demo of the whole flow was built as a Claude artifact (https://claude.ai/artifact/7QkRaGpmPjU6zF775igHt9). The app was then built to match it.

### Stories

1. **Murder at Marlowe Manor** (playable). 1891, a storm, Lord Fenwick face-down in the trifle. One player is secretly the murderer. Rain, lightning, the manor music and a recorded narrator. 3–6 players, about 25 minutes.
2. **Trapped Below** (playable; was "Sabotage on Station Zero", and its story key is still `station`). A research submarine 412 m down, a saboteur aboard, an air clock running out. Always one saboteur, 3 to 6 players. The sub is the *Meridian*; the saboteur wants her to sink, and the air clock (fixes add air, breakdowns cost it) is the crew's time to find them. Prototyped first as a Claude artifact (https://claude.ai/artifact/Ljifein59CEf6rEGJMrbGC).
3. Two "Coming soon" placeholder cards.

The story list lives in `STORIES` in `lib/gathering/content.ts`. Its order matches `rooms.focus` in the database.

## Direction and goals

- The game should be **quick to start**: open the site on the TV, scan, play. No accounts, no app.
- **The TV is the stage, phones are private.** Secrets (roles, notes, lock answers) only ever appear on the phone they belong to.
- **Atmosphere matters:** music per story, narration, weather, animated transitions between stories, following the Figma design closely.
- **More stories over time.** Marlowe Manor and Trapped Below are playable, and story-viewing analytics are there to show which story to build next.
- **Say which device.** Every TV screen lists numbered steps marked Phone, TV or Talk, and a big banner says who should look at their phone. Explain each mechanic when it first appears (progressive disclosure), not all at once.
- **One place to look.** At any moment each player looks at either the TV or their phone, never both. Idle phones go dark and point up; phones that need you chime and glow ("Your move").
  - **Marlowe Manor and The Gathering** (`lib/gathering/focus.ts`): the TV shows a "<names>, check your phone" tag with what to do there (detective and questions, secret role, lock, vote); phones that aren't needed show an "Eyes on the TV" bar; phones that start being needed flash "Your move" (and vibrate on Android). The story browser says "Swipe on any phone". **Trapped Below** does the same with `phoneFocus` in `app/host/trapped.tsx`.
- **Measure what matters** with PostHog (below): can groups get in, which stories they want, whether the game is balanced and the right length, where groups give up, and whether they play again.

## How a game flows

TV route `/` (also `/host`); phones use `/play/CODE` (QR link, joins straight away) or `/join` (type the code).

1. **Join** (`join` phase): every TV page load creates a new room with a random code (e.g. `OAK47`). Phones join with a name and a few words about what they look like, and get a pen-and-ink portrait drawn by Cloudflare Workers AI (free plan; a pre-drawn one if that fails). Colours are given automatically. With 3+ in, the host taps **We're in**. The first player in is the host, and the TV can also press every host button. Unfinished joiners are dropped.
2. **Browse** (`browse`): a full-screen story browser. Anyone can swipe and every screen follows. Only the host or the TV can **Enter this story**.
3. **Marlowe Manor:**
   - **Guest book** (start of `lobby`, no database changes): the TV opens Lord Fenwick's visitors' book and a quill writes each guest's name in, one handwriting font per guest (`--font-sig-a/b/c` and Kalam), then the book shuts and is sealed. Fixed timetable from `phase_at` and the number of guests (`bookMs` in `lib/gathering/onboarding.ts`); the intro and the phones' "Eyes on the TV" follow the same timetable. An earlier version had everyone sign on their phone, which needed new database columns; it was taken out for testing.
   - **Onboarding** (after the guest book, no database changes): a 45-second intro on the TV with **Next** and **Skip intro** (phones show "Eyes on the TV" and carry on by themselves, or with **Done on the TV? Continue**), then each phone offers a practice round ("Start practice" or "I know how to play"). New players get a practice round on their phone (under a minute): seven steps, each a spotlight and one short line, learning by doing (open, cut, vote, "Got it"), the rest moving on by themselves. One step lists all four partner locks (fuse box, charades, sketch, two truths and a lie) as what comes later with a partner; the clue step says it's a clue about the murder and the partner has the other half; it happens before picking a detective, so **Start the night** also waits for it. Remembered per room in `sessionStorage`.
   - **`lobby`:** each player picks a detective portrait and answers 3 questions. They can shuffle a question, but must answer. Answers are final.
   - **`roles`:** a secret role arrives in an envelope: one murderer, the rest detectives.
   - **`tasks`:** rounds are hours of the night. Players pair up (a trio if odd) to open locks: fuse box, charades, sketch, or two truths and a lie. Behind each lock is a torn note, and each partner sees half. Every answer is a note somewhere in the house, and the murderer's notes are the clues.
   - **The murderer** can forge one note, and strike someone in even rounds.
   - **`discuss` / `meeting` / `tally` / `revealed`:** discussion and a vote when a clue or a body turned up; otherwise a `quiet` round.
   - **Ghosts** (killed or voted out) still open locks but can't vote.
   - **`ended`:** detectives win by voting out the murderer; the murderer wins when one detective is left.
4. **Trapped Below** (phases `tb_*`): how to play (the captain explains, all can skip), seal the hatch together (hold on every phone for 3 s, safe to fail), dim the lights and dive, crew file (four light get-to-know questions, each saying what it's for; everyone keeps their joining portrait), sealed orders (always one saboteur), four watches of repairs about a crewmate outside the pair (wires: cut their colour, enter their number; oxygen bay: pick their real answer) with an air clock, all-hands emergencies (identity check riddle that clears someone, ballast pipes, hull breach with phone sensors), meetings at the evidence board (clues about the saboteur against every checked answer) and a vote, then the ending with everyone's crew file.
5. **Ending:** **Play again** keeps the same story; **Choose another story** goes back to the browser with the same group.

## Tech

- **Next.js 16 (app router) + React 19.** It differs from older Next: read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`). React compiler lint rules apply: no `Date.now()` or ref writes during render, and no synchronous setState in effects.
- **Supabase:** Postgres, anonymous auth, Realtime.
  - **One migration:** `supabase/migrations/0001_the_gathering.sql`, run by hand in the Supabase SQL Editor. Re-running it wipes games in progress.
  - **Security:** RLS everywhere. Clients only call SECURITY DEFINER RPCs.
  - **Views:** each screen reads its own slice through `get_view(room_id)`. The database is the source of truth, so screens reload on Realtime events, on waking up, and every 4 s.
- **Vercel:** deploys the `claude/lucid-heisenberg-cgg0ll` branch.
- **PostHog:** `posthog-js`, set up in `instrumentation-client.ts`. Only pageviews and our own events.
- **Fonts:** Jersey 15 (labels and headings; replaced Pixelify Sans) is self-hosted in `app/fonts/` and loaded twice in `app/layout.tsx`: 118% for The Gathering and Marlowe, plain for Trapped Below (`--pixel` is redefined under `[data-world="deep"]`). Literata for body, Kalam for handwriting.
- **Typing on phones:** the room code is one real `<input>` drawn as five boxes (`CodeBoxes` in `app/play/[code]/phone.tsx`), so backspace and paste work with every phone keyboard. Don't go back to one input per box: Android keyboards don't report backspace on an empty box. Keypads (the wire code lock) have a delete key.
- **Dark pages:** the viewport declares `colorScheme: "dark"` so phones' automatic dark mode doesn't recolour the site (it hid wire colours).

### Key files

| File | What |
|---|---|
| `app/host/tv.tsx` | TV screens, sound cues, TV analytics hook (`useAnalytics`) |
| `app/page.tsx` | Front page: renders the TV |
| `app/join/page.tsx` | Type-a-code page |
| `app/play/[code]/phone.tsx` | Phone screens, QR auto-join, code boxes, phone analytics |
| `app/_ui/` | Shared pieces: `bits.tsx` (avatars, tags, timer ring, `Line`), `house.tsx` (floor plan), `weather.tsx` (rain/dust/stars/bubbles canvas) |
| `app/gathering.css` | The design system |
| `lib/gathering/content.ts` | All story text: stories, questions, chapters, narration lines, rooms, locks |
| `lib/gathering/game.ts` | `View` types, `useGame` (live view), `act()` RPC helper, timers |
| `lib/gathering/sound.ts` | Music loops with crossfade, narrator (recordings in `public/narration/`, browser voice fallback), synthesised sound effects |
| `app/host/trapped.tsx` | Trapped Below on the TV: every `tb_*` screen, the blueprint, room backdrop, its sound and analytics hook (`useTrappedTv`) |
| `app/play/[code]/trapped.tsx` | Trapped Below on the phone: look-up screens, hatch, crew file, orders, repairs, emergencies (shake/mic/tilt sensors), vote |
| `app/trapped.css` | Trapped Below's look, scoped to `[data-world="deep"]` |
| `lib/gathering/trapped.ts` | Trapped Below's text: questions, briefing timing, captain's lines, rooms, evidence board columns, pipes |
| `lib/gathering/deep.ts` | Trapped Below's synthesised sounds (rooms, creaks, heartbeat, chime, Morse), `shake()` and `buzz()` |
| `lib/gathering/onboarding.ts` | Marlowe Manor's intro beats (text, art, timing) and the per-room "seen" flags |
| `app/play/[code]/practice.tsx` | Marlowe Manor on the phone before picking a detective: "Eyes on the TV", "Have you played before?", and the practice round with its spotlight (`Coach`) |
| `app/host/guestbook.tsx`, `app/guestbook.css` | Marlowe Manor's guest book on the TV: the 3D book (open, pages flipping, names written in by a quill, close and seal) |
| `lib/gathering/focus.ts` | Marlowe Manor's "one place to look": who needs their phone in each phase, and what for |
| `lib/analytics.ts` | `track()`; adds `screen: tv/phone` |
| `lib/gathering/observe.ts` | Reports each portrait drawing to PostHog AI observability for evaluations |
| `app/api/portrait/route.ts` | Draws a portrait with Cloudflare Workers AI (needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`) |
| `lib/gathering/look.ts`, `portrait.ts` | Portrait prompt, word list, pre-drawn library matching; the phone's ink-on-paper clean-up and upload |
| `supabase/migrations/0001_the_gathering.sql` | The whole database: tables, RLS, RPCs, game rules |

### Sound

- **On by default:** no "turn on sound" button (the user asked for none). Browsers still block sound until the page gets a click or key press, unless the site is allowed to autoplay.
  - **Zero clicks:** set the TV laptop's browser to allow sound for the site once. The README's "Sound on the TV" section has the steps.
  - **Otherwise:** the first click or key press anywhere on the TV wakes the audio engine and starts every audio element once (Safari needs that). Lines blocked before then are read at that moment.
- **Narrator:** reads every `[data-line]` on the TV screen once per screen.
- **Captions:** every narrated line is captioned word by word (`Caption` in `app/_ui/bits.tsx`), TikTok style: the spoken word is highlighted, words still to come are dimmed. `sound().progress(id)` says how far through a line the narrator is (the recording's playback position, or the browser voice's word events).
- **Music:** ducks under the narrator and during lock solving.
- **Mute and volume (TV bar):** the slider is a master volume for everything the TV plays (music at a quarter of it, the narrator, effects, Trapped Below's room sounds), applied live. Mute silences all of it at once, stops the narrator mid-line, and turns red; unmuting reads the screen's line again. Settings are saved per browser (`gathering:sound:v2`). Phones have their own quiet room sounds and vibration, not controlled by the TV.
- **"Look at your phone" on the TV:** Trapped Below's green banner (top right) and Marlowe's paper tag (bottom left) name who needs their phone right now and disappear as each person finishes.
- **Trapped Below:** its deep-water ambience (`public/audio/deep.mp3`) plays in the browser and all game. The narrator is the captain (`tb-*.mp3`) through a radio filter. Room sounds, creaks, the heartbeat and the phones' chime are made in the browser (`lib/gathering/deep.ts`).

## Analytics (PostHog)

- **Project:** "Default project", id 654207.
- **Dashboards:**
  - "The Gathering: game health" (https://us.posthog.com/project/654207/dashboard/2231394): the whole game, every story, charts split by `story_name`. The headline is a funnel counted **per room**: `room_created → lobby_completed → story_entered → game_started → game_ended`.
  - "The Gathering: Murder at Marlowe Manor" (https://us.posthog.com/project/654207/dashboard/2397465): the `marlowe_*` events.
  - "The Gathering: Trapped Below" (https://us.posthog.com/project/654207/dashboard/2397473): the `trapped_*` events, including the air clock.
- **Two layers of events:** game-wide events (`game_started`, `game_ended`, `replay_chosen`...) have the same names and core properties in every story (`story`, `story_name`, `winner` = `group`/`traitor`, `game_number`); story events start with `marlowe_` or `trapped_`. A new story should send the game-wide ones from `useAnalytics` in `app/host/tv.tsx` and its own prefixed ones from its own hook.
- **Who sends what:** group events come from the TV only, so each counts once per room; per-player events come from phones. Nothing players type is sent, except the portrait description: each drawing goes to PostHog AI observability (`lib/gathering/observe.ts`) as an `$ai_generation` so the **Evaluations** tab can score it (README, "Evaluating the portraits"). The two AI judges need a Gemini key added in PostHog (Bring your own key); the free "Portrait was drawn" check is on.
- **Events:** the full list and their properties are in the README (Analytics section).
- **Old events:** before November 2026 the story events had no prefix (`lock_opened`, `repair_done`...); that data stays under the old names. Events from the old "Alternate Universes" version (`universe_*`, `round_N_started`, `act_started`, `vote_submitted`, `choice_auto_selected`) are still in PostHog and not yet hidden.

## How we work (preferences)

- **Branches:**
  - Push straight to `claude/lucid-heisenberg-cgg0ll` (the deploy branch) unless told otherwise. No PR unless asked.
  - `claude/the-gathering` tracks the same work.
- **Demo-only requests** ("just for the demo") mean: change the artifact only, not the code or branches.
- **Testing:** test changes in a real browser before pushing, and say what was tested.
- **Database changes:** say clearly when the user must re-run the SQL in Supabase. They do it by hand.
- **PostHog:** commands may run without asking. `.claude/settings.local.json` allows them, and it's gitignored.

## Testing notes

A local harness was used during development. It lives outside the repo, so rebuild it if needed:

- **Database:** local Postgres 16 with a Supabase stub (auth schema, roles, `auth.uid()`) and the migration loaded.
- **Fake Supabase:** a small Node server that answers `/rest/v1/rpc/*` and table reads against that database.
- **App build:** build with `NEXT_PUBLIC_SUPABASE_URL` pointing at the fake server, then `next start -p 3100`.
- **Playwright:** scripts drive one TV and 4 phones through a whole game.

Things to know when testing:

- **Sound in tests:** Playwright turns off the browser's sound blocking and counts page loads as a click, so tests never see real autoplay rules. Imitate them with an init script that rejects `play()` with `NotAllowedError`:
  - **Chrome rule:** no sound until the page's first click.
  - **Safari rule:** an element plays only once a click has started it. This applies to Safari and to every iPhone/iPad browser.

  The narrator reuses one audio element, which a click starts once, for exactly this reason.
- **PostHog in tests:** PostHog drops headless browsers as bots. To capture events in tests, override `navigator.webdriver` and `userAgentData`.
- **Stopping processes:** don't use `pkill -f` or `pgrep -f`; they match their own shell. Kill by PID instead.

## Open items

- **Trapped Below narration:** new captain lines have no recordings yet, so the browser's voice reads them: `tb-brief-pairs`, `tb-brief-hands`, `tb-brief-sab2`, `tb-brief-vote`, `tb-brief-win`, `tb-brief-hatch2`, `tb-skip2`, `tb-logs-first`, `tb-riddle`. Record them (ElevenLabs) into `public/narration/`. If a recording's length changes, update `BRIEF_BEATS`/`BRIEF_SECS` and `tb_brief_secs()` together.
- **Trapped Below with 3 players:** everyone is in the one trio, so each repair is about someone in it (a partner of the lead). Those repairs test honesty more than friendship.
- **Trapped Below:** the air numbers (8:00 start, bonuses) need tuning from real games (see the Trapped Below dashboard: `trapped_game_ended` and `trapped_round_ended`).
- **Old PostHog events:** hide them (see Analytics).
- **The dashboard:** fills in once games are played on the live site.
