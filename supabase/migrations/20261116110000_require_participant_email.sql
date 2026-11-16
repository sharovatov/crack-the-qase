begin;

-- Existing email validation remains in force. Historical null emails remain
-- valid so booth staff can continue updating their progress and prizes.
grant insert (email) on table public.registrations to anon;
grant select (email) on table public.registrations to authenticated;

-- The existing staff SELECT policy still requires is_booth_staff().
-- Require email on new public inserts, without imposing NOT NULL on old rows.
drop policy if exists "Anyone can register" on public.registrations;
create policy "Anyone can register"
  on public.registrations
  for insert
  to anon
  with check (
    event_slug = 'starwest-2026'
    and notice_version = '2026-11-16'
    and email is not null
  );

-- Keep registrations_event_name_company_key: email is not participant identity.
commit;
