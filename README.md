# The Gathering

"How well do you know your friends?" A party game for 3 to 6 players. One shared screen on a TV, phones as controllers. Everyone joins The Gathering, then the group picks a story to play together. The first story is **Murder at Marlowe Manor**: one of you is secretly the murderer, and everyone else has to work out who before it's too late. **Sabotage on Station Zero** is next (it can be browsed and has its own music, but can't be played yet).

Live: **https://inf-2573-group-4.vercel.app** (the TV is `/host`).

- `/host`: the shared screen (the TV). Open it on a laptop connected to the TV. It also plays the music, the narrator and the sound effects.
- `/play/CODE`: the phone. Players get there by scanning the QR code on the TV, or by typing the room code on the home page.

Phones and the laptop never talk to each other directly. Every action goes to Supabase, and Supabase Realtime tells each screen when something changed. Each screen then reloads what it is allowed to see. That is also how a phone recovers after a refresh or after the screen locks.

## What is in this repo

- **The repo root** is the current game (Next.js + Supabase). This is what runs and what Vercel deploys.
- **`research/`**: interview transcripts, interview synthesis, opportunity solution tree and product brainstorming.
- **`legacy/express-ai-gm/`**: the earlier Express + Socket.io version with the AI Game Master, casting quiz and secret chapters. Archived as-is, with its own README for running it.

## How a game works

