# EyeLecture

Accounts, roles, institutions and student validation — a NestJS API and an Angular
app sharing the EyeLecture design system.

```
eyelecture/
├── backend/                     NestJS 11 + TypeORM + Postgres (pgvector)
├── frontend/                    Angular 21 + Angular Material
├── docker/postgres/init/        Extensions created on first boot
├── docker-compose.yml           Postgres with pgvector, plus optional pgAdmin
└── eyelecture-design-system.html   The source of truth for the visual language
```

## Quick start

```bash
# 1. Database
docker compose up -d postgres

# 2. API  →  http://localhost:3000/api/v1   (docs at /api/docs)
cd backend
cp .env.example .env
npm install
npm run migration:run
npm run seed          # creates the first admin + a demo institution
npm run start:dev

# 3. App  →  http://localhost:4200
cd ../frontend
npm install
npm start
```

The seed prints the admin credentials — `admin@eyelecture.app` / `ChangeMe123!` by
default. Change them in `backend/.env` before running it, or change the password
right after.

### If the migration says `password authentication failed for user "eyelecture"`

That error means something answered on port 5432 — it just was not this project's
container. Almost always there is another Postgres on the machine (Homebrew,
Postgres.app, another project) holding the port.

```bash
docker compose ps                          # is eyelecture-postgres running?
lsof -nP -iTCP:5432 -sTCP:LISTEN           # who owns the port?
```

**If the container is not running**, start it and watch for a bind error:

```bash
docker compose up postgres     # no -d, so you see why it fails
```

**If another Postgres owns 5432**, move this one out of the way rather than
fighting over the port:

```bash
cp .env.example .env           # then set POSTGRES_PORT=5433
docker compose up -d postgres
```

and set the matching `DB_PORT=5433` in `backend/.env`.

**If the container is running and the port is free**, the volume was probably
initialised earlier with different credentials — `POSTGRES_USER` and
`POSTGRES_PASSWORD` only take effect the first time the data directory is
created. Wipe it and start over (this deletes the local data):

```bash
docker compose down -v && docker compose up -d postgres
```

## The idea behind the roles

Three roles, defined in `backend/src/modules/users/enums/user-role.enum.ts`:

| Role | What they can do |
| --- | --- |
| **admin** | Manage institutions and their email domains, change anyone's role, validate anyone |
| **program_director** | Validate students at their own institution |
| **student** | Use the product, once their membership is confirmed |

Two things are tracked separately, and keeping them apart is the point:

- **`status`** — is this account usable at all? (`pending_email_verification` →
  `active`, or `suspended`)
- **`validationStatus`** — do we believe this person really belongs to the
  institution they claim? (`pending` → `validated` / `rejected`)

Someone can have a perfectly good, email-verified account and still not be a
confirmed member of anywhere.

## How validation works

An institution owns email domains (`stanford.edu`, `med.stanford.edu`). When
somebody registers:

```
                    ┌─ domain matches an active institution ──→ VALIDATED
signup e-mail ──────┤   (method: email_domain, nobody involved)
                    │
                    └─ no match ─────────────────────────────→ PENDING
                                                                 │
                       student  ──→ queue for a program director │
                                    at the institution they named│
                       director ──→ queue for an admin ──────────┘
```

- A `@stanford.edu` student is validated the moment they sign up. No human touches it.
- A `@gmail.com` student picks their institution on the signup form; a program
  director there sees them in the queue and approves or turns them down.
- A program director signup is **never** auto-validated, even on a matching
  domain — a director vouches for other people, so an admin approves them first.

A program director can only ever validate **students**, and only into **their own**
institution. Passing a different `institutionId` is rejected rather than silently
ignored (`UsersService.assertCanReview`).

Removing a domain from an institution does not revoke anybody: people already
validated keep their access. The domain only governs future signups.

## API

Everything is under `/api/v1`. Swagger UI is at `/api/docs` outside production.

Authentication is **on by default** — a global `JwtAuthGuard` protects every route
and endpoints opt out with `@Public()`, so forgetting the decorator fails closed.

```
POST   /auth/register              create an account
POST   /auth/login                 → access + refresh token
POST   /auth/refresh               rotate the pair (the old refresh token is burned)
POST   /auth/verify-email          confirm the address; returns a session
POST   /auth/resend-verification   always answers the same, so it cannot probe for addresses
POST   /auth/logout                revoke one session
POST   /auth/logout-all            revoke every session
GET    /auth/me

GET    /institutions/public        open — the signup form's picker
GET    /institutions/lookup?email= open — "will this address auto-validate me?"
GET    /institutions               admin
POST   /institutions               admin
PATCH  /institutions/:id           admin
DELETE /institutions/:id           admin
POST   /institutions/:id/domains   admin — accepts "@stanford.edu" or "stanford.edu"
DELETE /institutions/:id/domains/:domainId

GET    /users/me                       any signed-in user
PATCH  /users/me                       name only; email is the institution link
GET    /users/pending-validation       admin + program director (scoped server-side)
GET    /users/pending-validation/count admin + program director
POST   /users/:id/validate             admin + program director
POST   /users/:id/reject               admin + program director
GET    /users                          admin
PATCH  /users/:id/role                 admin
PATCH  /users/:id/status               admin
PATCH  /users/:id/institution          admin
```

