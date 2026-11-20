-- The Gathering, and its stories: Murder at Marlowe Manor and Trapped Below.
--
-- One database file for the whole game. Run it once in the Supabase SQL Editor.
-- It is safe to run again, and on a project that still has the old Alternate
-- Universes tables: the first section removes them (and any games in progress).
--
-- How the game works
-- - The TV (host laptop) creates a room. Up to 6 phones scan the QR code (or
--   type the code), type a name and describe what they look like; a portrait
--   is drawn from that (app/api/portrait). Each player gets a colour
--   automatically. Once everyone's in, the group browses the stories together
--   and the host enters one.
-- - In Murder at Marlowe Manor, everyone picks a detective portrait and answers
--   three questions.
-- - One player is secretly the murderer. Every answer becomes a note hidden in
--   the house; the murderer's notes are the clues.
-- - Each round, players are split into pairs (a trio if odd). Each pair goes to
--   a room and opens a lock together (fuse box, charades, sketch, or two truths
--   and a lie). Behind it is a torn note: each partner sees half.
-- - The murderer can forge one fake note, and strike someone in even rounds.
-- - If a murderer's note turned up or someone died, everyone talks it through
--   and votes someone out. Killed or voted out players become ghosts: they
--   still open locks, but can't vote.
-- - Detectives win by voting out the murderer. The murderer wins when only one
--   detective is left.
-- - Trapped Below (a submarine with a saboteur aboard) has its own section
--   near the end of this file.
--
-- Security model
-- - Every device signs in with Supabase Anonymous Auth.
-- - Clients can read rooms and the players in their own room, nothing else.
--   Everything secret (the murderer, notes, lock answers, votes) lives in
--   tables no client can read. Each screen reads its own slice through
--   get_view(), which only returns what that screen is allowed to see.
-- - All writes go through the SECURITY DEFINER functions below, which check
--   every request on the server.
-- - Every change bumps rooms.version, so Realtime tells every screen to reload.

-- ---------------------------------------------------------------------------
-- Remove the old Alternate Universes game (no-op on a fresh project)
-- ---------------------------------------------------------------------------

drop table if exists
  public.tb_repairs, public.tb_crew, public.tb_games,
  public.mystery_events, public.mysteries, public.icebreaker_answers,
  public.choices, public.votes, public.pairs, public.notes, public.answers,
  public.games, public.players, public.rooms
  cascade;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'answer_icebreaker', 'auto_pick_expired', 'back_to_picker', 'create_room', 'end_universe',
        'get_mystery', 'is_room_member', 'join_room', 'murderer_action', 'mystery_accuse',
        'mystery_next', 'mystery_search', 'mystery_setup', 'next_act', 'resolve_tie', 'reveal_now',
        'start_revote', 'start_universe', 'submit_choice', 'vote_universe', 'start_round',
        -- This file's own functions, so it can be run again.
        'set_identity', 'pick_portrait', 'submit_answers', 'start_game', 'open_envelope', 'got_it',
        'cut_wire', 'guess_word', 'new_word', 'add_stroke', 'clear_sketch', 'choose_lie', 'spot_lie',
        'forge_note', 'strike', 'cast_vote', 'host_next', 'add_time', 'advance_if_due', 'get_view',
        'pick_color', 'set_name_color', 'use_draw', 'set_name_look', 'we_are_in', 'browse_story', 'enter_story', 'another_story',
        'sign_book', 'close_book',
        'tb_skip', 'tb_hold', 'tb_dive', 'tb_portrait', 'tb_crew_file', 'tb_start', 'tb_orders', 'tb_restart',
        'tb_pick', 'tb_bolt', 'tb_sonar', 'tb_rotate', 'tb_leak', 'tb_vote', 'tb_next', 'tb_tick'
      )
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end;
$$;

drop schema if exists private cascade;
create schema private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  -- 'join' and 'browse' are The Gathering's lobby and story browser; the rest are the story.
  phase text not null default 'join'
    check (phase in ('join', 'browse', 'lobby', 'roles', 'tasks', 'quiet', 'discuss', 'meeting', 'tally', 'revealed', 'ended',
                     -- Trapped Below.
                     'tb_brief', 'tb_dive', 'tb_crew', 'tb_orders', 'tb_watch', 'tb_hands', 'tb_talk', 'tb_vote', 'tb_verdict', 'tb_end')),
  -- The story on screen in the browser (0 = Marlowe Manor, 1 = Trapped Below), which way the last swipe went, and when.
  focus int not null default 0 check (focus between 0 and 3),
  focus_dir int not null default 1 check (focus_dir in (-1, 1)),
  focus_at timestamptz not null default now(),
  -- The story being played: 'marlowe' or 'station' (Trapped Below; its key from when it was called Station Zero).
  story text,
  round int not null default 0,
  -- When the current phase started (animations on every screen start from here).
  phase_at timestamptz not null default now(),
  -- Timed phases (tasks, discuss, meeting) end at the deadline.
  deadline timestamptz,
  total_secs int not null default 0,
  -- How long each timed phase lasts. Change the defaults to change the game.
  task_secs int not null default 120 check (task_secs between 20 and 600),
  talk_secs int not null default 120 check (talk_secs between 10 and 600),
  vote_secs int not null default 120 check (vote_secs between 10 and 600),
  -- Marlowe Manor's guest book: when it closed (everyone signed, or the host closed it). Null while guests sign.
  book_at timestamptz,
  -- Bumped on every change, so Realtime wakes every screen.
  version bigint not null default 0,
  created_at timestamptz not null default now()
);
create index rooms_host_id_idx on public.rooms (host_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Set on the "Who are you tonight?" step.
  name text check (char_length(name) between 1 and 12),
  -- The player's colour (1 to 6), given on joining and used for name tags everywhere.
  color int check (color between 1 and 6),
  -- What they look like, in their own words, and the portrait drawn from it:
  -- a link to the public "portraits" bucket, or a pre-drawn one in /portraits.
  look text check (char_length(look) <= 120),
  portrait_url text,
  -- Portraits drawn so far (see use_draw).
  draws int not null default 0,
  -- Set when the player taps "I'm in" (name and portrait done).
  joined_at timestamptz,
  -- Which of the six detective portraits (1 to 6), picked inside Marlowe Manor.
  portrait int check (portrait between 1 and 6),
  picked boolean not null default false,
  answered boolean not null default false,
  -- Opened the role envelope / tapped "Got it".
  opened boolean not null default false,
  ready boolean not null default false,
  -- Their signature in Marlowe Manor's guest book: strokes of [x, y] points in a 230 × 56 box.
  signature jsonb check (signature is null or (jsonb_typeof(signature) = 'array' and octet_length(signature::text) <= 40000)),
  signed_at timestamptz,
  -- Ghosts: 'killed' by the murderer or 'ejected' by the vote.
  dead text check (dead in ('killed', 'ejected')),
  dead_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create unique index players_room_name_idx on public.players (room_id, lower(name)) where name is not null;
create unique index players_room_portrait_idx on public.players (room_id, portrait) where portrait is not null;
create unique index players_room_color_idx on public.players (room_id, color) where color is not null;
create index players_user_id_idx on public.players (user_id);

-- Everything below is secret: no client can read these tables.

-- Each player's three answers. They become the notes hidden in the house.
create table public.answers (
  player_id uuid not null references public.players (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  idx int not null check (idx between 0 and 2),
  question text not null check (char_length(question) between 1 and 200),
  answer text not null check (char_length(answer) between 1 and 200),
  primary key (player_id, idx)
);
create index answers_room_id_idx on public.answers (room_id);

-- One row per game in progress.
create table public.games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  murderer_id uuid not null references public.players (id) on delete cascade,
  -- The murderer's one forged note.
  forged_note_id uuid,
  -- This round's strike: 'none' (not decided), 'wait' or 'struck'.
  kill_state text not null default 'none' check (kill_state in ('none', 'wait', 'struck')),
  kill_target uuid references public.players (id) on delete set null,
  -- Everyone who has been partners, as "id|id", so pairs change every round.
  partners text[] not null default '{}',
  -- Rooms whose lock stayed shut this round.
  stuck text[] not null default '{}',
  -- Who died this round, where, and who they were with.
  report jsonb,
  -- The vote: {counts: [{k, n}], ejected, tie, was_murderer}.
  result jsonb,
  outcome text check (outcome in ('detectives', 'murderer')),
  reason text
);

-- Every note: real answers (the murderer's are clues) and the forged one.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  question text not null,
  answer text not null,
  murderer boolean not null,
  forged boolean not null default false,
  -- 'left' (still hidden), 'held' (behind a lock this round) or 'found'.
  status text not null default 'left' check (status in ('left', 'held', 'found')),
  -- Hidden notes are found in this order (lowest first).
  queue_pos double precision not null default 0,
  found_round int,
  found_room text,
  found_by uuid[],
  found_at timestamptz
);
create index notes_room_id_idx on public.notes (room_id);

-- This round's pairs and their locks.
create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  idx int not null,
  members uuid[] not null,
  room_key text not null,
  note_id uuid references public.notes (id) on delete set null,
  lock_type text not null check (lock_type in ('lie', 'charade', 'sketch', 'fuse')),
  -- Who acts, draws or tells the lie (the other side guesses).
  lead uuid not null,
  solved boolean not null default false,
  tries int not null default 0,
  msg text not null default '',
  -- Charades and sketch: what to act or draw, and the words that count.
  say text,
  ok text[],
  strokes jsonb not null default '[]',
  -- Two truths and a lie: which of the three is the lie (0 to 2).
  lie int,
  -- Fuse box: four wire colours, top to bottom.
  wires text[],
  unique (room_id, round, idx)
);

create table public.votes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  voter_id uuid not null references public.players (id) on delete cascade,
  -- A player id, or 'skip'.
  target text not null,
  auto boolean not null default false,
  primary key (room_id, round, voter_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.games enable row level security;
alter table public.notes enable row level security;
alter table public.pairs enable row level security;
alter table public.votes enable row level security;

revoke all on public.rooms, public.players, public.answers, public.games, public.notes, public.pairs, public.votes
  from anon, authenticated;
grant select on public.rooms, public.players to authenticated;

-- True if the current user is the room's TV or has joined it.
-- SECURITY DEFINER so the players policy can use it without recursing.
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.rooms r where r.id = p_room_id and r.host_id = auth.uid())
      or exists (select 1 from public.players p where p.room_id = p_room_id and p.user_id = auth.uid());
$$;

-- Rooms hold only the code, phase, round and timer, so any signed-in device
-- may read them (a phone looks a room up by its code before joining).
create policy "rooms are readable by signed-in users"
  on public.rooms for select to authenticated
  using (true);

create policy "players are readable by the room"
  on public.players for select to authenticated
  using (user_id = (select auth.uid()) or public.is_room_member(room_id));

