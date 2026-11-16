const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
let PGlite;
try { ({ PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')); } catch {}

test('email migration enforces inserts and staff access while preserving legacy records and identity', {
  skip: PGlite ? false : 'Set PGLITE_MODULE to an installed @electric-sql/pglite to run database checks',
}, async () => {
  const db = new PGlite();
  const migration = (name) => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;`);
    await db.exec(migration('20260811111500_create_registrations.sql'));
    await db.exec(migration('20260905163000_add_booth_admin.sql'));
    await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      insert into public.booth_staff values ('00000000-0000-0000-0000-000000000001');
      insert into registrations (event_slug, full_name, company, role, notice_version)
      values ('starwest-2026', 'Legacy Person', 'Company', 'QA', '2026-09-05');`);
    const sql = migration('20261116110000_require_participant_email.sql');
    await db.exec(sql);
    await db.exec(sql); // Safe to re-run.
    await db.exec('set role anon');
    const insert = (email, name = 'Ada Lovelace', notice = '2026-11-16') => db.query(
      `insert into registrations (event_slug, full_name, company, role, email, notice_version)
       values ('starwest-2026', $1, 'Company', 'QA', $2, $3)`, [name, email, notice]);
    for (const email of [null, '', 'bad', 'a@b', 'ADA@example.com', ' ada@example.com', 'a'.repeat(250) + '@b.com']) {
      await assert.rejects(insert(email));
    }
    await assert.rejects(insert('ada@example.com', 'Ada Lovelace', '2026-09-05'));
    await insert('ada@example.com');
    await assert.rejects(insert('other@example.com', 'ada lovelace'), { code: '23505' });
    await insert('ada@example.com', 'Different Person'); // Email is not unique.
    await assert.rejects(db.query('select email from registrations'), { code: '42501' });
    await assert.rejects(db.exec("update registrations set email = 'changed@example.com'"), { code: '42501' });
    await db.exec('reset role; set role authenticated');
    assert.equal((await db.query('select email from registrations')).rows.length, 0);
    await db.exec("set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'");
    const rows = (await db.query('select full_name, email from registrations order by full_name')).rows;
    assert.equal(rows.find(r => r.full_name === 'Ada Lovelace').email, 'ada@example.com');
    assert.equal(rows.find(r => r.full_name === 'Legacy Person').email, null);
    await assert.rejects(db.query('select * from registrations'), { code: '42501' });
    await assert.rejects(db.exec("update registrations set email = 'changed@example.com'"), { code: '42501' });
    await db.exec(`select set_puzzle_verification((select id from registrations where full_name = 'Legacy Person'), '01', true)`);
    assert.deepEqual((await db.query("select solved_puzzles from registrations where full_name = 'Legacy Person'")).rows[0].solved_puzzles, ['01']);
  } finally { await db.close(); }
});