### Security notes

- Passwords are bcrypt with 12 rounds. The hash column is `select: false` and is
  only pulled in by an explicit query builder.
- Refresh tokens are stored as SHA-256 hashes, never in the clear, and are rotated
  on every use — a replayed token is rejected and detectable.
- Login compares against a dummy hash when the user does not exist, so a wrong
  email and a wrong password take the same time.
- `JwtStrategy` re-reads the user on every request, so a suspension or role change
  takes effect immediately rather than when the access token expires.
- Route guards in the Angular app are a convenience only. Every rule is enforced
  server-side; the frontend just avoids showing pages that would fail.

## Email

There is no mail transport wired up yet. Verification links are written to the API
log, and outside production the token also comes back in the register response
(`devEmailVerificationToken`) so the flow is testable end to end. Replace the
`this.logger.log(...)` in `AuthService.issueEmailVerificationToken` when you pick a
provider.

## Database

Postgres via the `pgvector/pgvector:pg17` image. The `vector` extension is created
in the very first migration, on purpose: enabling it later on a database that is
already carrying data needs elevated rights, whereas adding an embedding column to
an existing table is a plain `ALTER TABLE`. Lecture transcripts and question
similarity can land on this schema without a migration that needs a DBA.

```bash
npm run migration:generate -- src/database/migrations/AddSomething
npm run migration:run
npm run migration:revert
```

`DB_SYNCHRONIZE` stays `false`. Schema changes go through migrations.

## Frontend

Angular 21, standalone components, signals, zoneless change detection, every
feature lazy-loaded.

```
src/app/
├── core/          models, services, guards, the auth interceptor
├── layout/        the signed-in shell (app bar + side nav)
├── features/      auth, dashboard, admin, directory, profile
├── shared/        the brandmark, the status badge
└── styles/        the design system, ported
```

### The design system

`eyelecture-design-system.html` defines three layers, and the port keeps them:

1. `src/styles/_tokens.scss` — the raw palette and scales (`--el-*`, `--md-sys-*`),
   copied verbatim from the design system, light and dark.
2. `src/styles/_material-bridge.scss` — the single translation layer that maps
   `--md-sys-*` onto the `--mat-sys-*` variables Angular Material reads. **If a
   Material component looks off-brand, fix it here**, not with a `::ng-deep` in a
   feature component.
3. `src/styles/_components.scss` — the design system's own presentational classes
   (`.el-card`, `.el-badge`, `.el-alert`, `.el-stat`, `.el-empty`, the side nav).

Only ever consume layer 2 or 3 in product code. Reaching for `--el-blue-600` in a
component means a system token is missing.

The app always starts in light. Dark is opt-in from the toggle in the app bar,
and that choice is remembered per browser — the OS `prefers-color-scheme` is
deliberately not consulted, so a first-time visitor on a dark desktop still sees
the light palette. Switching flips `data-theme` on `<html>`, which is what the
dark palette hangs off, and sets `color-scheme` so native controls follow.

Fonts (Instrument Sans, Geist, Geist Mono, Material Symbols Rounded) load from
Google Fonts, matching the design system file. Build-time font inlining is turned
off in `angular.json` so builds work on machines without outbound network.

## Tests

```bash
cd backend  && npm test
cd frontend && npm test
```

## Deploying

Runs on Google Cloud in the `eyelecture` project (org `nextto.ai`), region
`us-central1`:

- **Cloud Run `eyelecture-web`** — Angular behind nginx. This is the public URL.
- **Cloud Run `eyelecture-api`** — the NestJS API.
- **Cloud SQL** — PostgreSQL 17 with pgvector.
- **Cloud Run job `eyelecture-migrate`** — migrations, run before each new API
  revision goes live.

The browser only ever talks to the web origin. nginx proxies `/api/` to the API
service, so there are no CORS preflights and no API URL baked into the bundle at
build time — `environment.ts` keeps `apiUrl: '/api/v1'` in production and the
backend host is runtime configuration.

Merging to `main` builds both images, runs the migration job, deploys both
services and smoke-tests them. Infrastructure changes are applied by hand from
Cloud Shell; the CI identity can push images and update Cloud Run, nothing more.
See `infra/README.md` for the details, the first-apply ordering and the costs.

## What is deliberately not here yet

- Password reset. The token plumbing (`EmailVerificationToken`) is the shape it
  would reuse.
- OAuth. `AuthService.register` is the one place that decides validation, so a
  Google sign-up would slot in beside it.
- Rate limiting on `/auth/login` and `/institutions/lookup`. Worth adding
  (`@nestjs/throttler`) before this faces the open internet.
