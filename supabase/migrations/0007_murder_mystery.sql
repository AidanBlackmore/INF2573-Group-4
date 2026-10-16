-- Icebreaker question and the murder mystery.
--
-- Icebreaker: in the lobby, every player answers a niche question before the
-- game can start. Answers are private and can't be edited once submitted.
--
-- Murder mystery: one player is secretly the murderer and a body is hidden in
-- one room of the mansion. Each act the group votes on a room to search. The
-- murderer gets one secret action per act. Finding the body reveals the
-- murderer's icebreaker answer as a clue, then the group accuses someone.
-- All mystery state is hidden from clients and read through get_mystery().

-- ---------------------------------------------------------------------------
-- Icebreaker
-- ---------------------------------------------------------------------------

-- Public, so the shared screen can show who has answered (never what).
alter table public.players add column icebreaker_done boolean not null default false;

create table public.icebreaker_answers (
  player_id uuid primary key references public.players (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  answer text not null check (char_length(answer) between 1 and 280),
  created_at timestamptz not null default now()
);
create index icebreaker_answers_room_id_idx on public.icebreaker_answers (room_id);

alter table public.icebreaker_answers enable row level security;
revoke all on public.icebreaker_answers from anon;

-- You can read your own answer. Nobody else can, ever: the murder mystery
-- reveals the murderer's answer through get_mystery() only.
create policy "own icebreaker answer"
  on public.icebreaker_answers for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = icebreaker_answers.player_id and p.user_id = (select auth.uid())
    )
  );

