# Crack the Qase

Static website for [crack-the-qase.io](https://crack-the-qase.io), hosted with GitHub Pages.

## Work locally

No build step or dependencies are required. Start any static file server from the repository root, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The event entry page is available at <http://localhost:8000/play/>. The booth-staff admin is available at <http://localhost:8000/admin/>.

Run the dependency-free repository checks with:

```sh
node --test
```

## Active event configuration

Public, non-secret event settings live in [`config.js`](config.js):

- event slug, name, location, and booth;
- puzzle-site redirect URL;
- the external puzzle identifiers shown as checkboxes in the admin;
- the six cheap-tier prize choices.

Only puzzle identifiers are stored here. Puzzle content and delivery remain on `crack-the-qase.fly.dev`.

## Registration database

The `/play` form writes the participant's name, company, and role directly from the browser to a Supabase `registrations` table. It does not request or submit participant email. Public visitors can insert a registration but cannot read, edit, or delete registrations.

To create the table and its security policy:

1. Open the `crack-the-qase` project in Supabase.
2. Open **SQL Editor** and create a new query.
3. Paste and run [`supabase/migrations/20260811111500_create_registrations.sql`](supabase/migrations/20260811111500_create_registrations.sql).
4. Paste and run [`supabase/migrations/20260905163000_add_booth_admin.sql`](supabase/migrations/20260905163000_add_booth_admin.sql).
5. Open **Table Editor → registrations** to view entries.

The second migration keeps any previously collected email values but makes the column optional and unavailable to new public inserts. It replaces email deduplication with case-insensitive `event_slug + name + company` uniqueness, then adds puzzle progress, prize tracking, staff authorization, and staff-only update functions.

If the second migration reports existing duplicate names and companies, resolve those rows deliberately and run it again. The migration will not delete them automatically.

The Supabase project URL and publishable key in `config.js` are intentionally public. Never commit a secret key, service-role key, database password, or staff password.

## Booth-staff access

The admin uses pre-created Supabase Auth accounts. A staff-account email is only a login credential for the admin; it is unrelated to participant registration.

1. In **Supabase → Authentication → Users**, create an account for each booth operator.
2. Keep public Auth signup disabled.
3. Copy each user's UUID.
4. In **SQL Editor**, allowlist each UUID:

```sql
insert into public.booth_staff (user_id)
values ('00000000-0000-0000-0000-000000000000');
```

The static `/admin/` page is publicly reachable, but participant data is not. Supabase row-level security only allows an authenticated, allowlisted staff user to read registrations or call the solve/prize functions. The browser never receives a service-role key.

## Booth workflow

1. The participant registers at `/play/` and is redirected to the external puzzle site.
2. When they return, staff sign in at `/admin/` and find them by name or company.
3. After hearing an in-person explanation, staff tick the matching external puzzle number.
4. On the first verified solve, staff roll the physical die, record the item, and then hand it over.
5. Further solves are checked without another cheap-tier prize.
6. The **Raffle-ready** view lists participants with all configured puzzles verified. Staff still confirm that each person is physically present.

The admin does not contain puzzle answers, check answers automatically, contact absent participants, or run the raffle.

## Publish

Push changes to `main`. Before attaching the domain, verify it in your personal GitHub **Settings → Pages** screen and add the TXT record GitHub gives you to the domain's DNS zone.

Then, in the repository's **Settings → Pages** screen, configure:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/(root)`
- **Custom domain:** `crack-the-qase.io`
- **Enforce HTTPS:** enabled once the certificate is available

The `CNAME` file keeps the custom domain associated with the site.

## DNS

Configure the following records at the domain's DNS provider:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `sharovatov.github.io` |

Remove any existing parking or forwarding records for `@` or `www` that conflict with these records. Do not add a wildcard DNS record.
