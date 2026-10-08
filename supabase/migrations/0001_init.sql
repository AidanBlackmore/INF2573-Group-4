-- Mall game prototype: rooms, players, choices.
--
-- Security model
-- - Every device (host laptop and phones) signs in with Supabase Anonymous Auth.
-- - Clients can only SELECT. All writes go through the SECURITY DEFINER
--   functions at the bottom, which validate every request on the server.
-- - A choice is readable by the player who made it. Everyone else in the room
--   can only read it once the room phase is 'revealed' for that round.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby', 'choosing', 'revealed')),
  round int not null default 0,
  created_at timestamptz not null default now()
);
create index rooms_host_id_idx on public.rooms (host_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  -- Last round this player submitted a choice in. Lets the host show who has
  -- submitted without being able to read what they picked.
  submitted_round int not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create unique index players_room_name_idx on public.players (room_id, lower(name));
create index players_user_id_idx on public.players (user_id);

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  chosen_player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One choice per player per round. Double taps hit this and are ignored.
  unique (room_id, round, player_id)
);
create index choices_player_id_idx on public.choices (player_id);
create index choices_chosen_player_id_idx on public.choices (chosen_player_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.choices enable row level security;

-- Clients never write directly; only the functions below can.
revoke all on public.rooms, public.players, public.choices from anon;
revoke insert, update, delete, truncate on public.rooms, public.players, public.choices from authenticated;

-- True if the current user is the host of the room or has joined it.
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

-- Room rows hold only the code, phase and round, so any signed-in device may
-- read them. Phones need this to look up a room by its code before joining.
create policy "rooms are readable by signed-in users"
  on public.rooms for select to authenticated
  using (true);

create policy "players are readable by the room"
  on public.players for select to authenticated
  using (user_id = (select auth.uid()) or public.is_room_member(room_id));

create policy "choices are private until reveal"
  on public.choices for select to authenticated
  using (
    -- Your own choice, so a refreshed phone knows it already submitted.
    exists (
      select 1 from public.players p
      where p.id = choices.player_id and p.user_id = (select auth.uid())
    )
    -- Everyone's choices, but only once this round has been revealed.
    or (
      public.is_room_member(choices.room_id)
      and exists (
        select 1 from public.rooms r
        where r.id = choices.room_id and r.phase = 'revealed' and r.round = choices.round
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Server-side actions
-- ---------------------------------------------------------------------------

create function public.create_room()
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_words text[] := array['WOLF','BEAR','LYNX','HAWK','OWL','FOX','DEER','MOTH',
                          'CROW','SEAL','TOAD','HARE','MOLE','WREN','LION','ORCA'];
  v_code text;
  v_room public.rooms;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  for attempt in 1..50 loop
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int]
              || lpad(floor(random() * 100)::int::text, 2, '0');
    begin
      insert into public.rooms (code, host_id) values (v_code, v_uid)
      returning * into v_room;
      return v_room;
    exception when unique_violation then
      -- Code already taken, try another one.
    end;
  end loop;

  raise exception 'Could not generate a room code, please try again';
end;
$$;

create function public.join_room(p_code text, p_name text)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_room public.rooms;
  v_player public.players;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_room from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception 'Room not found';
  end if;

  -- Rejoining from the same device returns the existing player.
  select * into v_player from public.players where room_id = v_room.id and user_id = v_uid;
  if found then
    return v_player;
  end if;

  if char_length(v_name) not between 1 and 20 then
    raise exception 'Name must be 1 to 20 characters';
  end if;

  begin
    insert into public.players (room_id, user_id, name) values (v_room.id, v_uid, v_name)
    returning * into v_player;
  exception when unique_violation then
    raise exception 'That name is already taken in this room';
  end;

  return v_player;
end;
$$;

-- Starts the first round from the lobby, or a new round after a reveal.
-- A new round number means a clean slate: old choices belong to old rounds.
create function public.start_round(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_id is distinct from auth.uid() then
    raise exception 'Only the host can start a round';
  end if;
  if v_room.phase = 'choosing' then
    raise exception 'A round is already in progress';
  end if;
  if (select count(*) from public.players where room_id = p_room_id) < 2 then
    raise exception 'At least 2 players are needed';
  end if;

  update public.rooms set phase = 'choosing', round = round + 1
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

create function public.submit_choice(p_room_id uuid, p_chosen_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_player public.players;
begin
  -- Lock the room so simultaneous last submissions cannot both miss the reveal.
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;

  select * into v_player from public.players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'You are not in this room';
  end if;

  if v_room.phase <> 'choosing' then
    raise exception 'This round is not accepting choices';
  end if;

  if not exists (select 1 from public.players where id = p_chosen_player_id and room_id = p_room_id) then
    raise exception 'That player is not in this room';
  end if;

  -- First submission wins; repeats (double taps, retries) are ignored.
  insert into public.choices (room_id, round, player_id, chosen_player_id)
  values (p_room_id, v_room.round, v_player.id, p_chosen_player_id)
  on conflict (room_id, round, player_id) do nothing;

  update public.players set submitted_round = v_room.round where id = v_player.id;

  -- Reveal automatically once everyone in the room has chosen.
  if (select count(*) from public.choices where room_id = p_room_id and round = v_room.round)
     >= (select count(*) from public.players where room_id = p_room_id) then
    update public.rooms set phase = 'revealed' where id = p_room_id;
  end if;
end;
$$;

create function public.reveal_now(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_id is distinct from auth.uid() then
    raise exception 'Only the host can reveal';
  end if;
  if v_room.phase <> 'choosing' then
    raise exception 'There is no round to reveal';
  end if;

  update public.rooms set phase = 'revealed' where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

revoke execute on function
  public.is_room_member(uuid),
  public.create_room(),
  public.join_room(text, text),
  public.start_round(uuid),
  public.submit_choice(uuid, uuid),
  public.reveal_now(uuid)
from public, anon;

grant execute on function
  public.is_room_member(uuid),
  public.create_room(),
  public.join_room(text, text),
  public.start_round(uuid),
  public.submit_choice(uuid, uuid),
  public.reveal_now(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Screens subscribe to room and player changes. Choices are not broadcast:
-- clients fetch them after the room switches to 'revealed', so RLS decides.
alter publication supabase_realtime add table public.rooms, public.players;
