# Project context

A short brief for anyone (or any AI session) picking up this project, so the background doesn't have to be rediscovered each time. The README covers how to run, deploy and test; this file covers what we're building, why, and how we work. Keep it up to date when the direction changes.

## What this is

**The Gathering** is a party game for a group in one room: a shared screen (a laptop on a TV) plus everyone's phones. The TV shows a QR code; phones scan it to join, pick a name and a colour, then the group browses **stories** together and picks one. Each story is its own game world. The tagline is "How well do you know your friends?": the games are built on what players reveal about themselves.

- **Course:** INF2573, Group 4. Repo: `AidanBlackmore/INF2573-Group-4`.
- **Live site:** https://inf-2573-group-4.vercel.app. The front page is the TV screen.
- **Design:** Figma file "Alternative Universe" (https://www.figma.com/design/B2zj8NNZnGIC4sfuUkCJyz/Alternative-Universe?node-id=159-2). Exported art is in `public/figma/`.
- **Demo:** an interactive HTML demo of the whole flow was built as a Claude artifact (https://claude.ai/artifact/7QkRaGpmPjU6zF775igHt9). The app was then built to match it.

### Stories

1. **Murder at Marlowe Manor** (playable). 1891, a storm, Lord Fenwick face-down in the trifle. One player is secretly the murderer. Rain, lightning, the manor music and a recorded narrator. 3–6 players, about 25 minutes.
2. **Sabotage on Station Zero** (browsable, "Coming soon"). 2187 research station with a spy aboard. It has its own art, drifting-dust sky and looping music (`public/audio/station.mp3`), but it can't be entered yet.
3. Two "Coming soon" placeholder cards.

The story list lives in `STORIES` in `lib/gathering/content.ts`. Its order matches `rooms.focus` in the database.

## Direction and goals

- The game should be **quick to start**: open the site on the TV, scan, play. No accounts, no app.
- **The TV is the stage, phones are private.** Secrets (roles, notes, lock answers) only ever appear on the phone they belong to.
- **Atmosphere matters:** music per story, narration, weather, animated transitions between stories, following the Figma design closely.
- **More stories over time.** Marlowe Manor is the first. Station Zero is next in line, and story-viewing analytics are there to show which story to build next.
- **Measure what matters** with PostHog (below): can groups get in, which stories they want, whether the game is balanced and the right length, where groups give up, and whether they play again.

## How a game flows

TV route `/` (also `/host`); phones use `/play/CODE` (QR link, joins straight away) or `/join` (type the code).

1. **Join** (`join` phase): every TV page load creates a new room with a random code (e.g. `OAK47`). Phones join, set a name and one of six colours. With 3+ in, the host taps **We're in**. The first player in is the host, and the TV can also press every host button. Unfinished joiners are dropped.
2. **Browse** (`browse`): a full-screen story browser. Anyone can swipe and every screen follows. Only the host or the TV can **Enter this story**.
3. **Marlowe Manor:**
   - **`lobby`:** each player picks a detective portrait and answers 3 questions. They can shuffle a question, but must answer. Answers are final.
   - **`roles`:** a secret role arrives in an envelope: one murderer, the rest detectives.
   - **`tasks`:** rounds are hours of the night. Players pair up (a trio if odd) to open locks: fuse box, charades, sketch, or two truths and a lie. Behind each lock is a torn note, and each partner sees half. Every answer is a note somewhere in the house, and the murderer's notes are the clues.
   - **The murderer** can forge one note, and strike someone in even rounds.
   - **`discuss` / `meeting` / `tally` / `revealed`:** discussion and a vote when a clue or a body turned up; otherwise a `quiet` round.
   - **Ghosts** (killed or voted out) still open locks but can't vote.
   - **`ended`:** detectives win by voting out the murderer; the murderer wins when one detective is left.
4. **Ending:** **Play again** keeps the same story; **Choose another story** goes back to the browser with the same group.

## Tech

- **Next.js 16 (app router) + React 19.** It differs from older Next: read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`). React compiler lint rules apply: no `Date.now()` or ref writes during render, and no synchronous setState in effects.
- **Supabase:** Postgres, anonymous auth, Realtime.
  - **One migration:** `supabase/migrations/0001_the_gathering.sql`, run by hand in the Supabase SQL Editor. Re-running it wipes games in progress.
  - **Security:** RLS everywhere. Clients only call SECURITY DEFINER RPCs.
  - **Views:** each screen reads its own slice through `get_view(room_id)`. The database is the source of truth, so screens reload on Realtime events, on waking up, and every 4 s.
- **Vercel:** deploys the `claude/lucid-heisenberg-cgg0ll` branch.
- **PostHog:** `posthog-js`, set up in `instrumentation-client.ts`. Only pageviews and our own events.

### Key files

| File | What |
|---|---|
| `app/host/tv.tsx` | TV screens, sound cues, TV analytics hook (`useAnalytics`) |
| `app/page.tsx` | Front page: renders the TV |
| `app/join/page.tsx` | Type-a-code page |
| `app/play/[code]/phone.tsx` | Phone screens, QR auto-join, code boxes, phone analytics |
| `app/_ui/` | Shared pieces: `bits.tsx` (avatars, tags, timer ring, `Line`), `house.tsx` (floor plan), `weather.tsx` (rain/dust/stars canvas) |
| `app/gathering.css` | The design system |
| `lib/gathering/content.ts` | All story text: stories, questions, chapters, narration lines, rooms, locks |
| `lib/gathering/game.ts` | `View` types, `useGame` (live view), `act()` RPC helper, timers |
| `lib/gathering/sound.ts` | Music loops with crossfade, narrator (recordings in `public/narration/`, browser voice fallback), synthesised sound effects |
| `lib/analytics.ts` | `track()`; adds `screen: tv/phone` |
| `supabase/migrations/0001_the_gathering.sql` | The whole database: tables, RLS, RPCs, game rules |

### Sound

- **Unlocking:** browsers block audio until someone clicks the page. The TV shows a **Turn on sound** button until the first click. Lines blocked before then are read once sound is allowed.
- **Narrator:** reads every `[data-line]` on the TV screen once per screen.
- **Music:** ducks under the narrator and during lock solving.
- **Station Zero's music** plays while it's on screen in the browser.

## Analytics (PostHog)

- **Project:** "Default project", id 654207.
- **Dashboard:** "The Gathering: game health" (https://us.posthog.com/project/654207/dashboard/2231394), with 14 charts. The headline is a funnel counted **per room**: `room_created → lobby_completed → story_entered → game_started → game_ended`.
- **Who sends what:** group events come from the TV only, so each counts once per room; per-player events come from phones. Nothing players type is sent.
- **Events:** the full list and their properties are in the README (Analytics section).
- **Old events:** events from the old "Alternate Universes" version (`universe_*`, `round_N_started`, `act_started`, `vote_submitted`, `choice_auto_selected`) are still in PostHog and not yet hidden.

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

- **Sound in tests:** headless Chromium lets audio play without a click, so it won't catch autoplay problems. Simulate the block yourself.
- **PostHog in tests:** PostHog drops headless browsers as bots. To capture events in tests, override `navigator.webdriver` and `userAgentData`.
- **Stopping processes:** don't use `pkill -f` or `pgrep -f`; they match their own shell. Kill by PID instead.

## Open items

- **Station Zero:** its gameplay isn't built yet.
- **Old PostHog events:** hide them (see Analytics).
- **The dashboard:** fills in once games are played on the live site.
