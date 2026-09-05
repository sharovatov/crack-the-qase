begin;

alter table public.registrations
  alter column email drop not null,
  add column if not exists solved_puzzles text[] not null default '{}',
  add column if not exists prize_granted text,
  add column if not exists prize_granted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop index if exists public.registrations_event_email_key;

do $$
begin
  if exists (
    select 1
    from public.registrations
    group by event_slug, lower(btrim(full_name)), lower(btrim(company))
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce name/company uniqueness: duplicate registrations already exist.';
  end if;
end;
$$;

create unique index if not exists registrations_event_name_company_key
  on public.registrations (
    event_slug,
    lower(btrim(full_name)),
    lower(btrim(company))
  );

create table if not exists public.booth_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.booth_staff is
  'Supabase users allowed to operate the Crack the Qase booth admin.';

alter table public.booth_staff enable row level security;

revoke all on table public.booth_staff from anon, authenticated;

create or replace function public.is_booth_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booth_staff
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_booth_staff() from public;
grant execute on function public.is_booth_staff() to authenticated;

revoke all on table public.registrations from anon, authenticated;

grant insert (event_slug, full_name, company, role, notice_version)
  on table public.registrations to anon;

grant select (
  id,
  created_at,
  event_slug,
  full_name,
  company,
  role,
  solved_puzzles,
  prize_granted,
  prize_granted_at,
  updated_at
) on table public.registrations to authenticated;

drop policy if exists "Anyone can register" on public.registrations;
create policy "Anyone can register"
  on public.registrations
  for insert
  to anon
  with check (
    event_slug = 'starwest-2026'
    and notice_version = '2026-09-05'
  );

drop policy if exists "Booth staff can read registrations" on public.registrations;
create policy "Booth staff can read registrations"
  on public.registrations
  for select
  to authenticated
  using (public.is_booth_staff());

create or replace function public.set_puzzle_verification(
  registration_id uuid,
  puzzle_identifier text,
  is_solved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_booth_staff() then
    raise exception 'Booth staff access required.' using errcode = '42501';
  end if;

  if puzzle_identifier !~ '^[0-9]{2}$' then
    raise exception 'Invalid puzzle identifier.' using errcode = '22023';
  end if;

  update public.registrations
  set
    solved_puzzles = case
      when is_solved and not (solved_puzzles @> array[puzzle_identifier])
        then array_append(solved_puzzles, puzzle_identifier)
      when not is_solved
        then array_remove(solved_puzzles, puzzle_identifier)
      else solved_puzzles
    end,
    updated_at = now()
  where id = registration_id;

  if not found then
    raise exception 'Registration not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_puzzle_verification(uuid, text, boolean) from public;
grant execute on function public.set_puzzle_verification(uuid, text, boolean)
  to authenticated;

create or replace function public.set_prize_grant(
  registration_id uuid,
  prize_identifier text,
  expected_prize_identifier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  solved_count integer;
begin
  if not public.is_booth_staff() then
    raise exception 'Booth staff access required.' using errcode = '42501';
  end if;

  if prize_identifier is not null and not (
    prize_identifier = any (
      array[
        'book',
        'lock-pick-set',
        'flashlight',
        'm5stamp-fly',
        'usb-powermeter',
        't-echo-radio'
      ]
    )
  ) then
    raise exception 'Invalid prize identifier.' using errcode = '22023';
  end if;

  select cardinality(solved_puzzles)
  into solved_count
  from public.registrations
  where id = registration_id;

  if not found then
    raise exception 'Registration not found.' using errcode = 'P0002';
  end if;

  if prize_identifier is not null and solved_count = 0 then
    raise exception 'A puzzle must be verified before granting a prize.'
      using errcode = '23514';
  end if;

  update public.registrations
  set
    prize_granted = prize_identifier,
    prize_granted_at = case
      when prize_identifier is null then null
      else now()
    end,
    updated_at = now()
  where id = registration_id
    and prize_granted is not distinct from expected_prize_identifier;

  if not found then
    raise exception 'The prize record changed. Refresh and try again.'
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.set_prize_grant(uuid, text, text) from public;
grant execute on function public.set_prize_grant(uuid, text, text) to authenticated;

commit;
