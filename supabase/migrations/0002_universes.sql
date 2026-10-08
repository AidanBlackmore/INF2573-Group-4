-- Universes: a room plays a 4-act episode chosen by the host.
--
-- Story text lives in the app (content/universes.ts). The database only knows
-- which universe and act is running, whether the act is a person pick or an
-- option pick, and which option keys are valid, so it can validate choices.
--
-- Rounds keep counting up across acts and replays. A run (one playthrough of a
-- universe) covers rounds run_start_round .. run_start_round + acts - 1.

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

alter table public.rooms drop constraint rooms_phase_check;
alter table public.rooms add constraint rooms_phase_check
  check (phase in ('lobby', 'choosing', 'revealed', 'ended'));

alter table public.rooms
  add column universe_id text,
  add column act int not null default 0,
  add column act_kind text check (act_kind in ('player', 'option')),
  add column act_options text[] not null default '{}',
  add column run_start_round int not null default 0,
  -- Set by the host when the most-voted answers are tied. Never automatic.
  add column tie_pick text;

alter table public.choices
  alter column chosen_player_id drop not null,
  add column chosen_option text,
  add constraint choices_one_answer check (num_nonnulls(chosen_player_id, chosen_option) = 1);

-- Choices from earlier acts stay readable to the room (they were revealed),
-- so the ending recap can compare everyone's answers.
drop policy "choices are private until reveal" on public.choices;
create policy "choices are private until reveal"
  on public.choices for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = choices.player_id and p.user_id = (select auth.uid())
    )
    or (
      public.is_room_member(choices.room_id)
      and exists (
        select 1 from public.rooms r
        where r.id = choices.room_id
          and (
            choices.round < r.round
            or (choices.round = r.round and r.phase in ('revealed', 'ended'))
          )
      )
    )
  );

drop function public.start_round(uuid);
drop function public.submit_choice(uuid, uuid);

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------

create schema if not exists private;

create function private.lock_room_as_host(p_room_id uuid)
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
    raise exception 'Only the host can do that';
  end if;
  return v_room;
end;
$$;

create function private.check_act(p_kind text, p_options text[])
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
    if coalesce(array_length(p_options, 1), 0) not between 2 and 6 then
      raise exception 'An option act needs 2 to 6 options';
    end if;
  else
    raise exception 'Unknown act kind';
  end if;
end;
$$;

revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-side actions
-- ---------------------------------------------------------------------------

-- Same as before, plus a 6 player limit.
create or replace function public.join_room(p_code text, p_name text)
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

  -- Lock so two phones cannot both take the last seat.
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'Room not found';
  end if;

  -- Rejoining from the same device returns the existing player.
  select * into v_player from public.players where room_id = v_room.id and user_id = v_uid;
  if found then
    return v_player;
  end if;

  if (select count(*) from public.players where room_id = v_room.id) >= 6 then
    raise exception 'This room is full (6 players max)';
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

-- Starts act 1 of a universe. Used for the first play and for replays.
create function public.start_universe(
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
  perform private.check_act(p_act_kind, p_act_options);

  update public.rooms set
    universe_id = p_universe_id,
    act = 1,
    act_kind = p_act_kind,
    act_options = coalesce(p_act_options, '{}'),
    round = round + 1,
    run_start_round = round + 1,
    phase = 'choosing',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

create function public.next_act(p_room_id uuid, p_act_kind text, p_act_options text[])
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'revealed' then
    raise exception 'Reveal this act first';
  end if;
  perform private.check_act(p_act_kind, p_act_options);

  update public.rooms set
    act = act + 1,
    act_kind = p_act_kind,
    act_options = coalesce(p_act_options, '{}'),
    round = round + 1,
    phase = 'choosing',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

create function public.end_universe(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'revealed' then
    raise exception 'Reveal this act first';
  end if;
  update public.rooms set phase = 'ended' where id = p_room_id returning * into v_room;
  return v_room;
end;
$$;

-- "Play another universe": back to the picker with the same players.
create function public.back_to_picker(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase = 'choosing' then
    raise exception 'An act is in progress';
  end if;
  update public.rooms set
    phase = 'lobby',
    universe_id = null,
    act = 0,
    act_kind = null,
    act_options = '{}',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

-- The host breaks a tie for most votes.
create function public.resolve_tie(p_room_id uuid, p_pick text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'revealed' then
    raise exception 'Nothing to decide yet';
  end if;
  if v_room.act_kind = 'option' then
    if not (p_pick = any (v_room.act_options)) then
      raise exception 'Not an option in this act';
    end if;
  elsif not exists (
    select 1 from public.players where room_id = p_room_id and id::text = p_pick
  ) then
    raise exception 'That player is not in this room';
  end if;

  update public.rooms set tie_pick = p_pick where id = p_room_id returning * into v_room;
  return v_room;
end;
$$;

create function public.submit_choice(
  p_room_id uuid,
  p_chosen_player_id uuid default null,
  p_chosen_option text default null
)
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
    raise exception 'This act is not accepting choices';
  end if;

  if v_room.act_kind = 'player' then
    if p_chosen_option is not null or not exists (
      select 1 from public.players where id = p_chosen_player_id and room_id = p_room_id
    ) then
      raise exception 'Pick a player in this room';
    end if;
  else
    if p_chosen_player_id is not null or not (p_chosen_option = any (v_room.act_options)) then
      raise exception 'Pick one of the options';
    end if;
  end if;

  -- First submission wins; repeats (double taps, retries) are ignored.
  insert into public.choices (room_id, round, player_id, chosen_player_id, chosen_option)
  values (p_room_id, v_room.round, v_player.id, p_chosen_player_id, p_chosen_option)
  on conflict (room_id, round, player_id) do nothing;

  update public.players set submitted_round = v_room.round where id = v_player.id;

  -- Reveal automatically once everyone in the room has chosen.
  if (select count(*) from public.choices where room_id = p_room_id and round = v_room.round)
     >= (select count(*) from public.players where room_id = p_room_id) then
    update public.rooms set phase = 'revealed' where id = p_room_id;
  end if;
end;
$$;

revoke execute on function
  public.start_universe(uuid, text, text, text[]),
  public.next_act(uuid, text, text[]),
  public.end_universe(uuid),
  public.back_to_picker(uuid),
  public.resolve_tie(uuid, text),
  public.submit_choice(uuid, uuid, text)
from public, anon;

grant execute on function
  public.start_universe(uuid, text, text, text[]),
  public.next_act(uuid, text, text[]),
  public.end_universe(uuid),
  public.back_to_picker(uuid),
  public.resolve_tie(uuid, text),
  public.submit_choice(uuid, uuid, text)
to authenticated;
