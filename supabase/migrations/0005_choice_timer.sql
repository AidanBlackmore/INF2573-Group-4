-- Choice timer. Every vote (an act's vote, or its tie-break re-vote) has a
-- deadline. When it passes, the shared screen asks the server to pick at
-- random for everyone who hasn't chosen, then the act is revealed.
-- Auto-picked choices are flagged so the reveal and analytics can tell.

alter table public.rooms
  add column choice_seconds int not null default 60 check (choice_seconds between 10 and 600),
  add column choice_deadline timestamptz;

alter table public.choices add column auto_picked boolean not null default false;

-- Sets the deadline whenever a vote opens (new act, replay, or re-vote) and
-- clears it otherwise, so start_universe, next_act and start_revote don't
-- need to change.
create function private.set_choice_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phase = 'choosing' then
    if tg_op = 'INSERT'
       or old.phase is distinct from 'choosing'
       or new.round <> old.round
       or new.stage <> old.stage then
      new.choice_deadline := now() + make_interval(secs => new.choice_seconds);
    end if;
  else
    new.choice_deadline := null;
  end if;
  return new;
end;
$$;

create trigger rooms_choice_deadline
  before insert or update on public.rooms
  for each row execute function private.set_choice_deadline();

-- Called by the shared screen when the timer runs out. Picks a random valid
-- answer for every player who hasn't chosen, then reveals. Returns how many
-- choices were picked automatically (0 if the act was already revealed).
create function public.auto_pick_expired(p_room_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_pool text[];
  v_player public.players;
  v_key text;
  v_count int := 0;
begin
  v_room := private.lock_room_as_host(p_room_id);
  if v_room.phase <> 'choosing' then
    return 0;
  end if;
  -- A couple of seconds of slack for the laptop's clock running ahead.
  if v_room.choice_deadline is null or now() < v_room.choice_deadline - interval '2 seconds' then
    raise exception 'Time is not up yet';
  end if;

  -- Valid answers: the tied ones in a re-vote, else the act's options or players.
  if v_room.stage = 1 then
    v_pool := v_room.tie_options;
  elsif v_room.act_kind = 'option' then
    v_pool := v_room.act_options;
  else
    select array_agg(id::text) into v_pool from public.players where room_id = p_room_id;
  end if;
  if coalesce(array_length(v_pool, 1), 0) = 0 then
    raise exception 'Nothing to pick from';
  end if;

  for v_player in
    select p.* from public.players p
    where p.room_id = p_room_id
      and not exists (
        select 1 from public.choices c
        where c.room_id = p_room_id and c.round = v_room.round
          and c.stage = v_room.stage and c.player_id = p.id
      )
  loop
    v_key := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
    insert into public.choices (room_id, round, stage, player_id, chosen_player_id, chosen_option, auto_picked)
    values (
      p_room_id, v_room.round, v_room.stage, v_player.id,
      case when v_room.act_kind = 'player' then v_key::uuid end,
      case when v_room.act_kind = 'option' then v_key end,
      true
    )
    on conflict (room_id, round, stage, player_id) do nothing;
    update public.players set submitted_round = v_room.round, submitted_stage = v_room.stage
    where id = v_player.id;
    v_count := v_count + 1;
  end loop;

  update public.rooms set phase = 'revealed' where id = p_room_id;
  return v_count;
end;
$$;

revoke execute on function public.auto_pick_expired(uuid) from public, anon;
grant execute on function public.auto_pick_expired(uuid) to authenticated;
