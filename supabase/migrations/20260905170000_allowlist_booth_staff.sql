begin;

insert into public.booth_staff (user_id)
values ('55cef966-3d9b-45fd-b198-0b833730b767')
on conflict (user_id) do nothing;

commit;
