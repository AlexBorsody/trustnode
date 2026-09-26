# TrustNode

A visible source trust layer for AI research: contribute links, curate source packs,
explore ranked evidence, and inspect the reasoning behind a claim's confidence.

## Start here

- [Strategy](docs/Business/STRATEGY.md) — canonical product direction.
- [Current work](docs/Implementation/TASKS.md) — what is built, next, and blocked.
- [Architecture and technical contracts](docs/Implementation/DESIGN.md) — existing behavior and the full trust → RAG → controls plan.
- [Charter](docs/Business/CHARTER.md) — commons principles.

For a handoff, read the [completed work](docs/Implementation/TASKS.md#completed-work)
and [next concrete deliverable](docs/Implementation/TASKS.md#next-concrete-deliverable).
Evidence storage, graph computation, stored runs, the trust workspace, independent
template forks/merges and category discovery are implemented locally. Production
activation remains separate; retrieval does not determine graph authority.
Production database/SSO activation is tracked separately in TASKS.

Use this desktop workspace and `main` for current work. Read Strategy and Current
work before editing. Retired branches and agent handoffs are not active assignments.

## App

- `/login` and `/signup`: SSO with automatic first-login account creation.
- `/account`: onboarding, account details, and sign-out.
- `/sources`: contribute links and browse the source shelf.
- `/packs`: curate/share packs, capture category seed templates, and propose/review evidence relationships with version history.
- `/templates`: browse saved category templates, visible provenance and separate resource adoption; inspect, fork or merge a chosen version.
- `/trust`: compute and inspect stored site/resource rankings and their explanations.
- `/explore`: retrieve sources with visible ranking factors and pack controls.
- `/verify`: inspect the seeded claim/evidence/confidence workflow.

Canonical verification is currently an OAuth/PKCE prototype. Retrieval ranking is
separate from factual confidence; community signals never silently change that score.

## Run locally

Use Node **22.23.2** from `.nvmrc` (`nvm install && nvm use` if using nvm).

```bash
cd app
npm ci
npm run dev
```

Open `http://localhost:3000`. Home, seeded verification, and seed-backed exploration
work without credentials. Database-backed contribution and pack flows need Supabase.
Copy `app/.env.example` to `app/.env.local`, supply the public-project values (server aliases fall back to the `NEXT_PUBLIC_` pair),
and apply the source migrations (001, 001b, 001c), then migrations 003 through 015 in order
in `db/`. For SSO, configure Google and/or Microsoft OAuth in Supabase Auth and
allow your app's `/auth/callback` redirect (including its `next` query) for local
and production origins. Enable new-user signup for JIT account creation. Provider
client secrets stay in Supabase's provider configuration, never in browser env vars.
The app displays only providers confirmed enabled by public Auth settings. Restart
the server after changing app environment values.
Writes use the signed-in user's JWT and RLS; no service-role key is used.

Graph jobs run separately from Next.js: after migration 012, provision a restricted
worker login, set `TRUSTNODE_WORKER_DATABASE_URL` on that process, and run
`npm run worker:graph` from `app`. The worker uses the same pinned Node runtime.
See [the stored-run contract](docs/Implementation/DESIGN.md#implemented-stored-run-boundary-migration-012)
for roles, TLS, quotas, publication and replay. Production migration 012 and worker
activation, plus migrations 013–015, are still pending; a Vercel deploy does not run the worker.

For a quick code check: `npm run typecheck`. Existing CI also runs the application
checks and production build. Keep validation focused on the change being delivered.

Production: [TrustNode](https://trustnode-lemon.vercel.app).
Code deployment and database migration activation are separate; see Current work.
