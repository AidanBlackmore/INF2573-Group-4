-- Players vote for a universe on their phones while in the lobby. Votes are
-- not secret: the shared screen shows the counts live. A player can change
-- their vote until the game starts.

alter table public.players add column universe_vote text
  check (universe_vote is null or char_length(universe_vote) between 1 and 60);

create function public.vote_universe(p_room_id uuid, p_universe_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'The universe has already been chosen';
  end if;
  if char_length(coalesce(p_universe_id, '')) not between 1 and 60 then
    raise exception 'Pick a universe';
  end if;

  update public.players set universe_vote = p_universe_id
  where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'You are not in this room';
  end if;
end;
$$;

-- "Play another universe" also clears everyone's previous vote.
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
  update public.players set universe_vote = null where room_id = p_room_id;
  return v_room;
end;
$$;

revoke execute on function public.vote_universe(uuid, text) from public, anon;
grant execute on function public.vote_universe(uuid, text) to authenticated;
