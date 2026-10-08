# Alternate Universes (party game prototype)

A Jackbox-style party game: one shared screen on a TV, phones as controllers. Pick one of four universes on the shared screen. Each universe is a pre-written episode in four acts. There is no AI yet.

- `/host`: the shared screen. Open it on a laptop connected to the TV.
- `/play/CODE`: the phone controller. Players get there by scanning the QR code or typing the room code on the home page.

Phones and the laptop never talk to each other directly. Every action goes to Supabase, and Supabase Realtime tells each screen when something changed. Each screen then reloads the current state from the database. That is also how a phone recovers after a refresh or after the screen locks.

## How a game works

The laptop page is the shared screen. There is no separate host: whoever is next to the laptop clicks its buttons.

1. Create a room on the laptop. Players join (2 to 6). Once 2 have joined, the screen shows the four universes. Pick one and click **Start**.
2. Each act: the scenario shows on the TV, everyone picks secretly on their phone, and the TV shows who has submitted (not what). When everyone has chosen, or someone clicks **Reveal now**, all choices are revealed together, followed by the outcome. Click **Next act** to continue.
3. Acts 1 and 4 are about picking a person (anyone, including yourself). Acts 2 and 3 have options A, B and C.
4. Split rules: **Together** means everyone chose the same. **Majority** means one answer got more than half the votes. **Divided** means no answer got more than half. If the most votes are tied, click **Vote again**: everyone re-votes on their phone, choosing only between the tied answers. If the re-vote ties again, click the winner on the screen. Ties are never broken automatically. The split type (and the opener) comes from the first vote; re-votes do not count in the ending recap.
5. After act 4, the ending recap shows counts only (never motives), plus **Play another universe** (back to the picker, same players) and **Replay this one**.

## Where things live

- **Story content:** [`content/universes.ts`](content/universes.ts). All four universes, every scenario, opener and outcome. Add or edit a universe here without touching game logic. `{winner}` and `{runner_up}` are filled in automatically.
- **Game rules:** [`lib/game.ts`](lib/game.ts). Split rules, ties, outcome text and the recap. `getOpener()` is the placeholder for a future AI-generated opener.
- **Screens:** `app/host/` (shared screen) and `app/play/[code]/` (phone).
- **Database:** [`supabase/migrations/`](supabase/migrations). Run the files in order.

## Privacy and server rules

- **Only the server writes.** Devices can only read tables. Every action (create room, join, start a universe, submit, reveal, re-vote, next act, pick a winner) is a database function that checks the request first. Examples: only the laptop that created the room can run the game, you can only submit while an act is open, a person pick must be someone in the room, and an option must be one of the act's options. A second tap is ignored, so you get one choice per player per act. Rooms are limited to 6 players.
- **Choices are private (Row Level Security).** You can read your own choice. Other people's choices for an act only become readable to the room once that act is revealed. The TV sees who has submitted through `players.submitted_round`, not by reading choices.

## Environment variables

| Name | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | PostHog project API key. Without it, analytics is skipped. |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com` |
| `FEEDBACK_URL` | no | Link for "Give feedback" on the shared screen. Hidden if empty. |

PostHog records pageviews plus `universe_selected` (`universe_id`) and `act_started` (`universe_id`, `act`).

On Vercel, changes to environment variables only apply after a redeploy (**Deployments**, then **...** next to the latest deployment, then **Redeploy**).

## Run it locally

You need Node.js 20 or newer.

1. Copy `.env.example` to `.env.local` and fill in the values. Find the Supabase ones in the Supabase dashboard under **Project Settings > API Keys**.
2. In the Supabase dashboard, open **Authentication > Sign In / Providers** and turn on **Allow anonymous sign-ins**.
3. Run each file in `supabase/migrations/` once, in order. Paste it into **SQL Editor** and click **Run**.
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

1. On the laptop, open **`http://<your IP>:3000/host`**, for example `http://192.168.1.23:3000/host`, not `localhost`. The QR code uses the address the shared screen was opened with. A phone cannot open `localhost`, because on a phone that means the phone itself.
2. Scan the QR code with each phone's camera.

University and guest Wi-Fi networks often block devices from talking to each other. In that case, test the deployed Vercel version instead.

## Deploy to Vercel

Vercel redeploys automatically every time the `nextjs-poc` branch is pushed to GitHub.

First-time setup:

1. On [vercel.com](https://vercel.com), sign in with GitHub, click **Add New > Project**, and import the repository.
2. Before clicking Deploy, open **Environment Variables** and add the variables from the table above.
3. Click **Deploy**. Open `https://<your-project>.vercel.app/host` on the laptop. The QR code then points to the public URL, so phones can join from any network.

## Test checklist

- [ ] Open `/host` and click **Create game**. A room code and a QR code appear.
- [ ] Two phones join. They appear on the TV without a refresh, and the phones say "A universe is being chosen on the shared screen…".
- [ ] The four universe cards appear once 2 players have joined. Pick one and click **Start**.
- [ ] Act 1: the phones show everyone's names. Submit on one phone, tapping twice quickly. The TV shows a check for that player but not their pick.
- [ ] Refresh the other phone mid-act. It comes back as the same player, still able to choose.
- [ ] When everyone has chosen, the TV reveals the choices and the outcome with the right names filled in.
- [ ] Act 2: the phones show options A, B and C. Make two players choose differently (a 1-1 tie). The TV shows **Vote again**, and **Next act** stays disabled. Click it: the phones show only the tied options. If the re-vote ties again, click the winner on the screen.
- [ ] Finish act 4 and click **See the ending**. Check the recap counts against what everyone chose.
- [ ] **Replay this one** starts act 1 again. **Play another universe** goes back to the picker with the same players.
- [ ] Optional: refresh the laptop mid-game. It returns to the same room and act.
- [ ] Optional: a 7th phone tries to join and sees "This room is full".
