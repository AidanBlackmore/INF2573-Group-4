-- Discussion window. Every vote (an act's vote, or its tie-break re-vote)
-- starts with a short period where everyone can read the scenario and talk
-- it over, but nobody can choose yet. The choice timer starts after it.

alter table public.rooms
  add column discussion_seconds int not null default 20 check (discussion_seconds between 0 and 300),
  add column choices_open_at timestamptz;

-- Opening a vote now sets when choosing opens, and the deadline counts from then.
create or replace function private.set_choice_deadline()
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
      new.choices_open_at := now() + make_interval(secs => new.discussion_seconds);
      new.choice_deadline := new.choices_open_at + make_interval(secs => new.choice_seconds);
    end if;
  else
    new.choices_open_at := null;
    new.choice_deadline := null;
  end if;
  return new;
end;
$$;

-- Players can't submit during the discussion. A couple of seconds of slack
-- for a phone's clock running ahead. Auto-picks only happen after the deadline.
create function private.check_choices_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.auto_picked and exists (
    select 1 from public.rooms
    where id = new.room_id and choices_open_at is not null
      and now() < choices_open_at - interval '2 seconds'
  ) then
    raise exception 'Voting opens after the discussion';
  end if;
  return new;
end;
$$;

create trigger choices_open_check
  before insert on public.choices
  for each row execute function private.check_choices_open();
