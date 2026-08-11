begin;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_slug text not null,
  full_name text not null,
  company text not null,
  role text not null,
  email text not null,
  notice_version text not null,

  constraint registrations_event_slug_format check (
    event_slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'
  ),
  constraint registrations_full_name_length check (
    full_name = btrim(full_name)
    and char_length(full_name) between 2 and 120
  ),
  constraint registrations_company_length check (
    company = btrim(company)
    and char_length(company) between 1 and 160
  ),
  constraint registrations_role_length check (
    role = btrim(role)
    and char_length(role) between 1 and 160
  ),
  constraint registrations_email_format check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint registrations_notice_version_format check (
    notice_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  )
);

comment on table public.registrations is
  'Public entries to the Crack the Qase event challenge.';

create unique index if not exists registrations_event_email_key
  on public.registrations (event_slug, lower(email));

alter table public.registrations enable row level security;

revoke all on table public.registrations from anon, authenticated;
grant insert (event_slug, full_name, company, role, email, notice_version)
  on table public.registrations to anon;

drop policy if exists "Anyone can register" on public.registrations;
create policy "Anyone can register"
  on public.registrations
  for insert
  to anon
  with check (
    event_slug = 'starwest-2026'
    and notice_version = '2026-08-11'
  );

commit;
