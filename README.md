# Contract Grade Tracker

A grading portal for contract-graded courses at Widener University.

Contract grading replaces points-averaging with an explicit bargain: the instructor publishes,
per letter grade, exactly what a student must **do** to earn it. The student picks a grade to
contract for, confirms it, and then tracks their standing against that specific agreement.

The app's job is to answer one question at any moment — *am I meeting my contract, and if not,
what is still needed?* — for the student, the instructor, and the end-of-semester grade.

## What a contract is

Each grade (A/B/C) in a class carries up to four kinds of requirement:

| Requirement | Example |
|---|---|
| **Named assignments** | Stakeholder Voice Paper #1 must be complete |
| **Category rules** per module group | 7 of the Discussion Logs complete; a 3.5 average across Perusall readings |
| **Participation** | 8 class sessions at "Active" or above |
| **Absences** | at most 2 |

On top of the tiers, a class may set **absence penalties**: passing one threshold costs a
letter grade whatever contract was met, passing a second fails the course.

Assignments are graded either as a **status** (Not Submitted / Work-in-Progress / Successfully
Completed) or on a **numeric 0–4 scale**.

## Quick start

```bash
npm install
cp .env.example .env     # then fill it in, see below
npm run db:migrate       # see "Database" if the schema already exists
npm run dev              # http://localhost:5000
```

There is no public sign-up. Students arrive through an invitation link; instructor accounts are
created directly in the database.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon serverless driver) |
| `SESSION_SECRET` | yes | Signs session cookies |
| `TOKEN_ENCRYPTION_KEY` | recommended | Encrypts stored Canvas tokens. Falls back to `SESSION_SECRET`, which entangles two unrelated secrets — set it. |
| `CANVAS_BASE_URL` | no | Defaults to `https://widener.instructure.com` |
| `PORT` | no | Defaults to `5000` |

Changing `TOKEN_ENCRYPTION_KEY` makes stored Canvas tokens unreadable. That is a safe failure —
the app reports "no token saved" and you reconnect Canvas — but it is not reversible.

## Database

Schema lives in `shared/schema.ts` and is the single source of truth for tables, Zod
validators, and TypeScript types on both sides of the wire.

```bash
npm run db:generate   # after editing shared/schema.ts, writes a migration
npm run db:migrate    # apply pending migrations
```

`npm run db:push` still exists but should not be used on anything you care about: it diffs
against the live database and infers changes, which loses data on renames.

**If your database was built with `db:push`,** it has no migration history and `db:migrate`
will fail trying to re-create existing tables. Baseline it first: record migration `0000` as
applied by inserting its SHA-256 (of the raw `.sql` file) into
`drizzle.__drizzle_migrations`, then migrate normally.

Several migrations are hand-written because the generated versions were destructive — adding
`NOT NULL` columns to populated tables, or dropping a table whose rows needed carrying across.
Read a migration before applying it to real data.

## Canvas integration

Canvas is where grades are actually entered; this app reads them and evaluates contracts.
Attendance is the exception — Widener requires Qwickly, which is a third-party service Canvas
knows nothing about (see below).

**Connecting**, from a class page → **Canvas**:

1. **Access token.** In Canvas: Account → Settings → Approved Integrations → New Access Token.
   Paste it in. It is checked against Canvas before being saved, encrypted at rest, and never
   returned to the browser. Note that a Canvas personal access token is full access to your
   Canvas account; there is no way to scope one down.
2. **Course.** Pick the Canvas course this class corresponds to.
3. **Roster.** Import it. Students already here are linked to their Canvas account; anyone
   missing gets an account created. Matching uses Canvas id, login, and SIS id — never names,
   because a wrong match would put one student's record under another's.
4. **Setup links.** Imported accounts have no password. This sends each of them a setup link
   over Canvas Inbox.

**Pulling grades**, from a class page → **Pull Grades**: map each assignment to its Canvas
counterpart once, then pull. Nothing is written until you review what would change.

Mapping is deliberately per assignment rather than per assignment group. In the course this
was built against, only 14 of 18 four-point Perusall readings were filed under "Perusall
Annotations" — the rest sat in "Assignments". Pulling by group silently drops work.

Scores are read against each assignment's own `points_possible`, so a 4-point reading scored
3.5 imports as 3.5. Ungraded and excused submissions are skipped rather than imported as
zeros.

### Attendance and Qwickly

Qwickly owns attendance and computes its own absence total, counting a Partial (Late/Left
Early) day as half — so real totals look like `7.50`. That total is imported, never
re-derived, so the two systems cannot disagree.

Qwickly does not expose an API. The bridge is a Canvas gradebook column: in Qwickly →
Settings → Grading, enable **Absence Based Grading Column**. Then point this app at that
column (Pull Grades → Absence totals) and absences arrive with the grades.

This app records **participation** per class session, which Qwickly does not track.

### Progress messages

**Send Contract Updates** composes each student's standing and what they still need for each
contract level, and delivers it to their Canvas Inbox. Messages are generated from the same
evaluation that drives the student's own page, so the two cannot disagree. Every message is
previewed, recipients are chosen explicitly, and failures are reported per student.

## Architecture

```
shared/     schema, constants, and the contract evaluator — imported by both sides
server/     Express API
client/     React SPA (wouter, TanStack Query, shadcn/Radix)
migrations/ generated and hand-written SQL, tracked in git
```

Three things are load-bearing:

**`shared/schema.ts`** defines the Drizzle tables, the Zod validators, and the exported types
in one place. Client and server import the same definitions, so a schema change surfaces as a
type error on both sides rather than a runtime surprise.

**`shared/contract-evaluation.ts`** is the only place that decides whether a contract is met.
The student page, the instructor roster, analytics, and the progress messages all call it. A
second implementation anywhere would mean two answers to the same question.

**`server/middleware/requireAuth.ts`** carries the authorization rules:

- `requireInstructor` / `requireStudent` — role only
- `requireClassOwner` — the instructor owns this class; attaches `req.cls`
- `requireClassMember` — owner, or an enrolled student
- `requireStudentAccess` — this student, or the class owner

Every route uses one of these plus `asyncHandler`. No route should hand-roll its own check:
that is how the class of bug where a student could read a classmate's grades by changing a URL
got in originally.

## Testing

```bash
npm test              # 209 tests
npm run test:watch
npm run test:coverage
```

`server/__tests__/api.test.ts` boots the **real** Express app — real auth, real routes, real
middleware — with only the storage layer faked. Most of its cases pin down access control,
which is what this suite exists to catch. Tests that re-implement the thing they are testing
prove nothing; an earlier version of this file did exactly that and stayed green while the
routes it claimed to cover were broken.

Domain logic is tested directly: the contract evaluator against real contract shapes, grade
conversion, message composition, secret encryption, and Canvas pagination.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, tests, build, and a
check that `shared/schema.ts` has no changes without a matching migration.

## Deployment

Render, configured by `render.yaml`. `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` are generated
there; `DATABASE_URL` is set by hand. Migrations are not run automatically — apply them
deliberately, and remember the deployed code and the database schema have to move together.
