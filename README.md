# Seaport CRM

A small, sturdy, extensible CRM. One Node/Express server, one Postgres database, one vanilla-JS frontend (no build step). The whole UI is driven by a single config file — adding a new "feature" (a new kind of record like contacts or tasks) is usually a 10-line edit.

## Why a rewrite

The previous version stored data in `localStorage`, which is why leads and deals disappeared on refresh — the browser was the database. This version puts everything in Postgres on Render, which means data persists, survives redeploys, and can later be backed up or shared between users.

## Deploy to Render (the easy way)

1. **Push this code to your GitHub repo** (`https://github.com/seaportjake-sys/Seaport-CRM`). It's safe to replace the existing files — there's no migration from the old `localStorage` data because that data lived in your browser, not on the server.
2. In Render, click **New + → Blueprint**, pick the `Seaport-CRM` repo, and accept the plan. The included `render.yaml` provisions a free Postgres database and a free web service, and wires `DATABASE_URL` between them automatically.
3. (Optional) In the web service's **Environment** tab, set `APP_PASSWORD` to require a shared password to access the site. Leave it blank to keep it open.
4. Wait for the first deploy. Visit your URL and add a lead.

If you'd rather not use the Blueprint, manually create:
- a Postgres instance (free is fine), and
- a Web Service pointing at this repo with build `npm install` and start `npm start`,

then add a `DATABASE_URL` env var on the web service set to the Postgres internal connection string.

## Run locally

```bash
cp .env.example .env
# edit .env to point at a local or remote Postgres
npm install
npm start
```

Then open <http://localhost:3000>.

To make a local Postgres quickly:

```bash
# Mac with Homebrew
brew install postgresql@16 && brew services start postgresql@16
createdb seaport_crm
# then DATABASE_URL=postgres://$USER@localhost:5432/seaport_crm
```

## How to add a new feature

The whole app is driven by `server/entities.js`. To add (say) a "contacts" table with a name, email, and linked lead:

```js
// server/entities.js
contacts: {
  label: 'Contacts',
  icon:  '📇',
  titleField: 'name',
  listColumns: ['name', 'email', 'lead_id'],
  fields: [
    { name: 'name',    label: 'Name',    type: 'text',    required: true },
    { name: 'email',   label: 'Email',   type: 'email' },
    { name: 'lead_id', label: 'Lead',    type: 'foreign', references: 'leads' },
    { name: 'notes',   label: 'Notes',   type: 'textarea' },
  ],
},
```

Restart the server. The migration runs automatically and creates the `contacts` table. The sidebar gets a Contacts link, the table view, the create/edit form, and a `/api/contacts` REST endpoint — all generated from that one block.

To add a *new field* to an existing entity, just add it to that entity's `fields` array. The migrator runs `ADD COLUMN IF NOT EXISTS` on every boot, so the column appears without manual SQL. (Removing a field from `entities.js` does **not** drop the column — your data is safe. Drop it manually if you want it gone.)

Supported field types: `text`, `textarea`, `email`, `tel`, `number`, `date`, `select` (with `options`), `foreign` (with `references`).

## Architecture

```
server/
  index.js      Express app, auth gate, static serving, SPA fallback
  db.js         Postgres pool (SSL on Render, plain locally)
  migrate.js    Idempotent schema migration from entities.js
  entities.js   ← THE config file. Edit this to add features.
  crud.js       Generic CRUD route factory used for every entity
public/
  index.html    Shell
  styles.css    All styling
  app.js        Frontend; reads /api/_schema and renders itself
render.yaml     Render Blueprint (Postgres + web service + DATABASE_URL wiring)
```

## API

| Method | Path                  | What it does                       |
|--------|-----------------------|------------------------------------|
| GET    | `/api/_schema`        | All entity definitions             |
| GET    | `/api/_authcheck`     | Whether auth is required / set     |
| POST   | `/api/_login`         | Set the auth cookie                |
| GET    | `/api/{entity}`       | List records (newest first)        |
| GET    | `/api/{entity}/{id}`  | Fetch one                          |
| POST   | `/api/{entity}`       | Create                             |
| PUT    | `/api/{entity}/{id}`  | Update                             |
| DELETE | `/api/{entity}/{id}`  | Delete                             |
| GET    | `/healthz`            | Health check (also pings Postgres) |

## Notes on auth

The bundled "auth" is a single shared password stored in an env var, gated by an HTTP-only cookie. It's enough to keep your CRM off the open internet for one user. If you want real user accounts, swap the gate in `server/index.js` for whatever you prefer (Auth0, Clerk, plain `passport-local` against a `users` table, etc.) — none of the rest of the app cares.
