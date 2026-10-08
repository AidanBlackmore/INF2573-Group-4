-- Tie-break re-vote. When the most votes in an act are tied, everyone votes
-- again on their phones, choosing only between the tied answers (stage 1).
-- If the re-vote ties again, the shared screen picks the winner (tie_pick).

alter table public.rooms
  add column stage int not null default 0 check (stage in (0, 1)),
  add column tie_options text[] not null default '{}';

alter table public.players add column submitted_stage int not null default 0;

alter table public.choices add column stage int not null default 0 check (stage in (0, 1));
alter table public.choices drop constraint choices_room_id_round_player_id_key;
alter table public.choices add constraint choices_one_per_stage unique (room_id, round, stage, player_id);

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
            or (choices.round = r.round and choices.stage < r.stage)
            or (choices.round = r.round and choices.stage = r.stage and r.phase in ('revealed', 'ended'))
          )
      )
    )
  );

-- Every way into a new act clears the tie-break state.
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

create or replace function public.next_act(p_room_id uuid, p_act_kind text, p_act_options text[])
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
    stage = 0,
    tie_options = '{}',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.back_to_picker(p_room_id uuid)
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
    stage = 0,
    tie_options = '{}',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

-- True if p_key is a valid answer for the room's current act.
create function private.is_valid_answer(p_room public.rooms, p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_room.act_kind = 'option' then p_key = any (p_room.act_options)
    else exists (select 1 from public.players where room_id = p_room.id and id::text = p_key)
  end;
$$;

-- Starts the re-vote between the tied answers.
create function public.start_revote(p_room_id uuid, p_tied text[])
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_key text;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'revealed' or v_room.stage <> 0 then
    raise exception 'There is nothing to re-vote';
  end if;
  if coalesce(array_length(p_tied, 1), 0) < 2 then
    raise exception 'A re-vote needs at least 2 tied answers';
  end if;
  foreach v_key in array p_tied loop
    if not private.is_valid_answer(v_room, v_key) then
      raise exception 'Not a valid answer for this act';
    end if;
  end loop;

  update public.rooms set
    stage = 1,
    tie_options = p_tied,
    phase = 'choosing',
    tie_pick = null
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

-- The shared screen picks the winner when the re-vote ties again.
create or replace function public.resolve_tie(p_room_id uuid, p_pick text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'revealed' or v_room.stage <> 1 then
    raise exception 'Re-vote first';
  end if;
  if not (p_pick = any (v_room.tie_options)) then
    raise exception 'Not one of the tied answers';
  end if;

  update public.rooms set tie_pick = p_pick where id = p_room_id returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.submit_choice(
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
  v_key text := coalesce(p_chosen_player_id::text, p_chosen_option);
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
    if p_chosen_option is not null or not private.is_valid_answer(v_room, v_key) then
      raise exception 'Pick a player in this room';
    end if;
  elsif p_chosen_player_id is not null or not private.is_valid_answer(v_room, v_key) then
    raise exception 'Pick one of the options';
  end if;

  if v_room.stage = 1 and not (v_key = any (v_room.tie_options)) then
    raise exception 'Pick one of the tied answers';
  end if;

  -- First submission wins; repeats (double taps, retries) are ignored.
  insert into public.choices (room_id, round, stage, player_id, chosen_player_id, chosen_option)
  values (p_room_id, v_room.round, v_room.stage, v_player.id, p_chosen_player_id, p_chosen_option)
  on conflict (room_id, round, stage, player_id) do nothing;

  update public.players set submitted_round = v_room.round, submitted_stage = v_room.stage
  where id = v_player.id;

  -- Reveal automatically once everyone in the room has chosen.
  if (select count(*) from public.choices
      where room_id = p_room_id and round = v_room.round and stage = v_room.stage)
     >= (select count(*) from public.players where room_id = p_room_id) then
    update public.rooms set phase = 'revealed' where id = p_room_id;
  end if;
end;
$$;

revoke execute on function public.start_revote(uuid, text[]) from public, anon;
grant execute on function public.start_revote(uuid, text[]) to authenticated;
