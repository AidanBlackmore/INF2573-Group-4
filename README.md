# Mall Night (connection prototype)

A proof of concept for a Jackbox-style party game: one shared screen on a TV, phones as controllers. It only proves that the setup works. There is no AI.

- `/host`: the shared screen. Open it on a laptop connected to the TV.
- `/play/CODE`: the phone controller. Players get there by scanning the QR code or typing the room code on the home page.

Phones and the laptop never talk to each other directly. Every action goes to Supabase, and Supabase Realtime tells each screen when something changed. Each screen then reloads the current state from the database. That is also how a phone recovers after a refresh or after the screen locks.

## How it is built

- Next.js (App Router), TypeScript, Tailwind
- Supabase: Postgres, Realtime, Anonymous Auth (every device signs in as a guest)
- `qrcode.react` for the QR code

The whole database setup is in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql):

- **Tables:** `rooms` (code, host, phase, round), `players`, `choices`.
- **Only the server writes.** Devices can only read tables. Every action (create room, join, start round, submit, reveal) is a database function that checks the request first. For example, a submission is only accepted if you are in the room, the round is open, and the player you picked is in the room. A second tap is ignored, so you get one choice per player per round.
- **Choices are private (Row Level Security).** You can read your own choice. You can read other people's choices only after the room phase is `revealed` for that round. The host screen sees who has submitted through `players.submitted_round`, not by reading choices.
- **The reveal happens automatically** once everyone has submitted, or when the host clicks Reveal now.

## Run it locally

You need Node.js 20 or newer.

1. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and publishable key. You find them in the Supabase dashboard under **Project Settings > API Keys**.
2. In the Supabase dashboard, open **Authentication > Sign In / Providers** and turn on **Allow anonymous sign-ins**.
3. Run the SQL in `supabase/migrations/0001_init.sql` once. Paste it into **SQL Editor** and click **Run**.
4. Install and start the app:

```bash
npm install
npm run dev
```

### Test with real phones on the same Wi-Fi

`npm run dev` listens on every network interface, so other devices on your Wi-Fi can reach it. The terminal prints a **Network** address, for example `http://192.168.1.23:3000`.

1. On the laptop, open **`http://<that address>/host`**, not `localhost`. The QR code uses the address the host page was opened with. A phone cannot open `localhost`, because on a phone that means the phone itself.
2. Scan the QR code with each phone's camera.

If phones cannot load the page: check that they are on the same Wi-Fi as the laptop, and allow incoming connections for Node if macOS asks. University and guest Wi-Fi networks often block devices from talking to each other. In that case, use your phone's hotspot for the laptop and the other phones, or test the deployed Vercel version.

## Deploy to Vercel

1. Push the branch to GitHub.
2. On [vercel.com](https://vercel.com), sign in with GitHub, click **Add New > Project**, and import the repository. If the code is not on the default branch, change the production branch afterwards under **Settings > Git**.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Click **Deploy**. Open `https://<your-project>.vercel.app/host` on the laptop. The QR code then points to the public URL, so phones can join from any network.

## Test checklist

- [ ] Open `/host` and click **Create game**. A room code and a QR code appear.
- [ ] Phone 1 scans the QR code and joins as "Mary". Mary appears on the host screen without a refresh.
- [ ] Phone 2 joins as "Alex". **Start round** becomes available (it needs 2 players).
- [ ] Click **Start round**. The scenario shows on the host screen. Both phones show the list of names.
- [ ] Phone 1 picks and submits, tapping Submit quickly twice. The phone shows "Waiting for others…". On the host screen, Mary gets a check, but her choice is not shown.
- [ ] Refresh phone 2 in the middle of the round, or lock and unlock it. It comes back as Alex, still in the choosing step, without asking for a name again.
- [ ] Phone 2 submits. The host screen reveals who chose whom, plus counts like "2 chose Alex".
- [ ] Click **New round**. The checks reset and both phones can choose again.
- [ ] Optional: start a round and click **Reveal now** before everyone has chosen. Players who did not submit show as "did not choose".
- [ ] Optional: refresh the host laptop. It returns to the same room.