-- Realtime: every screen listens to its room and its players.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rooms, public.players;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content the server needs (the phones only ever see what they're dealt)
-- ---------------------------------------------------------------------------

-- Charades and sketches: what to act or draw, and the words that count as right.
create function private.word_bank(p_kind text)
returns table (say text, ok text[])
language sql
immutable
set search_path = ''
as $$
  select w.say, w.ok from (values
    ('charade', 'Brushing your teeth', array['brush', 'teeth', 'tooth']),
    ('charade', 'A butler serving tea', array['butler', 'tea', 'serv']),
    ('charade', 'Sneaking up the stairs', array['sneak', 'stair', 'tiptoe', 'creep']),
    ('charade', 'Blowing out birthday candles', array['candle', 'birthday']),
    ('charade', 'A thunderstorm', array['thunder', 'storm', 'lightning']),
    ('charade', 'Sleepwalking', array['sleepwalk']),
    ('charade', 'Playing the piano', array['piano']),
    ('charade', 'A detective with a magnifying glass', array['detective', 'magnif']),
    ('charade', 'A ghost haunting the hallway', array['ghost', 'haunt']),
    ('charade', 'Opening a bottle of champagne', array['champagne', 'cork', 'bottle']),
    ('charade', 'Taking a selfie', array['selfie', 'photo', 'picture']),
    ('charade', 'Riding a horse', array['horse']),
    ('charade', 'Fainting dramatically', array['faint', 'swoon']),
    ('charade', 'Fishing', array['fish']),
    ('charade', 'Walking a very naughty dog', array['dog', 'walk']),
    ('sketch', 'a candle', array['candle']),
    ('sketch', 'a key', array['key']),
    ('sketch', 'a ghost', array['ghost']),
    ('sketch', 'a skull', array['skull']),
    ('sketch', 'a clock', array['clock']),
    ('sketch', 'a crown', array['crown']),
    ('sketch', 'the moon', array['moon']),
    ('sketch', 'a spider', array['spider']),
    ('sketch', 'a birthday cake', array['cake']),
    ('sketch', 'an umbrella', array['umbrella']),
    ('sketch', 'a snake', array['snake']),
    ('sketch', 'a ladder', array['ladder']),
    ('sketch', 'a bat', array['bat']),
    ('sketch', 'a teapot', array['teapot', 'kettle']),
    ('sketch', 'a magnifying glass', array['magnif'])
  ) as w (kind, say, ok)
  where w.kind = p_kind;
$$;

-- The nine rooms of the house.
create function private.house_rooms()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['library', 'study', 'conservatory', 'ballroom', 'hall', 'dining', 'cellar', 'kitchen', 'billiards'];
$$;

create function private.random_wires()
returns text[]
language sql
volatile
set search_path = ''
as $$
  select array_agg((array['red', 'blue', 'yellow', 'white', 'black'])[1 + floor(random() * 5)::int])
  from generate_series(1, 4);
$$;

-- Fuse box manual. Returns which wire to cut, counted from 0.
--   If there are no red wires, cut the second wire.
--   Otherwise, if the last wire is white, cut the last wire.
--   Otherwise, if there is more than one blue wire, cut the last blue wire.
--   Otherwise, cut the first wire.
create function private.fuse_answer(p_wires text[])
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  n int := array_length(p_wires, 1);
  i int;
begin
  if not ('red' = any (p_wires)) then
    return 1;
  end if;
  if p_wires[n] = 'white' then
    return n - 1;
  end if;
  if (select count(*) from unnest(p_wires) w where w = 'blue') > 1 then
    for i in reverse n..1 loop
      if p_wires[i] = 'blue' then
        return i - 1;
      end if;
    end loop;
  end if;
  return 0;
end;
$$;

-- Letters only, lower case: "The Butler!" -> "thebutler".
create function private.norm(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^a-z]', '', 'g');
$$;

-- Every two-person combination in a group, as "id|id".
create function private.duos(p_group text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(least(a, b) || '|' || greatest(a, b)), '{}')
  from unnest(p_group) with ordinality x (a, i)
  join unnest(p_group) with ordinality y (b, j) on i < j;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.lock_room(p_room_id uuid)
returns public.rooms
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'You are not in this room';
  end if;
  return v_room;
end;
$$;

-- The caller's player in this room, or null for the TV.
create function private.me(p_room_id uuid)
returns public.players
language sql
stable
set search_path = ''
as $$
  select * from public.players where room_id = p_room_id and user_id = auth.uid();
$$;

-- The first player to join (tap "I'm in") is the host: their phone gets the same controls as the TV.
create function private.host_player(p_room_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.players where room_id = p_room_id order by joined_at nulls last, created_at, id limit 1;
$$;

create function private.require_controller(p_room public.rooms)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_room.host_id = auth.uid() then
    return;
  end if;
  if (private.me(p_room.id)).id is not distinct from private.host_player(p_room.id)
     and (private.me(p_room.id)).id is not null then
    return;
  end if;
  raise exception 'Only the host can do that';
end;
$$;

-- Moves the room to a phase. Timed phases get a deadline.
create function private.set_phase(p_room_id uuid, p_phase text, p_secs int default null)
returns void
language sql
set search_path = ''
as $$
  update public.rooms set
    phase = p_phase,
    phase_at = now(),
    deadline = case when p_secs is null then null else now() + make_interval(secs => p_secs) end,
    total_secs = coalesce(p_secs, 0),
    version = version + 1
  where id = p_room_id;
$$;

create function private.touch(p_room_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.rooms set version = version + 1 where id = p_room_id;
$$;

-- Put a note back at the front of its pile, so it turns up next.
create function private.requeue(p_note_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.notes n set
    status = 'left',
    queue_pos = coalesce((
      select min(o.queue_pos) from public.notes o
      where o.room_id = n.room_id and o.murderer = n.murderer and o.status = 'left' and o.id <> n.id
    ), 0) - 1
  where n.id = p_note_id;
$$;

-- Take the next hidden note from the murderer's pile or everyone else's.
create function private.take_note(p_room_id uuid, p_murderer boolean)
returns uuid
language sql
set search_path = ''
as $$
  update public.notes set status = 'held'
  where id = (
    select id from public.notes
    where room_id = p_room_id and murderer = p_murderer and status = 'left'
    order by queue_pos, id
    limit 1
  )
  returning id;
$$;

-- The game is over when the murderer is out, or only one detective is left.
create function private.finish_if_over(p_room_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_murderer public.players;
  v_crew int;
begin
  select * into v_game from public.games where room_id = p_room_id;
  select * into v_murderer from public.players where id = v_game.murderer_id;
  select count(*) into v_crew from public.players
  where room_id = p_room_id and dead is null and id <> v_game.murderer_id;

  if v_murderer.dead is not null then
    update public.games set outcome = 'detectives',
      reason = v_murderer.name || ' was voted out, and they were the murderer.'
    where room_id = p_room_id;
  elsif v_crew <= 1 then
    update public.games set outcome = 'murderer', reason = 'Only one detective is left. The murderer wins.'
    where room_id = p_room_id;
  else
    return false;
  end if;
  perform private.set_phase(p_room_id, 'ended');
  return true;
end;
$$;

-- A new round: fresh pairs, a room and a lock each, and a hidden note behind every lock.
create function private.start_round(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.games;
  v_ids text[];
  v_order text[];
  v_groups jsonb;
  v_best jsonb;
  v_best_score int := 2147483647;
  v_score int;
  v_n int;
  v_i int;
  v_rooms text[];
  v_kinds text[];
  v_group text[];
  v_members uuid[];
  v_kind text;
  v_note uuid;
  v_word record;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.games where room_id = p_room_id;

  update public.games set kill_state = 'none', kill_target = null, report = null, result = null, stuck = '{}'
  where room_id = p_room_id;

  -- Split everyone (ghosts too) into pairs, a trio if odd, avoiding past partners.
  select array_agg(id::text) into v_ids from public.players where room_id = p_room_id;
  v_n := array_length(v_ids, 1);
  for attempt in 1..300 loop
    exit when v_best_score = 0;
    select array_agg(x order by random()) into v_order from unnest(v_ids) x;
    v_groups := '[]';
    v_i := 1;
    while v_i <= v_n loop
      v_groups := v_groups || jsonb_build_array(to_jsonb(v_order[v_i:least(v_i + 1, v_n)]));
      v_i := v_i + 2;
    end loop;
    if jsonb_array_length(v_groups) > 1 and jsonb_array_length(v_groups -> -1) = 1 then
      v_groups := jsonb_set(v_groups - (-1), array[(jsonb_array_length(v_groups) - 2)::text],
        (v_groups -> -2) || (v_groups -> -1));
    end if;
    select coalesce(sum((
      select count(*) from unnest(private.duos(array(select jsonb_array_elements_text(g)))) d
      where d = any (v_game.partners)
    )), 0) into v_score
    from jsonb_array_elements(v_groups) g;
    if v_score < v_best_score then
      v_best := v_groups;
      v_best_score := v_score;
    end if;
  end loop;

  update public.games set partners = partners || (
    select coalesce(array_agg(d), '{}')
    from jsonb_array_elements(v_best) g,
         unnest(private.duos(array(select jsonb_array_elements_text(g)))) d
  ) where room_id = p_room_id;

  select array_agg(x order by random()) into v_rooms from unnest(private.house_rooms()) x;
  -- Every round one pair gets two truths and a lie, the getting-to-know-you lock.
  select array_agg(x order by random()) into v_kinds from unnest(
    array['lie'] || (select array_agg(y) from (
      select y from unnest(array['charade', 'sketch', 'fuse']) y order by random() limit jsonb_array_length(v_best) - 1
    ) s)
  ) x;

  for v_i in 0..jsonb_array_length(v_best) - 1 loop
    v_group := array(select jsonb_array_elements_text(v_best -> v_i));
    v_members := v_group::uuid[];
    v_kind := v_kinds[1 + v_i % array_length(v_kinds, 1)];
    -- One pair each round always finds one of the murderer's notes, while they last.
    v_note := null;
    if v_i = 0 then
      v_note := private.take_note(p_room_id, true);
    end if;
    if v_note is null then
      v_note := private.take_note(p_room_id, false);
    end if;
    if v_note is null then
      v_note := private.take_note(p_room_id, true);
    end if;

    insert into public.pairs (room_id, round, idx, members, room_key, note_id, lock_type, lead)
    values (p_room_id, v_room.round + 1, v_i, v_members, v_rooms[v_i + 1], v_note, v_kind,
            v_members[1 + floor(random() * array_length(v_members, 1))::int]);

    if v_kind in ('charade', 'sketch') then
      select * into v_word from private.word_bank(v_kind) order by random() limit 1;
      update public.pairs set say = v_word.say, ok = v_word.ok
      where room_id = p_room_id and round = v_room.round + 1 and idx = v_i;
    elsif v_kind = 'fuse' then
      update public.pairs set wires = private.random_wires()
      where room_id = p_room_id and round = v_room.round + 1 and idx = v_i;
    end if;
  end loop;

  update public.rooms set round = round + 1 where id = p_room_id;
  perform private.set_phase(p_room_id, 'tasks', v_room.task_secs);
end;
$$;

-- Time's up (or the host called it): the locks close and the house reports back.
create function private.end_tasks(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.games;
  v_pair public.pairs;
  v_victim_pair public.pairs;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.games where room_id = p_room_id;

  for v_pair in select * from public.pairs where room_id = p_room_id and round = v_room.round order by idx loop
    if v_pair.note_id is not null and not v_pair.solved then
      -- Notes behind a lock nobody opened go back into the house for a later round.
      perform private.requeue(v_pair.note_id);
    elsif v_pair.note_id is not null then
      update public.notes set status = 'found', found_round = v_room.round, found_room = v_pair.room_key,
        found_by = v_pair.members, found_at = clock_timestamp()
      where id = v_pair.note_id;
    end if;
  end loop;

  update public.games set stuck = coalesce((
    select array_agg(room_key order by idx) from public.pairs
    where room_id = p_room_id and round = v_room.round and not solved
  ), '{}') where room_id = p_room_id;

  if v_game.kill_state = 'struck' and v_game.kill_target is not null then
    update public.players set dead = 'killed', dead_at = now() where id = v_game.kill_target;
    select * into v_victim_pair from public.pairs
    where room_id = p_room_id and round = v_room.round and v_game.kill_target = any (members);
    update public.games set report = jsonb_build_object(
      'victim', v_game.kill_target,
      'room', v_victim_pair.room_key,
      'last_seen', to_jsonb(array_remove(v_victim_pair.members, v_game.kill_target))
    ) where room_id = p_room_id;
  end if;

  if private.finish_if_over(p_room_id) then
    return;
  end if;

  -- Nothing to talk about: no murderer's note found and nobody died.
  if not (v_game.kill_state = 'struck' and v_game.kill_target is not null)
     and not exists (
       select 1 from public.notes
       where room_id = p_room_id and status = 'found' and found_round = v_room.round and murderer
     ) then
    perform private.set_phase(p_room_id, 'quiet');
  else
    perform private.set_phase(p_room_id, 'discuss', v_room.talk_secs);
  end if;
end;
$$;

create function private.start_vote(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  delete from public.votes where room_id = p_room_id and round = v_room.round;
  perform private.set_phase(p_room_id, 'meeting', v_room.vote_secs);
end;
$$;

-- Count the votes. Anyone who hasn't voted skips.
create function private.reveal_votes(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_counts jsonb;
  v_top int;
  v_leaders text[];
begin
  select * into v_room from public.rooms where id = p_room_id;
  insert into public.votes (room_id, round, voter_id, target, auto)
  select p_room_id, v_room.round, p.id, 'skip', true
  from public.players p
  where p.room_id = p_room_id and p.dead is null
  on conflict do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('k', target, 'n', n) order by n desc, target), '[]'), max(n)
  into v_counts, v_top
  from (
    select v.target, count(*)::int as n
    from public.votes v
    join public.players p on p.id = v.voter_id and p.dead is null
    where v.room_id = p_room_id and v.round = v_room.round
    group by v.target
  ) c;
  select array_agg(c ->> 'k') into v_leaders from jsonb_array_elements(v_counts) c where (c ->> 'n')::int = v_top;

  update public.games set result = jsonb_build_object(
    'counts', v_counts,
    'ejected', case when array_length(v_leaders, 1) = 1 and v_leaders[1] <> 'skip' then v_leaders[1] end,
    'tie', coalesce(array_length(v_leaders, 1), 0) > 1
  ) where room_id = p_room_id;
  perform private.set_phase(p_room_id, 'tally');
end;
$$;

-- ---------------------------------------------------------------------------
-- Lobby
-- ---------------------------------------------------------------------------

-- Called by the TV. Codes look like OAK47.
create function public.create_room()
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_words text[] := array['OAK', 'ASH', 'ELM', 'FOG', 'INK', 'OWL', 'BAT', 'KEY', 'FIR', 'YEW',
                          'RYE', 'TEA', 'CUP', 'LOG', 'MAP', 'JAM', 'GIN', 'RUM', 'PIE', 'ORB'];
  v_code text;
  v_old text[];
  v_room public.rooms;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  -- Every load of the TV opens a new room, so free up codes: this TV's lobbies
  -- nobody started, and any room left idle for half a day.
  with gone as (
    delete from public.rooms
    where (host_id = v_uid and phase = 'join') or phase_at < now() - interval '12 hours'
    returning code
  )
  select coalesce(array_agg(code), '{}') into v_old from gone;
  for attempt in 1..50 loop
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int]
              || lpad(floor(random() * 100)::int::text, 2, '0');
    -- Never hand this TV back the code it just had.
    continue when v_code = any(v_old);
    begin
      insert into public.rooms (code, host_id) values (v_code, v_uid) returning * into v_room;
      return v_room;
    exception when unique_violation then
    end;
  end loop;
  raise exception 'Could not make a room code, please try again';
end;
$$;

-- Step 1 on the phone: the room code. Joining again returns the same player.
create function public.join_room(p_code text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_player public.players;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'That code doesn''t match. Check the TV.';
  end if;
  select * into v_player from public.players where room_id = v_room.id and user_id = v_uid;
  if found then
    return v_player;
  end if;
  if v_room.phase <> 'join' then
    raise exception 'This game has already started';
  end if;
  if (select count(*) from public.players where room_id = v_room.id) >= 6 then
    raise exception 'This game is full (6 players)';
  end if;

  -- The first free colour: players no longer pick one, their portrait tells them apart.
  insert into public.players (room_id, user_id, color)
  values (v_room.id, v_uid, (
    select min(c) from generate_series(1, 6) c
    where not exists (select 1 from public.players p where p.room_id = v_room.id and p.color = c)
  ))
  returning * into v_player;
  perform private.touch(v_room.id);
  return v_player;
end;
$$;

-- The Gathering: counts a portrait drawing. Called by /api/portrait with the player's
-- session before it asks Cloudflare, so nobody can draw more than 3 or outside a
-- room that's still joining (which also protects the free daily allowance).
create function public.use_draw(p_room_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'join' then
    raise exception 'This game has already started';
  end if;
  if v_player.draws >= 3 then
    raise exception 'That was your last drawing, so this portrait is yours.';
  end if;
  update public.players set draws = draws + 1 where id = v_player.id;
  return 3 - v_player.draws - 1;
end;
$$;

-- The Gathering: "Who's arriving?" A name, what you look like and your portrait, then "I'm in".
create function public.set_name_look(p_room_id uuid, p_name text, p_look text, p_portrait_url text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
  v_name text := btrim(coalesce(p_name, ''));
  v_look text := btrim(coalesce(p_look, ''));
  v_url text := btrim(coalesce(p_portrait_url, ''));
begin
  if v_player.id is null then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'join' then
    raise exception 'This game has already started';
  end if;
  if char_length(v_name) not between 1 and 12 then
    raise exception 'Type your name to continue.';
  end if;
  if char_length(v_look) > 120 then
    raise exception 'Keep your description under 120 characters.';
  end if;
  -- Only a pre-drawn portrait, or one this player uploaded to the portraits bucket.
  if not (v_url ~ '^/portraits/[a-z]+\.jpg$'
          or v_url like '%/storage/v1/object/public/portraits/' || auth.uid()::text || '/%') then
    raise exception 'Draw your portrait first.';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and lower(name) = lower(v_name)) then
    raise exception 'Someone here already has that name.';
  end if;
  update public.players
  set name = v_name, look = v_look, portrait_url = v_url, joined_at = coalesce(joined_at, clock_timestamp())
  where id = v_player.id returning * into v_player;
  perform private.touch(p_room_id);
  return v_player;
end;
$$;

-- "We're in": everyone who finished joining plays. Anyone who didn't is left out.
create function public.we_are_in(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase <> 'join' then
    return;
  end if;
  if (select count(*) from public.players where room_id = p_room_id and joined_at is not null) < 3 then
    raise exception 'Needs at least 3 players';
  end if;
  delete from public.players where room_id = p_room_id and joined_at is null;
  update public.rooms set focus = 0, focus_dir = 1, focus_at = now() where id = p_room_id;
  perform private.set_phase(p_room_id, 'browse');
end;
$$;

-- Anyone (the TV or a phone) can swipe through the stories; every screen follows.
-- p_to is the story to show (0 to 3); p_dir is the way the swipe went (1 or -1).
create function public.browse_story(p_room_id uuid, p_to int, p_dir int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  if v_room.phase <> 'browse' or p_to is null or p_to not between 0 and 3 or p_to = v_room.focus then
    return;
  end if;
  update public.rooms set focus = p_to, focus_dir = case when p_dir < 0 then -1 else 1 end, focus_at = now(),
    version = version + 1
  where id = p_room_id;
end;
$$;

-- "Enter this story": Murder at Marlowe Manor (story 0) or Trapped Below (story 1).
create function public.enter_story(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase <> 'browse' then
    return;
  end if;
  if v_room.focus not in (0, 1) then
    raise exception 'This story is coming soon';
  end if;
  -- Everyone starts with a different portrait, and can pick another.
  -- (Cleared first: the portraits are unique, and coming back from another story they're all taken.)
  update public.players set portrait = null where room_id = p_room_id;
  update public.players p set portrait = pick.k, picked = false
  from (
    select id, row_number() over (order by random()) as k
    from public.players where room_id = p_room_id
  ) pick
  where p.id = pick.id;
  if v_room.focus = 1 then
    -- Trapped Below: the captain's briefing first. Each story has its own questions.
    delete from public.tb_repairs where room_id = p_room_id;
    delete from public.tb_crew where room_id = p_room_id;
    delete from public.tb_games where room_id = p_room_id;
    insert into public.tb_games (room_id) values (p_room_id);
    update public.players set answered = false, opened = false, ready = false, dead = null, dead_at = null where room_id = p_room_id;
    update public.rooms set story = 'station', round = 0 where id = p_room_id;
    perform private.set_phase(p_room_id, 'tb_brief');
    return;
  end if;
  update public.players p set answered = exists (select 1 from public.answers a where a.player_id = p.id) where p.room_id = p_room_id;
  update public.rooms set story = 'marlowe' where id = p_room_id;
  perform private.set_phase(p_room_id, 'lobby');
end;
$$;

-- "Choose another story" at the end: back to the browser with the same people.
create function public.another_story(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase not in ('ended', 'tb_end') then
    return;
  end if;
  delete from public.votes where room_id = p_room_id;
  delete from public.tb_repairs where room_id = p_room_id;
  delete from public.tb_games where room_id = p_room_id;
  delete from public.pairs where room_id = p_room_id;
  delete from public.notes where room_id = p_room_id;
  delete from public.games where room_id = p_room_id;
  update public.players set opened = false, ready = false, dead = null, dead_at = null where room_id = p_room_id;
  update public.rooms set round = 0, story = null, focus_at = now() where id = p_room_id;
  perform private.set_phase(p_room_id, 'browse');
end;
$$;

-- Marlowe Manor, step 1: "Who are you tonight?" The detective portrait (the name is from the lobby).
create function public.set_identity(p_room_id uuid, p_name text, p_portrait int)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_player.id is null then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'The game has already started';
  end if;
  if char_length(v_name) not between 1 and 12 then
    raise exception 'Type your name to continue.';
  end if;
  if p_portrait is null or p_portrait not between 1 and 6 then
    raise exception 'Pick a detective';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and portrait = p_portrait) then
    raise exception 'That detective is taken';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and lower(name) = lower(v_name)) then
    raise exception 'Someone here already has that name';
  end if;
  update public.players set name = v_name, portrait = p_portrait, picked = true where id = v_player.id returning * into v_player;
  perform private.touch(p_room_id);
  return v_player;
end;
$$;

-- Picking a portrait before "That's me", so everyone else sees it as taken.
create function public.pick_portrait(p_room_id uuid, p_portrait int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null or v_room.phase <> 'lobby' or p_portrait not between 1 and 6 then
    return;
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and portrait = p_portrait) then
    raise exception 'That detective is taken';
  end if;
  update public.players set portrait = p_portrait where id = v_player.id;
  perform private.touch(p_room_id);
end;
$$;

-- Stepping into Marlowe Manor, every guest signs the visitors' book on their phone; the TV writes
-- each signature in. When the last guest has signed, the book closes (rooms.book_at) and the intro starts.
create function public.sign_book(p_room_id uuid, p_strokes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
  v_points int;
begin
  if v_player.id is null then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'lobby' or v_room.book_at is not null or v_player.signed_at is not null then
    return;
  end if;
  if jsonb_typeof(p_strokes) <> 'array' or jsonb_array_length(p_strokes) not between 1 and 40 then
    raise exception 'Sign first';
  end if;
  if exists (select 1 from jsonb_array_elements(p_strokes) s where jsonb_typeof(s) <> 'array') then
    raise exception 'That signature didn''t come through';
  end if;
  select coalesce(sum(jsonb_array_length(s)), 0) into v_points from jsonb_array_elements(p_strokes) s;
  if v_points < 2 or v_points > 1500 or octet_length(p_strokes::text) > 40000 then
    raise exception 'That signature didn''t come through';
  end if;
  update public.players set signature = p_strokes, signed_at = now() where id = v_player.id;
  if not exists (select 1 from public.players where room_id = p_room_id and joined_at is not null and signed_at is null) then
    update public.rooms set book_at = now() where id = p_room_id;
  end if;
  perform private.touch(p_room_id);
end;
$$;

-- Close the guest book without waiting for everyone (host or TV).
create function public.close_book(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase <> 'lobby' or v_room.book_at is not null then
    return;
  end if;
  update public.rooms set book_at = now() where id = p_room_id;
  perform private.touch(p_room_id);
end;
$$;

-- Steps 3 to 5: three answers, sent together at "Done". Final once sent.
create function public.submit_answers(p_room_id uuid, p_questions text[], p_answers text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'The game has already started';
  end if;
  if v_player.name is null then
    raise exception 'Pick your name first';
  end if;
  if v_player.answered then
    raise exception 'Your answers are already locked in';
  end if;
  if coalesce(array_length(p_questions, 1), 0) <> 3 or coalesce(array_length(p_answers, 1), 0) <> 3 then
    raise exception 'Answer all three questions';
  end if;
  for i in 1..3 loop
    if char_length(btrim(coalesce(p_questions[i], ''))) not between 1 and 200 then
      raise exception 'Missing question';
    end if;
    if char_length(btrim(coalesce(p_answers[i], ''))) not between 1 and 200 then
      raise exception 'Answer to continue.';
    end if;
    insert into public.answers (player_id, room_id, idx, question, answer)
    values (v_player.id, p_room_id, i - 1, btrim(p_questions[i]), btrim(p_answers[i]));
  end loop;
  update public.players set answered = true where id = v_player.id;
  perform private.touch(p_room_id);
end;
$$;

-- "Start the night" (and "Play again" with the same players and answers).
create function public.start_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_count int;
  v_murderer uuid;
begin
  perform private.require_controller(v_room);
  if v_room.phase not in ('lobby', 'ended') then
    raise exception 'The game is already running';
  end if;
  select count(*) into v_count from public.players where room_id = p_room_id;
  if v_count not between 3 and 6 then
    raise exception 'Needs 3 to 6 players';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and (name is null or not answered)) then
    raise exception 'Waiting for everyone to answer';
  end if;

  delete from public.votes where room_id = p_room_id;
  delete from public.pairs where room_id = p_room_id;
  delete from public.notes where room_id = p_room_id;
  delete from public.games where room_id = p_room_id;

  select id into v_murderer from public.players where room_id = p_room_id order by random() limit 1;
  insert into public.games (room_id, murderer_id) values (p_room_id, v_murderer);

  -- Every answer becomes a note somewhere in the house, in a random order.
  insert into public.notes (room_id, owner_id, question, answer, murderer, queue_pos)
  select p_room_id, a.player_id, a.question, a.answer, a.player_id = v_murderer, random()
  from public.answers a where a.room_id = p_room_id;

  update public.players set opened = false, ready = false, dead = null, dead_at = null where room_id = p_room_id;
  update public.rooms set round = 0 where id = p_room_id;
  -- Everyone reads their secret role first.
  perform private.set_phase(p_room_id, 'roles');
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create function public.open_envelope(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null or v_room.phase <> 'roles' then
    return;
  end if;
  update public.players set opened = true where id = v_player.id;
  perform private.touch(p_room_id);
end;
$$;

-- "Got it". The night starts once everyone is ready.
create function public.got_it(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null or v_room.phase <> 'roles' then
    return;
  end if;
  update public.players set opened = true, ready = true where id = v_player.id;
  if not exists (select 1 from public.players where room_id = p_room_id and not ready) then
    perform private.start_round(p_room_id);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Locks
-- ---------------------------------------------------------------------------

-- The caller's pair this round, locked for update. Errors if the lock can't be worked on.
create function private.my_pair(p_room_id uuid)
returns public.pairs
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
  v_pair public.pairs;
begin
  if v_room.phase <> 'tasks' then
    raise exception 'The locks are closed until the next round';
  end if;
  select * into v_pair from public.pairs
  where room_id = p_room_id and round = v_room.round and v_player.id = any (members)
  for update;
  if not found then
    raise exception 'You are not in a pair this round';
  end if;
  if v_pair.solved then
    raise exception 'This lock is already open';
  end if;
  return v_pair;
end;
$$;

create function public.cut_wire(p_room_id uuid, p_wire int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me uuid := (private.me(p_room_id)).id;
begin
  if v_pair.lock_type <> 'fuse' then
    raise exception 'This is not a fuse box';
  end if;
  -- Half the pair sees the wires, the other half the manual.
  if (array_position(v_pair.members, v_me) - 1) % 2 <> 0 then
    raise exception 'Your partner has the wires';
  end if;
  if p_wire = private.fuse_answer(v_pair.wires) then
    update public.pairs set solved = true, msg = '' where id = v_pair.id;
  else
    update public.pairs set tries = tries + 1, msg = 'Zzzt! Wrong wire. The panel rewired itself.',
      wires = private.random_wires()
    where id = v_pair.id;
  end if;
  perform private.touch(p_room_id);
  return p_wire = private.fuse_answer(v_pair.wires);
end;
$$;

-- Charades and sketch: the partner types a guess.
create function public.guess_word(p_room_id uuid, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me uuid := (private.me(p_room_id)).id;
  v_typed text := left(btrim(coalesce(p_guess, '')), 60);
  v_ok boolean;
begin
  if v_pair.lock_type not in ('charade', 'sketch') then
    raise exception 'Nothing to guess here';
  end if;
  if v_me = v_pair.lead or v_typed = '' then
    return false;
  end if;
  v_ok := char_length(private.norm(v_typed)) > 1
    and exists (select 1 from unnest(v_pair.ok) w where position(private.norm(w) in private.norm(v_typed)) > 0);
  if v_ok then
    update public.pairs set solved = true, msg = '' where id = v_pair.id;
  else
    update public.pairs set tries = tries + 1, msg = '“' || v_typed || '” isn''t it. Keep going.' where id = v_pair.id;
  end if;
  perform private.touch(p_room_id);
  return v_ok;
end;
$$;

-- The actor or artist swaps to a different one.
create function public.new_word(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_word record;
begin
  if v_pair.lock_type not in ('charade', 'sketch') or v_me.id <> v_pair.lead then
    return;
  end if;
  select * into v_word from private.word_bank(v_pair.lock_type) w where w.say <> v_pair.say order by random() limit 1;
  update public.pairs set say = v_word.say, ok = v_word.ok, strokes = '[]', tries = tries + 1,
    msg = v_me.name || ' picked a new one.'
  where id = v_pair.id;
  perform private.touch(p_room_id);
end;
$$;

-- Sketch: each finished stroke is saved, so the partner's phone shows the drawing.
-- p_points is [[x, y], ...] on a 300 x 200 pad.
create function public.add_stroke(p_room_id uuid, p_points jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me uuid := (private.me(p_room_id)).id;
begin
  if v_pair.lock_type <> 'sketch' or v_me <> v_pair.lead then
    return;
  end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) not between 1 and 600
     or jsonb_array_length(v_pair.strokes) >= 300 then
    return;
  end if;
  update public.pairs set strokes = strokes || jsonb_build_array((
    select jsonb_agg(jsonb_build_array(
      round(least(greatest((pt ->> 0)::numeric, 0), 300), 1),
      round(least(greatest((pt ->> 1)::numeric, 0), 200), 1)))
    from jsonb_array_elements(p_points) pt
    where jsonb_typeof(pt) = 'array'
  )) where id = v_pair.id;
  perform private.touch(p_room_id);
end;
$$;

create function public.clear_sketch(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me uuid := (private.me(p_room_id)).id;
begin
  if v_pair.lock_type = 'sketch' and v_me = v_pair.lead then
    update public.pairs set strokes = '[]' where id = v_pair.id;
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- Two truths and a lie: the teller secretly marks which of their three is the lie.
create function public.choose_lie(p_room_id uuid, p_lie int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me uuid := (private.me(p_room_id)).id;
begin
  if v_pair.lock_type <> 'lie' or v_me <> v_pair.lead or v_pair.lie is not null or p_lie not between 0 and 2 then
    return;
  end if;
  update public.pairs set lie = p_lie, msg = '' where id = v_pair.id;
  perform private.touch(p_room_id);
end;
$$;

-- The others pick the lie. Wrong, and the roles swap.
create function public.spot_lie(p_room_id uuid, p_pick int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.pairs := private.my_pair(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_lead_name text;
begin
  if v_pair.lock_type <> 'lie' or v_me.id = v_pair.lead or v_pair.lie is null or p_pick not between 0 and 2 then
    return false;
  end if;
  if p_pick = v_pair.lie then
    update public.pairs set solved = true, msg = 'Caught it: number ' || (p_pick + 1) || ' was the lie.' where id = v_pair.id;
    perform private.touch(p_room_id);
    return true;
  end if;
  select name into v_lead_name from public.players where id = v_pair.lead;
  update public.pairs set tries = tries + 1, lead = v_me.id, lie = null,
    msg = 'Fooled! The lie was number ' || (v_pair.lie + 1) || '. Swap: ' || v_me.name || ' tells, '
          || v_lead_name || ' guesses.'
  where id = v_pair.id;
  perform private.touch(p_room_id);
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- The murderer
-- ---------------------------------------------------------------------------

create function private.require_murderer(p_room_id uuid)
returns public.games
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.games;
begin
  select * into v_game from public.games where room_id = p_room_id for update;
  if v_me.id is null or v_game.murderer_id is distinct from v_me.id or v_me.dead is not null then
    raise exception 'Only the murderer can do that';
  end if;
  if v_room.phase <> 'tasks' then
    raise exception 'Wait for the next round';
  end if;
  return v_game;
end;
$$;

-- A fake secret that sounds like someone else, found later as one of the murderer's notes. Once per game.
create function public.forge_note(p_room_id uuid, p_question text, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games := private.require_murderer(p_room_id);
  v_answer text := btrim(coalesce(p_answer, ''));
  v_id uuid;
begin
  if v_game.forged_note_id is not null then
    raise exception 'You have already forged a note';
  end if;
  if char_length(v_answer) not between 1 and 200 then
    raise exception 'Write the fake secret first.';
  end if;
  if not exists (select 1 from public.answers where room_id = p_room_id and question = p_question) then
    raise exception 'Pick one of tonight''s questions';
  end if;
  insert into public.notes (room_id, owner_id, question, answer, murderer, forged, queue_pos)
  values (p_room_id, v_game.murderer_id, p_question, v_answer, true, true, coalesce((
    select min(queue_pos) from public.notes where room_id = p_room_id and murderer and status = 'left'
  ), 0) - 1)
  returning id into v_id;
  update public.games set forged_note_id = v_id where room_id = p_room_id;
  perform private.touch(p_room_id);
end;
$$;

-- Even rounds: strike someone, or wait (p_target null). Once per round.
create function public.strike(p_room_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games := private.require_murderer(p_room_id);
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.round < 2 or v_room.round % 2 <> 0 then
    raise exception 'You can only strike in even rounds';
  end if;
  if v_game.kill_state <> 'none' then
    raise exception 'You have already decided this round';
  end if;
  if p_target is null then
    update public.games set kill_state = 'wait' where room_id = p_room_id;
  else
    if not exists (
      select 1 from public.players
      where id = p_target and room_id = p_room_id and dead is null and id <> v_game.murderer_id
    ) then
      raise exception 'Pick someone still in the game';
    end if;
    update public.games set kill_state = 'struck', kill_target = p_target where room_id = p_room_id;
  end if;
  perform private.touch(p_room_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Meeting and vote
-- ---------------------------------------------------------------------------

create function public.cast_vote(p_room_id uuid, p_target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
begin
  if v_room.phase <> 'meeting' then
    raise exception 'Voting is closed';
  end if;
  if v_me.id is null or v_me.dead is not null then
    raise exception 'Ghosts can''t vote';
  end if;
  if p_target <> 'skip' and not exists (
    select 1 from public.players where id::text = p_target and room_id = p_room_id and dead is null
  ) then
    raise exception 'Pick someone still in the game';
  end if;
  insert into public.votes (room_id, round, voter_id, target)
  values (p_room_id, v_room.round, v_me.id, p_target)
  on conflict do nothing;
  if not exists (
    select 1 from public.players p
    where p.room_id = p_room_id and p.dead is null
      and not exists (select 1 from public.votes v where v.room_id = p_room_id and v.round = v_room.round and v.voter_id = p.id)
  ) then
    perform private.reveal_votes(p_room_id);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Host controls (the TV, or the first player's phone)
-- ---------------------------------------------------------------------------

-- The host's "next" button: does whatever the current screen offers.
--   tasks -> Call the meeting, quiet -> Next round, discuss -> Start the vote,
--   meeting -> Reveal the vote, tally -> Reveal the verdict,
--   revealed -> Next round / See the ending.
-- p_phase must match the phase the host saw, so a double tap does nothing.
create function public.host_next(p_room_id uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_game public.games;
begin
  perform private.require_controller(v_room);
  if v_room.phase is distinct from p_phase then
    return;
  end if;
  case v_room.phase
    when 'tasks' then
      perform private.end_tasks(p_room_id);
    when 'quiet' then
      perform private.start_round(p_room_id);
    when 'discuss' then
      perform private.start_vote(p_room_id);
    when 'meeting' then
      perform private.reveal_votes(p_room_id);
    when 'tally' then
      -- Who's out, and were they the murderer?
      select * into v_game from public.games where room_id = p_room_id;
      if v_game.result ->> 'ejected' is not null then
        update public.players set dead = 'ejected', dead_at = now() where id = (v_game.result ->> 'ejected')::uuid;
        update public.games set result = result || jsonb_build_object(
          'was_murderer', (v_game.result ->> 'ejected')::uuid = v_game.murderer_id
        ) where room_id = p_room_id;
      end if;
      perform private.set_phase(p_room_id, 'revealed');
    when 'revealed' then
      if not private.finish_if_over(p_room_id) then
        perform private.start_round(p_room_id);
      end if;
    else
      return;
  end case;
end;
$$;

-- One more minute on whatever is being timed.
create function public.add_time(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_secs int;
begin
  perform private.require_controller(v_room);
  if v_room.phase not in ('tasks', 'discuss', 'meeting') or v_room.deadline is null then
    return;
  end if;
  v_secs := greatest(0, ceil(extract(epoch from v_room.deadline - now())))::int + 60;
  update public.rooms set deadline = now() + make_interval(secs => v_secs), total_secs = v_secs, version = version + 1
  where id = p_room_id;
end;
$$;

-- Any screen calls this when its timer reaches zero. Only acts once the deadline has really passed.
create function public.advance_if_due(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  if v_room.deadline is null or v_room.deadline > now() + interval '500 milliseconds' then
    return false;
  end if;
  case v_room.phase
    when 'tasks' then perform private.end_tasks(p_room_id);
    when 'discuss' then perform private.start_vote(p_room_id);
    when 'meeting' then perform private.reveal_votes(p_room_id);
    else return false;
  end case;
  return true;
end;
$$;

-- ===========================================================================
-- Trapped Below (story 1): a submarine, a crew, and a saboteur.
-- ===========================================================================
--
-- How it works
-- - Onboarding (tb_brief): the captain explains the game on the TV while the
--   board fills in. Everyone tapping "We know how to play" skips to the hatch.
--   Then everyone holds their bolt on their phone at the same time for three
--   seconds to seal the hatch. A bolt that slips costs nothing.
-- - Dim the lights (tb_dive): the host starts the dive; eight seconds later
--   everyone fills in their crew file (tb_crew): a portrait, a favourite wire
--   colour, a number from 1 to 9, what they'd bring if trapped underwater, and
--   one deeper question.
-- - Sealed orders (tb_orders): with 4 or more players, one is the saboteur.
--   With 3 it's co-op: reach the surface before the air runs out.
-- - Four watches (tb_watch). Each pair (a trio if odd) gets one repair:
--   wires (one phone has the panel, the other the riddles about the panel
--   holder) or "who said it?" (the guide has a question about the operator,
--   the operator has everyone's answers). Repairs add air; mistakes cost some.
-- - After watches 1 to 3, an all-hands emergency (tb_hands): sonar Morse,
--   ballast pipes, then a hull breach.
-- - With a saboteur, the crew meets (tb_talk), reads the logs (every fix
--   recovers a line about the saboteur, from their own answers) and votes
--   (tb_vote, tb_verdict). A wrong vote costs a minute of air.
-- - The air clock runs from the first watch, and stops for meetings.
--   The crew wins by voting out the saboteur (or, in co-op, by surviving four
--   watches). The saboteur wins if the air runs out, if they reach the
--   surface undiscovered, or if only one crew member is left.

-- Secret: one row per Trapped Below game.
create table public.tb_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  saboteur_id uuid references public.players (id) on delete set null,
  -- Onboarding: 'talk' (the captain explains), 'hatch' (hold the bolts), 'sealed'.
  stage text not null default 'talk' check (stage in ('talk', 'hatch', 'sealed')),
  skip uuid[] not null default '{}',
  holds uuid[] not null default '{}',
  seal_at timestamptz,
  sealed_at timestamptz,
  slips int not null default 0,
  slip_at timestamptz,
  dive_at timestamptz,
  -- The air clock: while it runs, air_at is when it reaches zero; while paused, air_left holds what's left.
  air_running boolean not null default false,
  air_at timestamptz,
  air_left int not null default 480,
  depth int not null default 412,
  -- The all-hands emergency after this watch.
  hands_kind text check (hands_kind in ('sonar', 'pipes', 'leak')),
  hands_done boolean not null default false,
  hands_ok boolean,
  hands_tries int not null default 0,
  sonar_word text,
  sonar_listener uuid,
  pipe_rot int[],
  leak_water real not null default 60,
  leak_at timestamptz,
  leak_holding uuid[] not null default '{}',
  leak_floods int not null default 0,
  -- The saboteur's loosened bolt: chosen during a watch, felt at the start of the next.
  bolt text,
  bolt_watch int,
  bolt_report text,
  -- Every fix recovers a log about the saboteur, in this order.
  logs_found int not null default 0,
  log_rounds int[] not null default '{}',
  fixes int not null default 0,
  result jsonb,
  outcome text check (outcome in ('crew', 'saboteur')),
  reason text,
  started_at timestamptz
);

-- Secret: each player's crew file.
create table public.tb_crew (
  player_id uuid primary key references public.players (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  colour text not null check (colour in ('red', 'blue', 'yellow', 'green', 'white', 'black')),
  num int not null check (num between 1 and 9),
  bring text not null check (char_length(bring) between 1 and 80),
  deep_q text not null check (char_length(deep_q) between 1 and 200),
  deep_a text not null check (char_length(deep_a) between 1 and 120)
);
create index tb_crew_room_id_idx on public.tb_crew (room_id);

-- Secret: this watch's repairs.
create table public.tb_repairs (
  room_id uuid not null references public.rooms (id) on delete cascade,
  watch int not null,
  idx int not null,
  kind text not null check (kind in ('wires', 'guide')),
  members uuid[] not null,
  -- Wires: the panel holder (the riddles are about them). Guide: the operator (the question is about them).
  lead uuid not null,
  place text not null,
  solved boolean not null default false,
  -- 'ok' (fixed) or 'half' (a guide pick that was wrong).
  result text,
  tries int not null default 0,
  msg text not null default '',
  -- Guide: the shown answers [{a, owner}] and which one was picked.
  options jsonb,
  pick int,
  solved_at timestamptz,
  primary key (room_id, watch, idx)
);

alter table public.tb_games enable row level security;
alter table public.tb_crew enable row level security;
alter table public.tb_repairs enable row level security;
revoke all on public.tb_games, public.tb_crew, public.tb_repairs from anon, authenticated;

-- How long the captain's briefing lasts on the TV (the recorded lines plus pauses), in seconds.
create function private.tb_brief_secs()
returns int
language sql
immutable
set search_path = ''
as $$ select 38 $$;

-- Air left right now, in seconds.
create function private.tb_air(p_game public.tb_games)
returns int
language sql
stable
set search_path = ''
as $$
  select case when p_game.air_running and p_game.air_at is not null
              then greatest(0, ceil(extract(epoch from p_game.air_at - now())))::int
              else p_game.air_left end;
$$;

-- Add (or take) air. The tank holds ten minutes.
create function private.tb_add_air(p_room_id uuid, p_secs int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_game public.tb_games;
  v_left int;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  v_left := least(600, greatest(0, private.tb_air(v_game) + p_secs));
  if v_game.air_running then
    update public.tb_games set air_at = now() + make_interval(secs => v_left), air_left = v_left where room_id = p_room_id;
  else
    update public.tb_games set air_left = v_left where room_id = p_room_id;
  end if;
end;
$$;

create function private.tb_air_run(p_room_id uuid, p_on boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_game public.tb_games;
  v_left int;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  v_left := private.tb_air(v_game);
  update public.tb_games set air_running = p_on, air_left = v_left,
    air_at = case when p_on then now() + make_interval(secs => v_left) end
  where room_id = p_room_id;
end;
$$;

-- A fix adds air and climbs toward the surface. The first fix of each watch also recovers
-- the next log about the saboteur (with a saboteur aboard), so there's one new clue per meeting.
create function private.tb_fixed(p_room_id uuid, p_air int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  perform private.tb_add_air(p_room_id, p_air);
  update public.tb_games set fixes = fixes + 1, depth = greatest(0, depth - 40),
    logs_found = case when saboteur_id is not null and logs_found < 4 and not v_room.round = any (log_rounds) then logs_found + 1 else logs_found end,
    log_rounds = case when saboteur_id is not null and logs_found < 4 and not v_room.round = any (log_rounds) then log_rounds || v_room.round else log_rounds end
  where room_id = p_room_id;
end;
$$;

-- The logs found so far: lines about the saboteur, from their own crew file.
create function private.tb_logs(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('watch', g.log_rounds[l.i], 'text', l.t) order by l.i), '[]')
  from public.tb_games g
  join public.tb_crew c on c.player_id = g.saboteur_id
  cross join lateral (
    select * from (values
      (1, 'The saboteur''s favourite colour is ' || c.colour || '.'),
      (2, 'The saboteur''s lucky number is ' || c.num || '.'),
      (3, 'Trapped underwater, the saboteur would bring: ' || c.bring || '.'),
      (4, 'Asked “' || c.deep_q || '”, the saboteur answered: ' || c.deep_a || '.')
    ) v(i, t)
  ) l
  where g.room_id = p_room_id and l.i <= g.logs_found;
$$;

-- The game ends. Outcome 'crew' or 'saboteur'.
create function private.tb_finish(p_room_id uuid, p_outcome text, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.tb_air_run(p_room_id, false);
  update public.tb_games set outcome = p_outcome, reason = p_reason where room_id = p_room_id;
  perform private.set_phase(p_room_id, 'tb_end');
end;
$$;

-- Out of air?
create function private.tb_out_of_air(p_room_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_game public.tb_games;
begin
  select * into v_game from public.tb_games where room_id = p_room_id;
  if not v_game.air_running or private.tb_air(v_game) > 0 then
    return false;
  end if;
  perform private.tb_finish(p_room_id, 'saboteur', case when v_game.saboteur_id is null
    then 'The air ran out before you reached the surface.'
    else 'The air ran out. The saboteur wins.' end);
  return true;
end;
$$;

-- A watch: fresh pairs (a trio if odd), each with a repair in a room of the sub.
create function private.tb_start_watch(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.tb_games;
  v_order uuid[];
  v_n int;
  v_groups int;
  v_i int;
  v_members uuid[];
  v_kind text;
  v_lead uuid;
  v_wires int := 0;
  v_guides int := 0;
  v_opts jsonb;
  v_watch int;
  v_bonus int;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.tb_games where room_id = p_room_id;
  v_watch := v_room.round + 1;

  -- Everyone repairs, ghosts too.
  select array_agg(id order by random()) into v_order from public.players where room_id = p_room_id;
  v_n := array_length(v_order, 1);
  v_groups := greatest(1, v_n / 2);
  delete from public.tb_repairs where room_id = p_room_id;
  for v_i in 0..v_groups - 1 loop
    v_members := v_order[v_i * 2 + 1 : v_i * 2 + 2];
    if v_i = v_groups - 1 and v_n % 2 = 1 then
      v_members := v_members || v_order[v_n];
    end if;
    v_kind := case when (v_i + v_watch) % 2 = 0 then 'wires' else 'guide' end;
    v_lead := v_members[1];
    v_opts := null;
    if v_kind = 'guide' then
      -- The operator's answer and up to three others, shuffled.
      select jsonb_agg(jsonb_build_object('a', bring, 'owner', player_id) order by random()) into v_opts
      from (
        select c.bring, c.player_id from public.tb_crew c where c.player_id = v_lead
        union all
        (select c.bring, c.player_id from public.tb_crew c
         where c.room_id = p_room_id and c.player_id <> v_lead order by random() limit 3)
      ) o;
    end if;
    insert into public.tb_repairs (room_id, watch, idx, kind, members, lead, place, options)
    values (p_room_id, v_watch, v_i, v_kind, v_members, v_lead,
            case when v_kind = 'wires' then (array['engine', 'control', 'sonar'])[1 + v_wires % 3]
                 else (array['oxygen', 'galley', 'quarters'])[1 + v_guides % 3] end,
            v_opts);
    if v_kind = 'wires' then v_wires := v_wires + 1; else v_guides := v_guides + 1; end if;
  end loop;

  update public.tb_games set bolt_report = null, result = null, hands_kind = null, hands_done = false, hands_ok = null,
    hands_tries = 0 where room_id = p_room_id;
  -- The bolt the saboteur loosened last watch gives way now.
  if v_game.bolt is not null and v_game.bolt_watch = v_room.round then
    perform private.tb_add_air(p_room_id, -30);
    update public.tb_games set bolt_report = bolt, bolt = null where room_id = p_room_id;
  end if;

  update public.rooms set round = v_watch where id = p_room_id;
  perform private.set_phase(p_room_id, 'tb_watch', 150);
  perform private.tb_air_run(p_room_id, true);
end;
$$;

-- The air bonus for one repair: three minutes a watch, shared across the pairs.
create function private.tb_bonus(p_room_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select least(90, 180 / greatest(1, (select count(*) from public.tb_repairs where room_id = p_room_id)::int));
$$;

-- The watch is over (all fixed, or time's up): an emergency, a meeting, or the end.
create function private.tb_end_watch(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.tb_games;
  v_kind text;
  v_words text[] := array['EEL', 'RAY', 'COD', 'SUB', 'OAR', 'ICE', 'KELP', 'REEF'];
  v_listener uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.tb_games where room_id = p_room_id;
  if v_room.round >= 4 then
    perform private.tb_after_hands(p_room_id);
    return;
  end if;
  v_kind := (array['sonar', 'pipes', 'leak'])[v_room.round];
  select id into v_listener from public.players where room_id = p_room_id order by random() limit 1;
  update public.tb_games set
    hands_kind = v_kind, hands_done = false, hands_ok = null, hands_tries = 0,
    sonar_word = v_words[1 + floor(random() * array_length(v_words, 1))::int],
    sonar_listener = v_listener,
    pipe_rot = array[1, 0, 0, 3, 2, 1, 1, 1, 3],
    leak_water = 60, leak_at = now() + interval '4 seconds', leak_holding = '{}', leak_floods = 0
  where room_id = p_room_id;
  perform private.set_phase(p_room_id, 'tb_hands', 120);
end;
$$;

-- After the emergency (or the last watch): the meeting, or straight on.
create function private.tb_after_hands(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.tb_games;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.tb_games where room_id = p_room_id;
  if private.tb_out_of_air(p_room_id) then
    return;
  end if;
  if v_game.saboteur_id is null then
    if v_room.round >= 4 then
      perform private.tb_finish(p_room_id, 'crew', 'Four watches, and you reached the surface together.');
    else
      perform private.tb_start_watch(p_room_id);
    end if;
    return;
  end if;
  perform private.tb_air_run(p_room_id, false);
  perform private.set_phase(p_room_id, 'tb_talk', 90);
end;
$$;

-- Count the votes. Anyone who hasn't voted skips.
create function private.tb_reveal_votes(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.tb_games;
  v_counts jsonb;
  v_top int;
  v_leaders text[];
  v_out text;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.tb_games where room_id = p_room_id;
  insert into public.votes (room_id, round, voter_id, target, auto)
  select p_room_id, v_room.round, p.id, 'skip', true
  from public.players p where p.room_id = p_room_id and p.dead is null
  on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('k', target, 'n', n) order by n desc, target), '[]'), max(n)
  into v_counts, v_top
  from (
    select v.target, count(*)::int as n
    from public.votes v join public.players p on p.id = v.voter_id and p.dead is null
    where v.room_id = p_room_id and v.round = v_room.round
    group by v.target
  ) c;
  select array_agg(c ->> 'k') into v_leaders from jsonb_array_elements(v_counts) c where (c ->> 'n')::int = v_top;
  v_out := case when array_length(v_leaders, 1) = 1 and v_leaders[1] <> 'skip' then v_leaders[1] end;
  if v_out is not null then
    update public.players set dead = 'ejected', dead_at = now() where id = v_out::uuid;
    if v_out::uuid is distinct from v_game.saboteur_id then
      perform private.tb_add_air(p_room_id, -60);
    end if;
  end if;
  update public.tb_games set result = jsonb_build_object(
    'counts', v_counts, 'ejected', v_out, 'tie', coalesce(array_length(v_leaders, 1), 0) > 1,
    'was_saboteur', v_out is not null and v_out::uuid = v_game.saboteur_id
  ) where room_id = p_room_id;
  perform private.set_phase(p_room_id, 'tb_verdict');
end;
$$;

-- After the verdict: the end, or the next watch.
create function private.tb_after_verdict(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_game public.tb_games;
  v_crew int;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_game from public.tb_games where room_id = p_room_id;
  select count(*) into v_crew from public.players where room_id = p_room_id and dead is null and id <> v_game.saboteur_id;
  if (v_game.result ->> 'was_saboteur')::boolean then
    perform private.tb_finish(p_room_id, 'crew', 'The crew voted out the saboteur.');
  elsif private.tb_air(v_game) <= 0 then
    perform private.tb_finish(p_room_id, 'saboteur', 'The air ran out. The saboteur wins.');
  elsif v_crew <= 1 then
    perform private.tb_finish(p_room_id, 'saboteur', 'Only one crew member is left. The saboteur wins.');
  elsif v_room.round >= 4 then
    perform private.tb_finish(p_room_id, 'saboteur', 'You reached the surface with the saboteur still aboard.');
  else
    perform private.tb_start_watch(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trapped Below: onboarding
-- ---------------------------------------------------------------------------

-- "We know how to play": when everyone taps it, the briefing skips to the hatch. Tap again to take it back.
create function public.tb_skip(p_room_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_room.phase <> 'tb_brief' or v_game.stage <> 'talk' then
    return;
  end if;
  update public.tb_games set skip = case when p_on then array_append(array_remove(skip, v_me.id), v_me.id) else array_remove(skip, v_me.id) end
  where room_id = p_room_id returning * into v_game;
  if not exists (select 1 from public.players p where p.room_id = p_room_id and not p.id = any (v_game.skip)) then
    update public.tb_games set stage = 'hatch' where room_id = p_room_id;
  end if;
  perform private.touch(p_room_id);
end;
$$;

-- Holding (or letting go of) your bolt on the hatch. All of them at once for three seconds seals it.
create function public.tb_hold(p_room_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
  v_all boolean;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_room.phase <> 'tb_brief' or v_game.stage <> 'hatch' then
    return;
  end if;
  if p_on then
    update public.tb_games set holds = array_append(array_remove(holds, v_me.id), v_me.id) where room_id = p_room_id returning * into v_game;
  else
    -- Letting go before it's sealed: the bolt slips. No harm done.
    if v_game.seal_at is not null and v_game.seal_at > now() then
      update public.tb_games set slips = slips + 1, slip_at = now() where room_id = p_room_id;
    end if;
    update public.tb_games set holds = array_remove(holds, v_me.id), seal_at = null where room_id = p_room_id returning * into v_game;
  end if;
  v_all := not exists (select 1 from public.players p where p.room_id = p_room_id and not p.id = any (v_game.holds));
  if v_all and v_game.seal_at is null then
    update public.tb_games set seal_at = now() + interval '3 seconds' where room_id = p_room_id;
  end if;
  perform private.touch(p_room_id);
end;
$$;

-- Dim the lights, then dive: the host starts it.
create function public.tb_dive(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase <> 'tb_dive' then
    return;
  end if;
  update public.tb_games set dive_at = coalesce(dive_at, now()) where room_id = p_room_id;
  perform private.touch(p_room_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trapped Below: crew file and sealed orders
-- ---------------------------------------------------------------------------

create function public.tb_portrait(p_room_id uuid, p_portrait int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_other uuid;
begin
  if v_me.id is null or v_room.phase <> 'tb_crew' then
    raise exception 'The crew file is closed';
  end if;
  if p_portrait is null or p_portrait not between 1 and 6 then
    raise exception 'Pick a portrait';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_me.id and portrait = p_portrait and picked) then
    raise exception 'Someone already picked that one';
  end if;
  -- Whoever had it (not yet confirmed) swaps to this player's old portrait.
  select id into v_other from public.players where room_id = p_room_id and id <> v_me.id and portrait = p_portrait;
  update public.players set portrait = null where id = v_other;
  update public.players set portrait = p_portrait, picked = true where id = v_me.id;
  update public.players set portrait = v_me.portrait where id = v_other;
  perform private.touch(p_room_id);
end;
$$;

create function public.tb_crew_file(p_room_id uuid, p_colour text, p_num int, p_bring text, p_deep_q text, p_deep_a text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
begin
  if v_me.id is null or v_room.phase <> 'tb_crew' then
    raise exception 'The crew file is closed';
  end if;
  if v_me.answered then
    raise exception 'Your crew file is already in';
  end if;
  if p_colour not in ('red', 'blue', 'yellow', 'green', 'white', 'black') then
    raise exception 'Pick a colour';
  end if;
  if p_num is null or p_num not between 1 and 9 then
    raise exception 'Pick a number from 1 to 9';
  end if;
  if char_length(btrim(coalesce(p_bring, ''))) not between 1 and 80 or char_length(btrim(coalesce(p_deep_a, ''))) not between 1 and 120 then
    raise exception 'Answer to continue.';
  end if;
  if char_length(btrim(coalesce(p_deep_q, ''))) not between 1 and 200 then
    raise exception 'Missing question';
  end if;
  insert into public.tb_crew (player_id, room_id, colour, num, bring, deep_q, deep_a)
  values (v_me.id, p_room_id, p_colour, p_num, btrim(p_bring), btrim(p_deep_q), btrim(p_deep_a));
  update public.players set answered = true where id = v_me.id;
  perform private.touch(p_room_id);
end;
$$;

-- "Seal the orders": deal roles (and "Play again" from the end: same crew files, new roles).
create function public.tb_start(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_n int;
  v_saboteur uuid;
begin
  perform private.require_controller(v_room);
  if v_room.phase not in ('tb_crew', 'tb_end') then
    return;
  end if;
  select count(*) into v_n from public.players where room_id = p_room_id;
  if exists (select 1 from public.players where room_id = p_room_id and (not picked or not answered)) then
    raise exception 'Waiting for everyone''s crew file';
  end if;
  if v_n >= 4 then
    select id into v_saboteur from public.players where room_id = p_room_id order by random() limit 1;
  end if;
  delete from public.votes where room_id = p_room_id;
  delete from public.tb_repairs where room_id = p_room_id;
  update public.tb_games set saboteur_id = v_saboteur, air_running = false, air_at = null, air_left = 480, depth = 412,
    hands_kind = null, hands_done = false, hands_ok = null, bolt = null, bolt_watch = null, bolt_report = null,
    logs_found = 0, log_rounds = '{}', fixes = 0, result = null, outcome = null, reason = null, started_at = now()
  where room_id = p_room_id;
  update public.players set opened = false, ready = false, dead = null, dead_at = null where room_id = p_room_id;
  update public.rooms set round = 0 where id = p_room_id;
  perform private.set_phase(p_room_id, 'tb_orders');
end;
$$;

-- Unscrew the porthole (read your orders), then "Ready".
create function public.tb_orders(p_room_id uuid, p_ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
begin
  if v_me.id is null or v_room.phase <> 'tb_orders' then
    return;
  end if;
  update public.players set opened = true, ready = ready or p_ready where id = v_me.id;
  if not exists (select 1 from public.players where room_id = p_room_id and not ready) then
    perform private.tb_start_watch(p_room_id);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trapped Below: repairs
-- ---------------------------------------------------------------------------

create function private.tb_my_repair(p_room_id uuid)
returns public.tb_repairs
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_me public.players := private.me(p_room_id);
  v_rep public.tb_repairs;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.phase <> 'tb_watch' then
    raise exception 'The watch is over';
  end if;
  select * into v_rep from public.tb_repairs
  where room_id = p_room_id and watch = v_room.round and v_me.id = any (members) for update;
  if not found then
    raise exception 'You don''t have a repair this watch';
  end if;
  if v_rep.solved then
    raise exception 'Already fixed';
  end if;
  return v_rep;
end;
$$;

-- When every repair is done, the watch ends.
create function private.tb_watch_check(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if private.tb_out_of_air(p_room_id) then
    return;
  end if;
  if not exists (select 1 from public.tb_repairs where room_id = p_room_id and watch = v_room.round and not solved) then
    -- A short beat to see the last fix land.
    update public.rooms set deadline = least(deadline, now() + interval '4 seconds'), version = version + 1 where id = p_room_id;
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- Wires: the panel holder restarts the engine with the wire they cut and the code they set.
create function public.tb_restart(p_room_id uuid, p_cut text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_rep public.tb_repairs := private.tb_my_repair(p_room_id);
  v_crew public.tb_crew;
  v_word text;
  v_code text;
  v_right int := 0;
begin
  if v_rep.kind <> 'wires' or v_me.id <> v_rep.lead then
    raise exception 'Only the panel holder can restart';
  end if;
  select * into v_crew from public.tb_crew where player_id = v_rep.lead;
  v_word := (regexp_match(v_crew.deep_a, '[[:alpha:]]+'))[1];
  v_code := v_crew.num::text || (char_length(coalesce(v_word, '')) % 10)::text;
  if p_cut = v_crew.colour then v_right := v_right + 1; end if;
  if p_code = v_code then v_right := v_right + 1; end if;
  if v_right = 2 then
    update public.tb_repairs set solved = true, result = 'ok', tries = tries + 1, msg = '', solved_at = now()
    where room_id = p_room_id and watch = v_rep.watch and idx = v_rep.idx;
    perform private.tb_fixed(p_room_id, private.tb_bonus(p_room_id));
  else
    update public.tb_repairs set tries = tries + 1, msg = v_right || ' of 2 right'
    where room_id = p_room_id and watch = v_rep.watch and idx = v_rep.idx;
    perform private.tb_add_air(p_room_id, -10);
  end if;
  perform private.tb_watch_check(p_room_id);
  return v_right = 2;
end;
$$;

-- Who said it: the operator presses the answer closest to the guide's guess.
create function public.tb_pick(p_room_id uuid, p_pick int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_rep public.tb_repairs := private.tb_my_repair(p_room_id);
  v_ok boolean;
begin
  if v_rep.kind <> 'guide' or v_me.id <> v_rep.lead then
    raise exception 'Only the operator can press';
  end if;
  if p_pick is null or p_pick < 0 or p_pick >= jsonb_array_length(v_rep.options) then
    raise exception 'Pick one';
  end if;
  v_ok := (v_rep.options -> p_pick ->> 'owner')::uuid = v_rep.lead;
  update public.tb_repairs set solved = true, pick = p_pick, result = case when v_ok then 'ok' else 'half' end,
    tries = 1, solved_at = now()
  where room_id = p_room_id and watch = v_rep.watch and idx = v_rep.idx;
  if v_ok then
    perform private.tb_fixed(p_room_id, private.tb_bonus(p_room_id));
  else
    perform private.tb_add_air(p_room_id, 20);
  end if;
  perform private.tb_watch_check(p_room_id);
  return v_ok;
end;
$$;

-- The saboteur loosens a bolt: once per watch, felt at the start of the next.
create function public.tb_bolt(p_room_id uuid, p_place text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_me.id is distinct from v_game.saboteur_id or v_me.dead is not null then
    raise exception 'Only the saboteur can do that';
  end if;
  if v_room.phase <> 'tb_watch' or v_room.round >= 4 then
    raise exception 'Not now';
  end if;
  if v_game.bolt_watch = v_room.round then
    raise exception 'You already loosened one this watch';
  end if;
  if p_place not in ('engine', 'oxygen', 'sonar', 'ballast', 'control') then
    raise exception 'Pick a system';
  end if;
  update public.tb_games set bolt = p_place, bolt_watch = v_room.round where room_id = p_room_id;
  perform private.touch(p_room_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trapped Below: all-hands emergencies
-- ---------------------------------------------------------------------------

create function private.tb_hands_done(p_room_id uuid, p_ok boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.tb_games set hands_done = true, hands_ok = p_ok where room_id = p_room_id;
  if p_ok then
    perform private.tb_fixed(p_room_id, 60);
  end if;
  -- A few seconds to see it land, then the meeting.
  update public.rooms set deadline = now() + interval '5 seconds', total_secs = 5, version = version + 1 where id = p_room_id;
end;
$$;

-- Sonar: anyone but the listener types what the signal spells.
create function public.tb_sonar(p_room_id uuid, p_word text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_room.phase <> 'tb_hands' or v_game.hands_kind <> 'sonar' or v_game.hands_done then
    return false;
  end if;
  if upper(btrim(coalesce(p_word, ''))) = v_game.sonar_word then
    perform private.tb_hands_done(p_room_id, true);
    return true;
  end if;
  update public.tb_games set hands_tries = hands_tries + 1 where room_id = p_room_id;
  perform private.tb_add_air(p_room_id, -10);
  perform private.touch(p_room_id);
  return false;
end;
$$;

-- Pipes: the target rotation of each tile, and which tiles carry the water.
create function private.tb_pipes_solved(p_rot int[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Tiles 0 (straight), 1, 4, 5, 8 (corners) carry the water. A straight pipe is the same turned twice.
  select (p_rot[1] % 2) = 0 and p_rot[2] = 2 and p_rot[5] = 0 and p_rot[6] = 2 and p_rot[9] = 0;
$$;

-- Each player sees one row of the map and turns the valves of the next row.
create function private.tb_pipe_rows(p_room_id uuid, p_player uuid)
returns int[]
language sql
stable
set search_path = ''
as $$
  select array[(k - 1) % 3, k % 3] from (
    select row_number() over (order by p.joined_at nulls last, p.created_at, p.id) as k, p.id
    from public.players p where p.room_id = p_room_id
  ) s where s.id = p_player;
$$;

create function public.tb_rotate(p_room_id uuid, p_tile int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
  v_rows int[];
  v_rot int[];
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_room.phase <> 'tb_hands' or v_game.hands_kind <> 'pipes' or v_game.hands_done then
    return;
  end if;
  v_rows := private.tb_pipe_rows(p_room_id, v_me.id);
  if p_tile is null or p_tile not between 0 and 8 or p_tile / 3 <> v_rows[2] then
    raise exception 'That valve is someone else''s';
  end if;
  v_rot := v_game.pipe_rot;
  v_rot[p_tile + 1] := (v_rot[p_tile + 1] + 1) % 4;
  update public.tb_games set pipe_rot = v_rot where room_id = p_room_id;
  if private.tb_pipes_solved(v_rot) then
    perform private.tb_hands_done(p_room_id, true);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- Hull breach: water rises 1.5% a second, 1% more while nobody holds the hatch (with 4+ players, one phone holds it).
create function private.tb_leak_rate(p_game public.tb_games)
returns real
language sql
stable
set search_path = ''
as $$
  select (1.5 + case when cardinality(p_game.leak_holding) > 0
                       or (select count(*) from public.players where room_id = p_game.room_id) < 4
                     then 0 else 1.0 end)::real;
$$;

-- The water level now, worked out from when it was last measured.
create function private.tb_water(p_game public.tb_games)
returns real
language sql
stable
set search_path = ''
as $$
  select least(100, greatest(0, p_game.leak_water + greatest(0, extract(epoch from now() - p_game.leak_at)) * private.tb_leak_rate(p_game)))::real;
$$;

-- Each phone's job in the hull breach: pump (shake), blow (microphone), level (tilt) or hatch (hold).
create function private.tb_leak_role(p_room_id uuid, p_player uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select (array['pump', 'blow', 'level', 'hatch'])[1 + (k - 1) % 4] from (
    select row_number() over (order by p.joined_at nulls last, p.created_at, p.id) as k, p.id
    from public.players p where p.room_id = p_room_id
  ) s where s.id = p_player;
$$;

-- Phones report their work a few times a second: pumps (shakes), seconds blowing, seconds level,
-- and whether they're holding the hatch.
create function public.tb_leak(p_room_id uuid, p_work real, p_holding boolean)
returns real
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
  v_game public.tb_games;
  v_water real;
  v_role text;
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_me.id is null or v_room.phase <> 'tb_hands' or v_game.hands_kind <> 'leak' or v_game.hands_done then
    return null;
  end if;
  v_role := private.tb_leak_role(p_room_id, v_me.id);
  -- Each job is worth about the same per second of effort.
  v_water := private.tb_water(v_game) - least(6, greatest(0, coalesce(p_work, 0))) *
    case v_role when 'pump' then 0.9 when 'blow' then 1.6 when 'level' then 1.0 else 0 end;
  update public.tb_games set leak_water = greatest(0, v_water), leak_at = greatest(now(), leak_at),
    leak_holding = case when v_role = 'hatch' and p_holding then array_append(array_remove(leak_holding, v_me.id), v_me.id)
                        else array_remove(leak_holding, v_me.id) end
  where room_id = p_room_id returning * into v_game;
  if v_water <= 0 then
    perform private.tb_hands_done(p_room_id, true);
  elsif private.tb_water(v_game) >= 100 then
    perform private.tb_leak_flood(p_room_id);
  else
    perform private.touch(p_room_id);
  end if;
  return greatest(0, v_water);
end;
$$;

-- The compartment floods: a minute of air, and the water drops back to start again (twice at most).
create function private.tb_leak_flood(p_room_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_game public.tb_games;
begin
  update public.tb_games set leak_floods = leak_floods + 1, leak_water = 60, leak_at = now() + interval '3 seconds'
  where room_id = p_room_id returning * into v_game;
  perform private.tb_add_air(p_room_id, -60);
  if v_game.leak_floods >= 2 then
    perform private.tb_hands_done(p_room_id, false);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trapped Below: the vote, host controls and the clock
-- ---------------------------------------------------------------------------

create function public.tb_vote(p_room_id uuid, p_target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_me public.players := private.me(p_room_id);
begin
  if v_room.phase <> 'tb_vote' then
    raise exception 'Voting is closed';
  end if;
  if v_me.id is null or v_me.dead is not null then
    raise exception 'Only crew outside the airlock can vote';
  end if;
  if p_target <> 'skip' and not exists (
    select 1 from public.players where id::text = p_target and room_id = p_room_id and dead is null and id <> v_me.id
  ) then
    raise exception 'Pick someone still aboard';
  end if;
  insert into public.votes (room_id, round, voter_id, target) values (p_room_id, v_room.round, v_me.id, p_target)
  on conflict (room_id, round, voter_id) do update set target = excluded.target;
  if not exists (
    select 1 from public.players p where p.room_id = p_room_id and p.dead is null
      and not exists (select 1 from public.votes v where v.room_id = p_room_id and v.round = v_room.round and v.voter_id = p.id)
  ) then
    perform private.tb_reveal_votes(p_room_id);
  else
    perform private.touch(p_room_id);
  end if;
end;
$$;

-- The host's "next": does what the current screen offers. p_phase must match (a double tap does nothing).
create function public.tb_next(p_room_id uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
begin
  perform private.require_controller(v_room);
  if v_room.phase is distinct from p_phase then
    return;
  end if;
  case v_room.phase
    when 'tb_watch' then perform private.tb_end_watch(p_room_id);
    when 'tb_hands' then
      if not (select hands_done from public.tb_games where room_id = p_room_id) then
        update public.tb_games set hands_done = true, hands_ok = false where room_id = p_room_id;
      end if;
      perform private.tb_after_hands(p_room_id);
    when 'tb_talk' then
      delete from public.votes where room_id = p_room_id and round = v_room.round;
      perform private.set_phase(p_room_id, 'tb_vote', 60);
    when 'tb_vote' then perform private.tb_reveal_votes(p_room_id);
    when 'tb_verdict' then perform private.tb_after_verdict(p_room_id);
    else return;
  end case;
end;
$$;

-- Any screen calls this when something is due (the view says when). Only acts once it really is.
create function public.tb_tick(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_game public.tb_games;
  v_late boolean := v_room.deadline is not null and v_room.deadline <= now() + interval '400 milliseconds';
begin
  select * into v_game from public.tb_games where room_id = p_room_id for update;
  if v_game.room_id is null then
    return false;
  end if;
  case v_room.phase
    when 'tb_brief' then
      if v_game.stage = 'talk' and now() >= v_room.phase_at + make_interval(secs => private.tb_brief_secs()) then
        update public.tb_games set stage = 'hatch' where room_id = p_room_id;
      elsif v_game.stage = 'hatch' and v_game.seal_at is not null and v_game.seal_at <= now() + interval '200 milliseconds'
            and not exists (select 1 from public.players p where p.room_id = p_room_id and not p.id = any (v_game.holds)) then
        update public.tb_games set stage = 'sealed', sealed_at = now() where room_id = p_room_id;
      elsif v_game.stage = 'sealed' and v_game.sealed_at <= now() - interval '3 seconds' then
        perform private.set_phase(p_room_id, 'tb_dive');
        return true;
      else
        return false;
      end if;
      perform private.touch(p_room_id);
    when 'tb_dive' then
      if v_game.dive_at is null or v_game.dive_at > now() - interval '8 seconds' then
        return false;
      end if;
      -- Everyone keeps their portrait from the browser (or picks another) and fills in the crew file.
      update public.players set picked = false where room_id = p_room_id and not answered;
      perform private.set_phase(p_room_id, 'tb_crew');
    when 'tb_watch' then
      if private.tb_out_of_air(p_room_id) then
        return true;
      end if;
      if not v_late then
        return false;
      end if;
      perform private.tb_end_watch(p_room_id);
    when 'tb_hands' then
      if private.tb_out_of_air(p_room_id) then
        return true;
      end if;
      if v_game.hands_kind = 'leak' and not v_game.hands_done and private.tb_water(v_game) >= 100 then
        perform private.tb_leak_flood(p_room_id);
        return true;
      end if;
      if not v_late then
        return false;
      end if;
      if not v_game.hands_done then
        update public.tb_games set hands_done = true, hands_ok = false where room_id = p_room_id;
      end if;
      perform private.tb_after_hands(p_room_id);
    when 'tb_talk' then
      if not v_late then
        return false;
      end if;
      delete from public.votes where room_id = p_room_id and round = v_room.round;
      perform private.set_phase(p_room_id, 'tb_vote', 60);
    when 'tb_vote' then
      if not v_late then
        return false;
      end if;
      perform private.tb_reveal_votes(p_room_id);
    else
      return false;
  end case;
  return true;
end;
$$;

-- What the Trapped Below screens see. Public for everyone, plus each phone's own job.
create function private.tb_view(p_room public.rooms, p_me public.players)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_game public.tb_games;
  v_air int;
  v_out jsonb;
  v_rep public.tb_repairs;
  v_mine jsonb;
  v_lead_name text;
  v_lead_q text;
  v_due timestamptz;
  v_rows int[];
  v_n int;
  v_k int;
begin
  select * into v_game from public.tb_games where room_id = p_room.id;
  if v_game.room_id is null then
    return null;
  end if;
  v_air := private.tb_air(v_game);

  -- When the next thing is due, so any screen can call tb_tick() then.
  v_due := case p_room.phase
    when 'tb_brief' then case v_game.stage
      when 'talk' then p_room.phase_at + make_interval(secs => private.tb_brief_secs())
      when 'hatch' then v_game.seal_at
      else v_game.sealed_at + interval '3 seconds' end
    when 'tb_dive' then v_game.dive_at + interval '8 seconds'
    when 'tb_watch' then least(p_room.deadline, case when v_game.air_running then v_game.air_at end)
    when 'tb_hands' then least(p_room.deadline, case when v_game.air_running then v_game.air_at end,
      case when v_game.hands_kind = 'leak' and not v_game.hands_done
           then greatest(now(), v_game.leak_at) + make_interval(secs => greatest(0, (100 - private.tb_water(v_game)) / private.tb_leak_rate(v_game))) end)
    when 'tb_talk' then p_room.deadline
    when 'tb_vote' then p_room.deadline
    end;

  v_out := jsonb_build_object(
    'stage', v_game.stage, 'brief_secs', private.tb_brief_secs(),
    'skip', to_jsonb(v_game.skip), 'holds', to_jsonb(v_game.holds),
    'seal_at', v_game.seal_at, 'sealed_at', v_game.sealed_at, 'slips', v_game.slips, 'slip_at', v_game.slip_at,
    'dive_at', v_game.dive_at,
    'air', v_air, 'air_running', v_game.air_running, 'air_at', v_game.air_at,
    'depth', v_game.depth, 'saboteur_mode', v_game.saboteur_id is not null,
    'bolt_report', v_game.bolt_report, 'fixes', v_game.fixes,
    'logs', private.tb_logs(p_room.id),
    'due_at', v_due,
    'crew_done', coalesce((select jsonb_agg(player_id) from public.tb_crew where room_id = p_room.id), '[]'),
    'voted', case when p_room.phase = 'tb_vote' then coalesce((
      select jsonb_agg(voter_id) from public.votes where room_id = p_room.id and round = p_room.round and not auto), '[]') end,
    'result', case when p_room.phase in ('tb_verdict', 'tb_end') then v_game.result end,
    -- The repairs: who is where, and how it went. A "who said it?" shows whose answers they were once it's done.
    'repairs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'idx', r.idx, 'kind', r.kind, 'members', to_jsonb(r.members), 'lead', r.lead, 'place', r.place,
        'solved', r.solved, 'result', r.result, 'tries', r.tries, 'solved_at', r.solved_at
      ) || case when r.kind = 'guide' and r.solved then jsonb_build_object('options', r.options, 'pick', r.pick) else '{}' end
      order by r.idx)
      from public.tb_repairs r where r.room_id = p_room.id and r.watch = p_room.round
    ), '[]')
  );

  if p_room.phase = 'tb_hands' then
    v_out := v_out || jsonb_build_object('hands', jsonb_build_object(
      'kind', v_game.hands_kind, 'done', v_game.hands_done, 'ok', v_game.hands_ok, 'tries', v_game.hands_tries,
      'listener', v_game.sonar_listener, 'letters', char_length(v_game.sonar_word),
      'rot', to_jsonb(v_game.pipe_rot),
      'water', private.tb_water(v_game), 'leak_at', v_game.leak_at, 'floods', v_game.leak_floods,
      'hatch_held', cardinality(v_game.leak_holding) > 0,
      'rate', private.tb_leak_rate(v_game),
      'word', case when v_game.hands_done then v_game.sonar_word end,
      'roles', coalesce((
        select jsonb_object_agg(p.id, jsonb_build_object(
          'leak', private.tb_leak_role(p_room.id, p.id), 'rows', to_jsonb(private.tb_pipe_rows(p_room.id, p.id))))
        from public.players p where p.room_id = p_room.id
      ), '{}')
    ));
  end if;

  if p_room.phase = 'tb_end' then
    v_out := v_out || jsonb_build_object('outcome', v_game.outcome, 'reason', v_game.reason, 'saboteur', v_game.saboteur_id,
      'files', coalesce((
        select jsonb_agg(jsonb_build_object('player', c.player_id, 'colour', c.colour, 'num', c.num, 'bring', c.bring, 'q', c.deep_q, 'a', c.deep_a))
        from public.tb_crew c where c.room_id = p_room.id
      ), '[]'));
  end if;

  -- This phone's own part.
  if p_me.id is not null then
    v_mine := jsonb_build_object(
      'role', case when p_room.phase in ('tb_brief', 'tb_dive', 'tb_crew') then null
                   when p_me.id = v_game.saboteur_id then 'saboteur' else 'crew' end,
      'crew', (select jsonb_build_object('colour', colour, 'num', num, 'bring', bring, 'q', deep_q, 'a', deep_a)
               from public.tb_crew where player_id = p_me.id)
    );
    if p_me.id = v_game.saboteur_id then
      v_mine := v_mine || jsonb_build_object('bolt', case when v_game.bolt_watch = p_room.round then v_game.bolt end,
        'can_bolt', p_room.phase = 'tb_watch' and p_room.round < 4 and v_game.bolt_watch is distinct from p_room.round and p_me.dead is null);
    end if;
    if p_room.phase = 'tb_watch' then
      select * into v_rep from public.tb_repairs where room_id = p_room.id and watch = p_room.round and p_me.id = any (members);
      if found then
        select name into v_lead_name from public.players where id = v_rep.lead;
        select deep_q into v_lead_q from public.tb_crew where player_id = v_rep.lead;
        v_n := array_length(v_rep.members, 1);
        v_k := array_position(v_rep.members, p_me.id);
        v_mine := v_mine || jsonb_build_object('repair', jsonb_build_object(
          'kind', v_rep.kind, 'place', v_rep.place, 'members', to_jsonb(v_rep.members), 'lead', v_rep.lead,
          'lead_name', v_lead_name, 'solved', v_rep.solved, 'result', v_rep.result, 'tries', v_rep.tries, 'msg', v_rep.msg,
          'is_lead', p_me.id = v_rep.lead,
          -- Wires: the readers' riddles (in a trio, each reader gets one of the two).
          'riddles', case when v_rep.kind = 'wires' and p_me.id <> v_rep.lead then
              case when v_n = 3 then to_jsonb(array[case when v_k = 2 then 'wire' else 'code' end])
                   else to_jsonb(array['wire', 'code']) end end,
          'lead_q', case when v_rep.kind = 'wires' and p_me.id <> v_rep.lead then v_lead_q end,
          -- Guide: the operator sees the answers but not whose; the guide sees the question.
          'options', case when v_rep.kind = 'guide' and p_me.id = v_rep.lead then
              (select jsonb_agg(o -> 'a') from jsonb_array_elements(v_rep.options) o) end
        ));
      end if;
    end if;
    if p_room.phase = 'tb_hands' then
      v_rows := private.tb_pipe_rows(p_room.id, p_me.id);
      v_mine := v_mine || jsonb_build_object(
        'listener', p_me.id = v_game.sonar_listener,
        -- Only the listener's phone gets the signal (as shorts and longs, not letters).
        'signal', case when p_me.id = v_game.sonar_listener and v_game.hands_kind = 'sonar' then (
          select string_agg(case ch
            when 'A' then '.-' when 'B' then '-...' when 'C' then '-.-.' when 'D' then '-..' when 'E' then '.'
            when 'F' then '..-.' when 'I' then '..' when 'K' then '-.-' when 'L' then '.-..' when 'O' then '---'
            when 'P' then '.--.' when 'R' then '.-.' when 'S' then '...' when 'U' then '..-' when 'Y' then '-.--'
            else '' end, ' ')
          from regexp_split_to_table(v_game.sonar_word, '') ch) end,
        'see', v_rows[1], 'turn', v_rows[2],
        'leak', private.tb_leak_role(p_room.id, p_me.id)
      );
    end if;
    v_out := v_out || jsonb_build_object('mine', v_mine);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- What each screen sees
-- ---------------------------------------------------------------------------

-- Everything one screen needs, and nothing it shouldn't see:
-- the TV gets the public picture; each phone also gets its own role, its own
-- lock (with only its side of the secret) and its own half of the note.
create function public.get_view(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_me public.players := private.me(p_room_id);
  v_game public.games;
  v_is_tv boolean;
  v_murderer boolean;
  v_pair public.pairs;
  v_note public.notes;
  v_view jsonb;
  v_lock jsonb;
  v_words text[];
  v_cut int;
  v_half int;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'You are not in this room';
  end if;
  v_is_tv := v_room.host_id = auth.uid() and v_me.id is null;
  select * into v_game from public.games where room_id = p_room_id;
  v_murderer := v_me.id is not null and v_game.murderer_id = v_me.id;

  v_view := jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'phase', v_room.phase, 'round', v_room.round,
      'phase_at', v_room.phase_at, 'deadline', v_room.deadline, 'total_secs', v_room.total_secs,
      'version', v_room.version, 'focus', v_room.focus, 'focus_dir', v_room.focus_dir,
      'focus_at', v_room.focus_at, 'story', v_room.story, 'book_at', v_room.book_at
    ),
    'server_now', now(),
    'me', v_me.id,
    'is_tv', v_is_tv,
    'host_player', private.host_player(p_room_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'color', p.color, 'joined', p.joined_at is not null, 'portrait_url', p.portrait_url,
        'portrait', p.portrait, 'picked', p.picked, 'answered', p.answered,
        'opened', p.opened, 'ready', p.ready, 'dead', p.dead, 'dead_at', p.dead_at,
        'signed_at', p.signed_at, 'signature', case when v_room.phase = 'lobby' then p.signature end,
        'voted', v_room.phase = 'meeting' and exists (
          select 1 from public.votes v where v.room_id = p_room_id and v.round = v_room.round and v.voter_id = p.id
        )
      ) order by p.joined_at nulls last, p.created_at, p.id)
      from public.players p where p.room_id = p_room_id
    ), '[]')
  );

  if v_me.id is not null then
    v_view := v_view || jsonb_build_object('my_answers', coalesce((
      select jsonb_agg(jsonb_build_object('q', a.question, 'a', a.answer) order by a.idx)
      from public.answers a where a.player_id = v_me.id
    ), '[]'));
  end if;

  -- Trapped Below has its own slice.
  if v_room.story = 'station' then
    return v_view || jsonb_build_object('tb', private.tb_view(v_room, v_me));
  end if;

  if v_room.phase in ('join', 'browse', 'lobby') or v_game.room_id is null then
    return v_view;
  end if;

  if v_me.id is not null then
    v_view := v_view || jsonb_build_object('role', case when v_murderer then 'murderer' else 'detective' end);
  end if;

  -- This round's pairs, as the TV shows them.
  v_view := v_view || jsonb_build_object('pairs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'idx', pr.idx, 'members', to_jsonb(pr.members), 'room', pr.room_key,
      'lock_type', pr.lock_type, 'solved', pr.solved, 'tries', pr.tries
    ) order by pr.idx)
    from public.pairs pr where pr.room_id = p_room_id and pr.round = v_room.round
  ), '[]'));

  -- Every note found so far. Whose it was only comes out at the end.
  v_view := v_view || jsonb_build_object('found', coalesce((
    select jsonb_agg(jsonb_build_object(
      'round', n.found_round, 'room', n.found_room, 'found_by', to_jsonb(n.found_by),
      'q', n.question, 'a', n.answer, 'murderer', n.murderer
    ) || case when v_room.phase = 'ended'
              then jsonb_build_object('owner', n.owner_id, 'forged', n.forged)
              else '{}' end
    order by n.found_round, n.found_at, n.id)
    from public.notes n where n.room_id = p_room_id and n.status = 'found'
  ), '[]'));

  v_view := v_view || jsonb_build_object(
    'stuck', to_jsonb(v_game.stuck),
    'report', v_game.report,
    'result', case when v_room.phase in ('tally', 'revealed', 'ended') then v_game.result end
  );

  if v_room.phase = 'ended' then
    v_view := v_view || jsonb_build_object(
      'murderer', v_game.murderer_id, 'outcome', v_game.outcome, 'reason', v_game.reason,
      'lost_forgery', (select answer from public.notes where id = v_game.forged_note_id and status <> 'found')
    );
  end if;

  -- The phone's own lock: only its side of the secret.
  if v_me.id is not null and v_room.phase = 'tasks' then
    select * into v_pair from public.pairs
    where room_id = p_room_id and round = v_room.round and v_me.id = any (members);
    if found then
      v_lock := jsonb_build_object(
        'idx', v_pair.idx, 'room', v_pair.room_key, 'members', to_jsonb(v_pair.members),
        'lock_type', v_pair.lock_type, 'lead', v_pair.lead, 'solved', v_pair.solved,
        'tries', v_pair.tries, 'msg', v_pair.msg,
        'side', case when (array_position(v_pair.members, v_me.id) - 1) % 2 = 0 then 'a' else 'b' end
      );
      if v_pair.lock_type in ('charade', 'sketch') and v_me.id = v_pair.lead then
        v_lock := v_lock || jsonb_build_object('say', v_pair.say);
      end if;
      if v_pair.lock_type = 'sketch' then
        v_lock := v_lock || jsonb_build_object('strokes', v_pair.strokes);
      end if;
      if v_pair.lock_type = 'lie' then
        v_lock := v_lock || jsonb_build_object('lie_set', v_pair.lie is not null)
          || case when v_me.id = v_pair.lead then jsonb_build_object('lie', v_pair.lie) else '{}' end;
      end if;
      if v_pair.lock_type = 'fuse' and (array_position(v_pair.members, v_me.id) - 1) % 2 = 0 then
        v_lock := v_lock || jsonb_build_object('wires', to_jsonb(v_pair.wires));
      end if;
      -- Opened: this phone's half of the torn note.
      if v_pair.solved then
        select * into v_note from public.notes where id = v_pair.note_id;
        if v_note.id is null then
          v_lock := v_lock || jsonb_build_object('note', null);
        else
          v_words := regexp_split_to_array(regexp_replace(btrim(v_note.answer), '[.!]$', ''), '\s+');
          v_cut := greatest(1, ceil(array_length(v_words, 1) / 2.0)::int);
          v_half := (array_position(v_pair.members, v_me.id) - 1) % 2;
          v_lock := v_lock || jsonb_build_object('note', jsonb_build_object(
            'q', v_note.question, 'murderer', v_note.murderer, 'half', v_half,
            'words', case when v_half = 0 then array_to_string(v_words[1:v_cut], ' ')
                          else array_to_string(v_words[v_cut + 1:], ' ') end
          ));
        end if;
      end if;
      v_view := v_view || jsonb_build_object('lock', v_lock);
    end if;
  end if;

  -- The murderer's secret panel.
  if v_murderer then
    v_view := v_view || jsonb_build_object('secret', jsonb_build_object(
      'questions', coalesce((select jsonb_agg(distinct a.question) from public.answers a where a.room_id = p_room_id), '[]'),
      'forged', (select jsonb_build_object('a', n.answer, 'found', n.status = 'found')
                 from public.notes n where n.id = v_game.forged_note_id),
      'can_kill', v_room.round >= 2 and v_room.round % 2 = 0 and v_me.dead is null,
      'kill_state', v_game.kill_state,
      'kill_target', v_game.kill_target
    ));
  end if;

  return v_view;
end;
$$;

-- Functions in the private schema are internal only.
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Portraits: the public "portraits" bucket in Supabase Storage
-- ---------------------------------------------------------------------------
-- Phones upload the portrait drawn for them (a ~50 KB JPEG) into a folder named
-- after their own user id; anyone can view them, so the TV can show them.
-- Skipped where there is no Storage (a plain Postgres used for testing).
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('portraits', 'portraits', true, 300000, array['image/jpeg'])
  on conflict (id) do update
    set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists "portraits: upload your own" on storage.objects';
  execute $p$
    create policy "portraits: upload your own" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end;
$$;
