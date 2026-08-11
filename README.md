# Crack the Qase

Static website for [crack-the-qase.io](https://crack-the-qase.io), hosted with GitHub Pages.

## Work locally

No build step or dependencies are required. Start any static file server from the repository root, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The event entry page is available at <http://localhost:8000/play/>.

## Registration database

The `/play` form writes directly from the browser to a Supabase `registrations` table. Public visitors can insert a registration but cannot read, edit, or delete registrations.

To create the table and its security policy:

1. Open the `crack-the-qase` project in Supabase.
2. Open **SQL Editor** and create a new query.
3. Paste and run [`supabase/migrations/20260811111500_create_registrations.sql`](supabase/migrations/20260811111500_create_registrations.sql).
4. Open **Table Editor → registrations** to view entries.

The Supabase project URL and publishable key in `play/app.js` are intentionally public. Never commit a secret key, service-role key, or database password.

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