1. **Join The Gathering.** Open `/host` on the laptop. It shows the title, a QR code, the address (`inf-2573-group-4.vercel.app`) and a room code (like `OAK47`). Every time the page loads it opens a new room with a new code. Each phone scans the QR code (or types the code into the five boxes on the home page), then picks a **name and one of six colours** (a colour someone has is faded) and taps **I'm in**. Their name tag appears on the TV. With 3 or more in, the host taps **We're in** (on the TV, or on the host's phone: the first player in is the host). Anyone who joined the room but didn't finish is left out of this gathering.
2. **Pick a story.** The TV becomes a full-screen story browser. Anyone can swipe on their phone (or use the arrows and thumbnails on the TV) and every screen follows, with the new story wiping in over the old one. Marlowe Manor brings rain, lightning and its music; Station Zero has drifting dust and its own looping track. The host taps **Enter this story** to step in.
3. **Inside Marlowe Manor**, each player picks one of six detective portraits and answers **three questions** ("What's your most irrational fear?"). Players can shuffle to a different question but must answer to continue. Answers are private and final.
4. **Start the night** (on the TV, or on the host's phone: the first player to join gets host controls). Each phone opens a sealed envelope with its secret role: one **murderer**, everyone else **detectives**. The night starts once everyone has tapped **Got it**.
5. **Each round is an hour of the night** (nine o'clock to dawn). Everyone is split into pairs (a trio if odd), with new partners each round. Each pair goes to a room of the house and opens a **lock** together. Each lock needs both phones:
   - **Fuse box:** one phone sees the wires, the other has the manual.
   - **Charades** and **Sketch:** one phone sees what to act or draw, the other types the guess.
   - **Two truths and a lie:** one player tells three things about themselves, the others spot the lie. Every round, one pair gets this lock.
6. **Behind every lock is a torn note**, and each partner sees half. Every answer from the start is a note somewhere in the house; the murderer's say "the murderer" and everyone else's say "an innocent person". One pair finds one of the murderer's notes each round, while they last. Locks nobody opens keep their notes for later rounds.
7. **The murderer** has secret moves on their phone: **forge a note** once (a fake secret that turns up as one of theirs) and **strike someone** in even rounds. The person who was with the victim looks guilty.
8. **The meeting.** When time runs out (or the host calls it), everyone gathers. If a murderer's note turned up or someone died, the TV shows the notes and the group talks it through, then everyone **votes** on their phone (or skips). The TV counts the votes one mark at a time, then the verdict. If nothing turned up, there's no vote that round.
9. **Ghosts.** Killed or voted out players become ghosts: they still pair up and open locks, but can't vote.
10. **The end.** The detectives win by voting out the murderer. The murderer wins when only one detective is left. The TV then reveals whose every note was. **Play again** starts a new night with the same players and answers; **Choose another story** goes back to the story browser with the same group.

Every timer is 2 minutes (locks, discussion and vote). The host's phone can add a minute.

## Where things live

- **Database and rules:** [`supabase/migrations/0001_the_gathering.sql`](supabase/migrations/0001_the_gathering.sql). Every rule runs here: joining with a name and colour, the story browser, pairing, locks, notes, the murderer's moves, votes and the ending. It also holds the charades and sketch words. To change the timers, change the `task_secs`, `talk_secs` and `vote_secs` defaults on `rooms`.
- **Story and text:** [`lib/gathering/content.ts`](lib/gathering/content.ts). The list of stories (`STORIES`: title, art, colours, sky and music for each), the questions, the story for each hour, every narrated line, room names and the floor plan.
- **Screens:** [`app/host/tv.tsx`](app/host/tv.tsx) (the TV) and [`app/play/[code]/phone.tsx`](app/play/[code]/phone.tsx) (the phone). Shared pieces (avatars, timer ring, floor plan, rain) are in [`app/_ui/`](app/_ui). The design system is [`app/gathering.css`](app/gathering.css).
- **Sound:** [`lib/gathering/sound.ts`](lib/gathering/sound.ts). Music, narrator and sound effects, TV only.
- **Images, music and narration:** [`public/`](public).
  - `public/figma/`: backgrounds, portraits, clue art and paper ephemera from the Figma design system.
  - `public/audio/ambience.mp3`: Marlowe Manor's music. It plays on the manor's page in the story browser and all night inside the story.
  - `public/audio/station.mp3`: Station Zero's music, while it's on screen in the story browser.
  - Both loop by crossfading the end of the track into the start. Switching stories fades one out and the other in.
  - `public/narration/<line>.mp3`: the narrator (ElevenLabs, "Harry"). One file per line in `NARRATION` in `content.ts`. If a file is missing, the browser's own voice reads that line.
  - `public/sfx/<name>.mp3` (optional): recorded sound effects (`thunder`, `lock`, `chime`, `scream`, `sting`, `gavel`, `bark`, `heartbeat`, `tick`). Without them, the sounds are synthesised in the browser.

## Privacy and server rules

- **Only the server writes.** Devices can only read rooms and the players in their own room. Every action (join, pick a portrait, answer, open a lock, forge, strike, vote, next) is a database function that checks the request first. Examples: only the TV or the host's phone can move the game on, only the lead in a pair can see what to act or draw, only the murderer can forge or strike, and ghosts can't vote.
- **Secrets stay on the server.** Who the murderer is, the notes, the lock answers and the votes are in tables no device can read. Each screen reads its own slice through `get_view()`: the TV gets the public picture, each phone also gets its own role, its side of its lock and its half of the note. Whose note was whose only comes out at the end.

## Environment variables

| Name | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | PostHog project API key. Without it, analytics is skipped. |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com` |
| `FEEDBACK_URL` | no | "Give feedback" link on the TV's ending screen. Hidden if empty. |
| `NEXT_PUBLIC_SITE_URL` | no | Where the TV's QR code and "or go to" line send phones. Defaults to `https://inf-2573-group-4.vercel.app`. |

PostHog records pageviews plus these events, all sent from the TV (so each is counted once per game) and all with `room_id`, `round` and `players`:

| Event | When | Extra properties |
|---|---|---|
| `stories_opened` | Everyone's in and the story browser opens | |
| `story_entered` | The group steps into a story | `story` (`marlowe`) |
| `game_started` | Roles are dealt | |
| `round_started` | Each round (hour) starts | `pairs` |
| `lock_opened` | A pair opens their lock | `lock_type` (`fuse`, `charade`, `sketch` or `lie`), `tries` (failed tries first) |
| `round_quiet` | A round ends with no murderer's note and no death, so no vote | |
| `meeting_called` | The group gathers to talk | `death`, `notes_found` |
| `vote_revealed` | The verdict is shown | `ejected`, `was_murderer`, `tie` |
| `game_ended` | The ending | `outcome` (`detectives` or `murderer`), `rounds` |

A funnel of `stories_opened → story_entered → game_started → round_started → game_ended` shows where groups stop. `lock_opened` by `lock_type` with `tries` shows which locks are too hard.

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
   Then open `/host` on the laptop.
2. Scan the QR code with each phone's camera.

University and guest Wi-Fi networks often block devices from talking to each other. In that case, test the deployed Vercel version instead.

## Deploy to Vercel

Vercel redeploys automatically every time the `nextjs-poc` branch is pushed to GitHub.

First-time setup:

1. On [vercel.com](https://vercel.com), sign in with GitHub, click **Add New > Project**, and import the repository.
2. Before clicking Deploy, open **Environment Variables** and add the variables from the table above.
3. Click **Deploy**. Open `https://inf-2573-group-4.vercel.app/host` on the laptop. The QR code points to that address, so phones can join from any network. If the project lives at a different address, set `NEXT_PUBLIC_SITE_URL` to it.

## Test checklist

- [ ] Open `/host`. The title, a room code and a QR code appear. Scanning the QR code opens `inf-2573-group-4.vercel.app/play/CODE`.
- [ ] Three or four phones join, each with a name and a colour (a colour someone has is faded). Their tags appear on the TV without a refresh. **We're in** stays disabled until 3 are in. A phone that joined but didn't finish sees "Already started" after **We're in**.
- [ ] Swipe on a phone: the TV and every phone move to the next story with the wipe. On Marlowe Manor: rain, lightning and the manor's music. On Station Zero: dust and its own music, which keeps looping; **Enter** is disabled. Only the host's phone (or the TV) can enter.
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
