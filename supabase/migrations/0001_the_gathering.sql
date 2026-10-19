-- The Gathering, and its first story: Murder at Marlowe Manor.
--
-- One database file for the whole game. Run it once in the Supabase SQL Editor.
-- It is safe to run again, and on a project that still has the old Alternate
-- Universes tables: the first section removes them (and any games in progress).
--
-- How the game works
-- - The TV (host laptop) creates a room. Up to 6 phones scan the QR code (or
--   type the code) and pick a name and a colour. Once everyone's in, the group
--   browses the stories together and the host enters one.
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
        'pick_color', 'set_name_color', 'we_are_in', 'browse_story', 'enter_story', 'another_story'
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
    check (phase in ('join', 'browse', 'lobby', 'roles', 'tasks', 'quiet', 'discuss', 'meeting', 'tally', 'revealed', 'ended')),
  -- The story on screen in the browser (0 = Marlowe Manor), which way the last swipe went, and when.
  focus int not null default 0 check (focus between 0 and 3),
  focus_dir int not null default 1 check (focus_dir in (-1, 1)),
  focus_at timestamptz not null default now(),
  -- The story being played.
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
  -- Which of the six detective portraits (1 to 6).
  -- The player's colour (1 to 6), picked in the lobby and used everywhere.
  color int check (color between 1 and 6),
  -- Set when the player taps "I'm in" (name and colour chosen).
  joined_at timestamptz,
  -- Which of the six detective portraits (1 to 6), picked inside Marlowe Manor.
  portrait int check (portrait between 1 and 6),
  picked boolean not null default false,
  answered boolean not null default false,
  -- Opened the role envelope / tapped "Got it".
  opened boolean not null default false,
  ready boolean not null default false,
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

  insert into public.players (room_id, user_id) values (v_room.id, v_uid) returning * into v_player;
  perform private.touch(v_room.id);
  return v_player;
end;
$$;

-- The Gathering: picking a colour before "I'm in", so everyone else sees it as taken.
create function public.pick_color(p_room_id uuid, p_color int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := private.lock_room(p_room_id);
  v_player public.players := private.me(p_room_id);
begin
  if v_player.id is null or v_room.phase <> 'join' or p_color is null or p_color not between 1 and 6 then
    return;
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and color = p_color) then
    raise exception 'That colour is taken';
  end if;
  update public.players set color = p_color where id = v_player.id;
  perform private.touch(p_room_id);
end;
$$;

-- The Gathering: "What should we call you?" A name and a colour, then "I'm in".
create function public.set_name_color(p_room_id uuid, p_name text, p_color int)
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
  if v_room.phase <> 'join' then
    raise exception 'This game has already started';
  end if;
  if char_length(v_name) not between 1 and 12 then
    raise exception 'Type your name to continue.';
  end if;
  if p_color is null or p_color not between 1 and 6 then
    raise exception 'Pick a color.';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and color = p_color) then
    raise exception 'That colour is taken';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and id <> v_player.id and lower(name) = lower(v_name)) then
    raise exception 'Someone here already has that name.';
  end if;
  update public.players set name = v_name, color = p_color, joined_at = coalesce(joined_at, clock_timestamp())
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

-- "Enter this story". Only Murder at Marlowe Manor (story 0) is open so far.
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
  if v_room.focus <> 0 then
    raise exception 'This story is coming soon';
  end if;
  -- Everyone starts with a different detective portrait, and can pick another.
  update public.players p set portrait = pick.k, picked = false
  from (
    select id, row_number() over (order by random()) as k
    from public.players where room_id = p_room_id
  ) pick
  where p.id = pick.id;
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
  if v_room.phase <> 'ended' then
    return;
  end if;
  delete from public.votes where room_id = p_room_id;
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
      'focus_at', v_room.focus_at, 'story', v_room.story
    ),
    'server_now', now(),
    'me', v_me.id,
    'is_tv', v_is_tv,
    'host_player', private.host_player(p_room_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'color', p.color, 'joined', p.joined_at is not null,
        'portrait', p.portrait, 'picked', p.picked, 'answered', p.answered,
        'opened', p.opened, 'ready', p.ready, 'dead', p.dead, 'dead_at', p.dead_at,
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
