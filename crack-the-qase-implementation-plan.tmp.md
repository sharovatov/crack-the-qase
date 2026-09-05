# Crack the Qase — proposed repository changes

Status: temporary review draft. This file is not an implementation and makes no changes to the strategy document.

## Implementation progress

- [x] Confirm the six external puzzle identifiers (`01` through `06`).
- [x] Correct the public registration copy and remove participant email.
- [x] Redirect successful and duplicate registrations to the external puzzle site.
- [x] Add shared active-event, puzzle-number, and prize configuration.
- [x] Add a forward-only Supabase migration for name/company deduplication, solve tracking, prize tracking, staff authorization, and atomic staff operations.
- [x] Build the authenticated `/admin/` booth console.
- [x] Add participant lookup, puzzle verification, prize recording/correction, progress, and raffle-ready views.
- [x] Replace the placeholder homepage with an evergreen explanation.
- [x] Update this repository's README and booth runbook.
- [x] Pass JavaScript syntax, HTML structure, whitespace, local route, public-flow, and mocked admin workflow checks.
- [ ] Apply the new migration to the live Supabase project.
- [ ] Create and allowlist the real booth-staff Supabase Auth accounts.
- [ ] Run end-to-end checks against the migrated Supabase project.
- [ ] Run the physical iOS, Android, and booth-device checks.
- [ ] Deploy the updated static site after the database migration.

## Fixed decisions and boundaries

- Treat `~/Documents/_repos/torben-content/events-community/strategy/crack-the-qase-booth-activation.md` as read-only source material.
- The explicit implementation override is that participant email must not be requested or newly stored.
- Keep all puzzle content and puzzle delivery on `crack-the-qase.fly.dev`.
- Store only external puzzle identifiers/numbers here so booth staff can mark them solved.
- Keep the registration UUID invisible. Booth staff find participants by name and company.
- Use `event_slug + normalized name + normalized company` to prevent duplicate registrations.
- Do not add participant codes or expose database IDs.
- Do not add or change anything related to HubSpot.
- Make changes only in this repository and its Supabase schema.

## 1. Correct the public participant flow

### `play/index.html`

- [x] Remove the email field.
- [x] Keep name, company, and role.
- [x] Replace the data-use sentence with wording that covers running the challenge without promising email updates.
- [x] Remove the old tournament language:
  - “Beat the clock”
  - “Timed drops”
  - “One winner each day”
  - “Fastest correct solvers advance”
  - “Stay connected by LoRa or email”
  - “Get your first puzzle at our booth”
- [x] Briefly explain the actual mechanic:
  - register, then open all puzzles;
  - solve them in any order and at your own pace;
  - bring a solution to the booth for in-person verification;
  - the first verified solve earns one die-selected cheap-tier prize;
  - completing every puzzle makes the participant eligible for the day-two raffle while present at the booth.
- [x] Update page metadata and social-preview copy so it no longer describes a timed challenge.

### `play/app.js`

- [x] Remove email from the submitted registration object.
- [x] After a successful registration, redirect to `https://crack-the-qase.fly.dev`.
- [x] If name + company is already registered for the active event, redirect to the puzzle site as well.
- [x] Do not expose the registration UUID in the URL, page, or redirect.
- [x] Keep validation, the honeypot, loading state, and useful failure messaging.

## 2. Centralize the active-event configuration

- [x] Add one small static configuration file shared by the public and admin pages. It contains only non-secret values:

- event slug;
- event name and booth label;
- puzzle-site URL;
- the stable external puzzle identifiers/numbers used by the admin checkboxes;
- the number/set of puzzles required for raffle eligibility.

This repository will not contain puzzle questions, answers, checking logic, or other puzzle-site content.

## 3. Add a forward-only Supabase migration

- [x] Do not rewrite the already-deployed migration. Add a new migration that changes the live schema safely.

### Registration changes

- [x] Stop requiring email and stop granting anonymous clients permission to insert it.
- [x] Preserve any existing email values initially by making the old column nullable and unused. Do not delete existing data as part of this change.
- [x] Drop the existing unique index on `event_slug + email`.
- [x] Add a case-insensitive unique index on `event_slug + full_name + company`.
- [x] Add operational fields to `registrations`:
  - `solved_puzzles text[] not null default '{}'`
  - `prize_granted text null`
  - `prize_granted_at timestamptz null`
  - `updated_at timestamptz not null default now()`

`solved_puzzles` contains only identifiers matching puzzles on the external site, for example `01`, `02`, and `03`. It does not define or duplicate those puzzles.

Raffle eligibility is derived rather than stored: a registration is eligible when `solved_puzzles` contains the complete configured set.

### Public permissions

- [x] Anonymous visitors can insert only:
  - `event_slug`
  - `full_name`
  - `company`
  - `role`
  - `notice_version`
- [x] Anonymous visitors cannot read registrations or write solve/prize fields.
- [x] Keep the active-event and notice-version checks.

### Staff permissions

