begin;

-- Allowlist a second booth operator. The Supabase Auth account was created
-- via an Authentication invite; this grants it booth-admin access.
insert into public.booth_staff (user_id)
values ('44031698-aee5-44af-85b9-66c37393e3aa')
on conflict (user_id) do nothing;

commit;