create function public.answer_icebreaker(p_room_id uuid, p_question text, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_player public.players;
  v_question text := btrim(coalesce(p_question, ''));
  v_answer text := btrim(coalesce(p_answer, ''));
  v_inserted int;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;
  select * into v_player from public.players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'You are not in this room';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'The game has already started';
  end if;
  if char_length(v_question) not between 1 and 200 then
    raise exception 'Missing question';
  end if;
  if char_length(v_answer) not between 1 and 280 then
    raise exception 'Answer must be 1 to 280 characters';
  end if;

  -- Answers are final: a second submission is refused.
  insert into public.icebreaker_answers (player_id, room_id, question, answer)
  values (v_player.id, p_room_id, v_question, v_answer)
  on conflict (player_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'Your answer is already locked in';
  end if;

  update public.players set icebreaker_done = true where id = v_player.id;
end;
$$;

-- Same as 0003, plus: everyone must have answered the icebreaker first.
create or replace function public.start_universe(
  p_room_id uuid,
  p_universe_id text,
  p_act_kind text,
  p_act_options text[]
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_players int;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase = 'choosing' then
    raise exception 'An act is already in progress';
  end if;
  if char_length(coalesce(p_universe_id, '')) not between 1 and 60 then
    raise exception 'Pick a universe first';
  end if;
  select count(*) into v_players from public.players where room_id = p_room_id;
  if v_players not between 2 and 6 then
    raise exception 'Needs 2 to 6 players';
  end if;
  if exists (select 1 from public.players where room_id = p_room_id and not icebreaker_done) then
    raise exception 'Waiting for everyone to answer the question';
  end if;
  perform private.check_act(p_act_kind, p_act_options);

  update public.rooms set
    universe_id = p_universe_id,
    act = 1,
    act_kind = p_act_kind,
    act_options = coalesce(p_act_options, '{}'),
    round = round + 1,
    run_start_round = round + 1,
    phase = 'choosing',
    stage = 0,
    tie_options = '{}',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

-- The mansion map has more rooms than a normal act has options.
create or replace function private.check_act(p_kind text, p_options text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_kind = 'player' then
    if coalesce(array_length(p_options, 1), 0) <> 0 then
      raise exception 'A person-picking act has no options';
    end if;
  elsif p_kind = 'option' then
    if coalesce(array_length(p_options, 1), 0) not between 2 and 12 then
      raise exception 'An option act needs 2 to 12 options';
    end if;
  else
    raise exception 'Unknown act kind';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Murder mystery state (no client can read these tables directly)
-- ---------------------------------------------------------------------------

create table public.mysteries (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  rooms text[] not null,
  max_searches int not null default 9,
  murderer_id uuid not null references public.players (id) on delete cascade,
  body_room text not null,
  body_moved boolean not null default false,
  found_act int,
  accused_id uuid references public.players (id) on delete set null,
  outcome text check (outcome in ('detectives', 'murderer'))
);

-- Searches (one per round) and the murderer's secret actions (one per round).
create table public.mystery_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  act int not null,
  kind text not null check (kind in ('search', 'plant', 'move', 'lie_low')),
  room_key text,
  framed_player_id uuid references public.players (id) on delete cascade,
  result text check (result in ('empty', 'evidence', 'body')),
  -- Planted evidence is used up once it's found.
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index mystery_one_search_per_round
  on public.mystery_events (room_id, round) where kind = 'search';
create unique index mystery_one_action_per_round
  on public.mystery_events (room_id, round) where kind <> 'search';

alter table public.mysteries enable row level security;
alter table public.mystery_events enable row level security;
revoke all on public.mysteries, public.mystery_events from anon, authenticated;

-- Called by the shared screen just before start_universe. Picks the murderer
-- and where the body is, at random. Calling it again (a replay) starts over.
create function public.mystery_setup(p_room_id uuid, p_rooms text[], p_max_searches int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_count int := coalesce(array_length(p_rooms, 1), 0);
  v_murderer uuid;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase = 'choosing' then
    raise exception 'An act is already in progress';
  end if;
  if (select count(*) from public.players where room_id = p_room_id) < 3 then
    raise exception 'The murder mystery needs at least 3 players';
  end if;
  if v_count not between 2 and 12 or (select count(distinct r) from unnest(p_rooms) r) <> v_count then
    raise exception 'The mansion needs 2 to 12 different rooms';
  end if;
  if p_max_searches not between 1 and 9 then
    raise exception 'Between 1 and 9 searches';
  end if;

  select id into v_murderer from public.players where room_id = p_room_id order by random() limit 1;

  delete from public.mystery_events where room_id = p_room_id;
  insert into public.mysteries (room_id, rooms, max_searches, murderer_id, body_room)
  values (p_room_id, p_rooms, p_max_searches, v_murderer, p_rooms[1 + floor(random() * v_count)::int])
  on conflict (room_id) do update set
    rooms = excluded.rooms,
    max_searches = excluded.max_searches,
    murderer_id = excluded.murderer_id,
    body_room = excluded.body_room,
    body_moved = false,
    found_act = null,
    accused_id = null,
    outcome = null;
end;
$$;

-- The murderer's secret action for this act: plant evidence framing someone
-- in a room, move the body (once per game), or lie low.
create function public.murderer_action(
  p_room_id uuid,
  p_kind text,
  p_room_key text default null,
  p_framed_player_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_mystery public.mysteries;
  v_me uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  select id into v_me from public.players where room_id = p_room_id and user_id = auth.uid();
  select * into v_mystery from public.mysteries where room_id = p_room_id for update;
  if v_me is null or not found or v_mystery.murderer_id <> v_me then
    raise exception 'Only the murderer can do that';
  end if;
  if v_room.phase <> 'choosing' or v_room.act_kind <> 'option' or v_mystery.found_act is not null then
    raise exception 'Not right now';
  end if;

  if p_kind = 'plant' then
    if not (p_room_key = any (v_mystery.rooms)) then
      raise exception 'Pick a room in the mansion';
    end if;
    if p_framed_player_id is null or p_framed_player_id = v_me or not exists (
      select 1 from public.players where id = p_framed_player_id and room_id = p_room_id
    ) then
      raise exception 'Pick someone else to frame';
    end if;
  elsif p_kind = 'move' then
    if v_mystery.body_moved then
      raise exception 'You have already moved the body';
    end if;
    if not (p_room_key = any (v_mystery.rooms)) or p_room_key = v_mystery.body_room then
      raise exception 'Pick a different room';
    end if;
  elsif p_kind <> 'lie_low' then
    raise exception 'Unknown action';
  end if;

  begin
    insert into public.mystery_events (room_id, round, act, kind, room_key, framed_player_id)
    values (
      p_room_id, v_room.round, v_room.act, p_kind,
      case when p_kind = 'lie_low' then null else p_room_key end,
      case when p_kind = 'plant' then p_framed_player_id end
    );
  exception when unique_violation then
    raise exception 'You have already acted this round';
  end;

  if p_kind = 'move' then
    update public.mysteries set body_room = p_room_key, body_moved = true where room_id = p_room_id;
  end if;
end;
$$;

-- Searches the room the group voted for. Safe to call twice: the second call
-- returns the same result.
create function public.mystery_search(p_room_id uuid, p_room_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_mystery public.mysteries;
  v_event public.mystery_events;
  v_plant public.mystery_events;
  v_result text := 'empty';
begin
  v_room := private.lock_room_as_host(p_room_id);
  select * into v_mystery from public.mysteries where room_id = p_room_id for update;
  if not found then
    raise exception 'This room is not playing the murder mystery';
  end if;
  if v_room.phase <> 'revealed' or v_room.act_kind <> 'option' then
    raise exception 'Reveal the vote first';
  end if;

  select * into v_event from public.mystery_events
  where room_id = p_room_id and round = v_room.round and kind = 'search';
  if not found then
    if not (p_room_key = any (v_mystery.rooms)) then
      raise exception 'Not a room in the mansion';
    end if;
    if p_room_key = v_mystery.body_room then
      v_result := 'body';
      update public.mysteries set found_act = v_room.act where room_id = p_room_id;
    else
      select * into v_plant from public.mystery_events
      where room_id = p_room_id and kind = 'plant' and room_key = p_room_key and not consumed
      order by created_at limit 1;
      if found then
        v_result := 'evidence';
        update public.mystery_events set consumed = true where id = v_plant.id;
      end if;
    end if;
    insert into public.mystery_events (room_id, round, act, kind, room_key, framed_player_id, result)
    values (p_room_id, v_room.round, v_room.act, 'search', p_room_key,
            case when v_result = 'evidence' then v_plant.framed_player_id end, v_result)
    returning * into v_event;
  end if;

  -- Touch the room so every screen reloads and sees the result.
  update public.rooms set round = round where id = p_room_id;
  return jsonb_build_object(
    'room_key', v_event.room_key,
    'result', v_event.result,
    'framed_player_id', v_event.framed_player_id
  );
end;
$$;

-- Moves the story on. After a search: the accusation if the body was found,
-- the end if that was the last search (the murderer wins), else the next
-- search. After the accusation: the end.
create function public.mystery_next(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_mystery public.mysteries;
begin
  v_room := private.lock_room_as_host(p_room_id);
  select * into v_mystery from public.mysteries where room_id = p_room_id for update;
  if not found then
    raise exception 'This room is not playing the murder mystery';
  end if;
  if v_room.phase <> 'revealed' then
    raise exception 'Reveal this act first';
  end if;

  if v_room.act_kind = 'player' then
    if v_mystery.outcome is null then
      raise exception 'Make the accusation first';
    end if;
    update public.rooms set phase = 'ended' where id = p_room_id returning * into v_room;
    return v_room;
  end if;

  if not exists (
    select 1 from public.mystery_events
    where room_id = p_room_id and round = v_room.round and kind = 'search'
  ) then
    raise exception 'Search a room first';
  end if;

  if v_mystery.found_act is not null then
    -- The accusation is always the last act.
    update public.rooms set
      act = v_mystery.max_searches + 1, act_kind = 'player', act_options = '{}',
      round = round + 1, phase = 'choosing', stage = 0, tie_options = '{}', tie_pick = null
    where id = p_room_id returning * into v_room;
  elsif v_room.act >= v_mystery.max_searches then
    update public.mysteries set outcome = 'murderer' where room_id = p_room_id;
    update public.rooms set phase = 'ended' where id = p_room_id returning * into v_room;
  else
    update public.rooms set
      act = act + 1, act_kind = 'option', act_options = v_mystery.rooms,
      round = round + 1, phase = 'choosing', stage = 0, tie_options = '{}', tie_pick = null
    where id = p_room_id returning * into v_room;
  end if;
  return v_room;
end;
$$;

-- Records who the group accused. Detectives win if it's the murderer.
create function public.mystery_accuse(p_room_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_mystery public.mysteries;
begin
  v_room := private.lock_room_as_host(p_room_id);
  select * into v_mystery from public.mysteries where room_id = p_room_id for update;
  if not found then
    raise exception 'This room is not playing the murder mystery';
  end if;
  if v_room.phase <> 'revealed' or v_room.act_kind <> 'player' or v_mystery.found_act is null then
    raise exception 'Not time to accuse yet';
  end if;
  if v_mystery.outcome is null then
    if not exists (select 1 from public.players where id = p_player_id and room_id = p_room_id) then
      raise exception 'Accuse someone in this room';
    end if;
    update public.mysteries set
      accused_id = p_player_id,
      outcome = case when p_player_id = v_mystery.murderer_id then 'detectives' else 'murderer' end
    where room_id = p_room_id
    returning * into v_mystery;
    update public.rooms set round = round where id = p_room_id;
  end if;
  return jsonb_build_object(
    'accused_id', v_mystery.accused_id,
    'murderer_id', v_mystery.murderer_id,
    'outcome', v_mystery.outcome
  );
end;
$$;

-- Everything a screen may know about the mystery right now.
-- - The murderer learns they are the murderer, where the body is, and their own actions.
-- - Everyone sees the searches so far.
-- - The body's room and the clue appear once the body is found.
-- - Who the murderer is appears once the game is decided.
create function public.get_mystery(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_mystery public.mysteries;
  v_me uuid;
  v_is_murderer boolean;
  v_found boolean;
  v_decided boolean;
  v_clue jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;
  select id into v_me from public.players where room_id = p_room_id and user_id = auth.uid();
  if v_me is null and v_room.host_id is distinct from auth.uid() then
    raise exception 'You are not in this room';
  end if;
  select * into v_mystery from public.mysteries where room_id = p_room_id;
  if not found then
    return null;
  end if;

  v_is_murderer := v_me is not null and v_me = v_mystery.murderer_id;
  v_found := v_mystery.found_act is not null;
  v_decided := v_mystery.outcome is not null;

  if v_found or v_decided then
    select jsonb_build_object('question', a.question, 'answer', a.answer) into v_clue
    from public.icebreaker_answers a where a.player_id = v_mystery.murderer_id;
  end if;

  return jsonb_build_object(
    'you_are_murderer', v_is_murderer,
    'move_available', case when v_is_murderer then not v_mystery.body_moved and not v_found end,
    'my_action', case when v_is_murderer then (
      select jsonb_build_object('kind', e.kind, 'room_key', e.room_key, 'framed_player_id', e.framed_player_id)
      from public.mystery_events e
      where e.room_id = p_room_id and e.round = v_room.round and e.kind <> 'search'
    ) end,
    'searches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'act', s.act,
        'round', s.round,
        'room_key', s.room_key,
        'result', s.result,
        'framed_player_id', s.framed_player_id,
        'dragged', exists (
          select 1 from public.mystery_events m
          where m.room_id = s.room_id and m.round = s.round and m.kind = 'move'
        )
      ) order by s.round)
      from public.mystery_events s
      where s.room_id = p_room_id and s.kind = 'search'
    ), '[]'::jsonb),
    'max_searches', v_mystery.max_searches,
    'found_act', v_mystery.found_act,
    -- The murderer always knows where the body is; detectives once it's found.
    'body_room', case when v_found or v_decided or v_is_murderer then v_mystery.body_room end,
    'clue', v_clue,
    'murderer_id', case when v_decided then v_mystery.murderer_id end,
    'accused_id', v_mystery.accused_id,
    'outcome', v_mystery.outcome
  );
end;
$$;

revoke execute on function
  public.answer_icebreaker(uuid, text, text),
  public.mystery_setup(uuid, text[], int),
  public.murderer_action(uuid, text, text, uuid),
  public.mystery_search(uuid, text),
  public.mystery_next(uuid),
  public.mystery_accuse(uuid, uuid),
  public.get_mystery(uuid)
from public, anon;

grant execute on function
  public.answer_icebreaker(uuid, text, text),
  public.mystery_setup(uuid, text[], int),
  public.murderer_action(uuid, text, text, uuid),
  public.mystery_search(uuid, text),
  public.mystery_next(uuid),
  public.mystery_accuse(uuid, uuid),
  public.get_mystery(uuid)
to authenticated;