- [x] Use Supabase Auth for pre-created booth-staff accounts.
- [ ] Disable public staff-account signup in the live Supabase project settings.
- [x] Add a private booth-staff allowlist keyed by the authenticated Supabase user UUID.
- [x] Add row-level-security policies allowing allowlisted staff to read registrations and staff-only functions to change solve/prize fields.
- [x] Keep service-role credentials out of the static site.
- [x] Add a staff-only database function for adding/removing one puzzle identifier atomically, so two booth operators cannot accidentally overwrite each other’s updates.

## 4. Build `/admin/` for booth staff

- [x] Add:

- `admin/index.html`
- `admin/app.js`
- `admin/styles.css`

The static page itself can be public; Supabase authentication and row-level security protect all participant data and mutations.

### Login

- [x] Sign in with a pre-created booth-staff Supabase account.
- [x] Restore a valid session after refresh.
- [x] Provide logout and clear authentication errors.

### Participant lookup

- [x] Search registrations within the active event by name and/or company.
- [x] Show enough context to distinguish results: name, company, role, registration time, solve count, and awarded prize.
- [x] Never display or ask staff to work with the registration UUID.
- [x] Show the most recent registrations before a search so newly registered visitors are quick to find.

### Registration detail

- [x] Show one checkbox per configured external puzzle identifier.
- [x] Allow staff to mark a puzzle solved after the participant explains the solution in person.
- [x] Allow staff to undo an accidental check.
- [x] Show progress such as `3 of 6 verified`.
- [x] Visually indicate when all puzzles are verified and the participant is raffle-eligible.
- [x] Do not implement automatic answer checking.

### Prize handling

- [x] On the first verified solve, clearly prompt staff to roll the physical die and record the cheap-tier prize that was handed out.
- [x] Offer the six cheap-tier choices from the strategy.
- [x] Prevent an accidental second prize grant, while allowing an explicit correction by staff.
- [x] Do not award or select premium raffle prizes from this workflow.

### Raffle view

- [x] Provide a filter/view listing registrations with every configured puzzle verified.
- [x] Treat this as the candidate list; booth staff still confirm the person is physically present at raffle time.
- [x] Do not contact absent participants.

## 5. Replace the placeholder homepage

- [x] Update `/index.html` from “Coming soon” to a short evergreen explanation of Crack the Qase:

- what the activation is;
- that it runs at Qase event booths;
- that the permanent entry point is `/play`;
- no StarWest-specific rules that would make the homepage stale after this event.

## 6. Documentation in this repository

- [x] Update `README.md` with:

- the no-email registration shape;
- the active-event configuration location;
- how public registration and staff access differ;
- how to create/allowlist booth-staff accounts;
- how puzzle identifiers map to the external puzzle site;
- how to apply the new Supabase migration;
- an explicit warning never to use a service-role key in browser code;
- a short booth runbook: register, find participant, verify puzzle, record first prize, and open the raffle view.

Do not edit, rewrite, or link this work back into the strategy document.

## 7. Verification before deployment

### Public flow

- [x] Validate that the form and submitted payload contain name, company, and role without email.
- [x] Confirm the successful and duplicate code paths redirect to the external puzzle site.
- [x] Confirm the failed-registration code path remains on the page and shows a useful error.
- [ ] Confirm a new registration is saved under the active event against the migrated Supabase project.
- [ ] Confirm a duplicate name + company registration reaches the puzzle site without creating a second row against the migrated Supabase project.

### Security

- [x] Encode anonymous insert-only and staff allowlist rules in the forward migration.
- [ ] Confirm anonymous users can insert only registration fields against the migrated Supabase project.
- [ ] Confirm anonymous users cannot list registrations, mark puzzles, or grant prizes against the migrated Supabase project.
- [ ] Confirm a non-allowlisted authenticated account cannot access participant data.
- [ ] Confirm an allowlisted staff account can read registrations and change only operational fields.

### Admin workflow

- [x] Implement participant search by name and company.
- [x] Implement puzzle checks, corrections, progress counts, and raffle eligibility.
- [x] Implement atomic puzzle updates to avoid lost simultaneous solves.
- [x] Implement one recorded cheap-tier prize with an explicit correction path.
- [x] Implement an eligible-list query requiring every configured puzzle.
- [ ] Verify all admin operations end to end against the migrated Supabase project.

### Device checks

- [ ] Test the registration page on physical iOS and Android phones.
- [ ] Test the admin page on the actual booth devices and expected event Wi-Fi/cellular connection.
- [ ] Check keyboard navigation, focus states, form errors, loading states, and narrow-screen layout on the target devices.

## Suggested implementation order

1. [x] Confirm the external puzzle identifiers/count used for StarWest configuration.
2. [x] Add the forward Supabase migration and staff security policies.
3. [x] Correct the public form, copy, duplicate behavior, and redirect.
4. [x] Build the authenticated admin page and raffle filter.
5. [x] Replace the evergreen homepage placeholder.
6. [x] Update this repository’s README.
7. [ ] Apply the migration and run live security/workflow checks.
8. [ ] Run physical-device checks.
9. [ ] Deploy the migration before deploying frontend code that depends on it.

## Explicitly out of scope

- Editing the strategy document.
- Hosting or copying puzzles into this repository.
- Automatic puzzle-answer verification.
- Participant email collection or email updates.
- Participant-facing IDs or codes.
- HubSpot work.
- Badge-scanner integration.
- Running the premium-prize raffle automatically.
