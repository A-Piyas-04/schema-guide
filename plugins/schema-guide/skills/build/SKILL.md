---
description: Build a step-by-step HTML guide to this project's database schema (first run in a project).
argument-hint: "[database-url-or-file] [--out path]"
disable-model-invocation: true
allowed-tools: Read Write Edit Glob Grep Bash(node *)
---

# Build the schema guide

Turn this project's database schema into one offline HTML page: a short tour, every table and link in plain words, a pan-and-zoom map, delete impact and join paths.

- CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/schema-guide.mjs"` (called `CLI` below; Node 18+). Run it from the project root.
- Files: `.schema-guide/facts.json` (the schema), `.schema-guide/guide.json` (your words), `docs/schema-guide.html` (the page; pass the same `--out <path>` to `build` and `check` to change it).
- Privacy: database URLs and passwords go only to the local CLI. Never print a password. Never send the schema or a URL anywhere.

Arguments: $ARGUMENTS

## 1. Start

If `.schema-guide/guide.json` already exists, the guide is set up: say so, then follow `${CLAUDE_PLUGIN_ROOT}/skills/update/SKILL.md` instead.

If the project writes its docs to a folder that already exists with different capitalisation (`Docs/`, `doc/`), use that folder in `--out` rather than creating a second one.

## 2. Find the schema, or stop

This plugin documents **relational** schemas. Before anything else, confirm the project has one — at least one of:

- a reachable PostgreSQL, MySQL/MariaDB or SQLite database;
- a SQLite/`.db` file in the repo;
- SQL migrations, `schema.rb`, `structure.sql`, `schema.prisma`, or ORM table definitions (Drizzle, TypeORM, Sequelize, SQLAlchemy, Django, Laravel, Ent, JPA `@Entity`).

**If none of those exist, stop.** Tell the user the project has no relational schema to document, name what you looked for, and write nothing. Projects that persist only to key-value storage (AsyncStorage, Redis, `localStorage`), document stores, or bundled JSON files are out of scope. Do not build a schema out of TypeScript interfaces, API types or JSON fixtures: the page would look exactly as authoritative as one read from a live database, and every table in it would be invented.

## 3. Read the schema

1. Pick the database: the argument; else a `DATABASE_URL` (or similar) in `.env*`, `docker-compose*.yml` or config files. Prefer a local or dev database; never production unless the user named it.
2. Run `CLI read "<url-or-file>"` (Postgres `postgres://…`, MySQL `mysql://…`, SQLite `path.db`).
   - Client missing (`psql`, `mysql`): look for it (e.g. `C:\Program Files\PostgreSQL\*\bin`, Homebrew, `/usr/lib/postgresql/*/bin`) and add `--client <path>`.
   - Postgres tables outside `public` are included; `--schema <name>` limits it to one schema.
3. Several databases (one per service, a separate analytics database): read each into its own file (`CLI read "<url>" --facts .schema-guide/<db>.json`), then merge the tables into one `.schema-guide/facts.json`, setting `"database"` on every table. Ask the user first if it is more than a handful.
4. If no database can be reached (not running, no client, no credentials) but the schema sources from step 2 exist, write `.schema-guide/facts.json` yourself from those sources, following `${CLAUDE_PLUGIN_ROOT}/reference/facts-format.md`, and tell the user the schema was read from files, not from a server.

Record relationships the code relies on but the database does not enforce (a bare `rider_id` with no FOREIGN KEY, anything crossing a service boundary) as `"enforced": false` links. Without them every delete looks free and the map comes out empty; recorded as ordinary foreign keys they make the page promise cascades that do not exist.

## 4. Write the guide

Read `${CLAUDE_PLUGIN_ROOT}/reference/guide-format.md` first. Then read the code that uses the tables (models, services, repositories, API handlers, jobs, docs, migration comments) and write `.schema-guide/guide.json`:

- `project`: name, the source of truth (e.g. "the SQL files in `db/migrations/`"), `code: ["sql", "kysely"]` if the project uses Kysely (or `knex`).
- `areas`: 4–12 groups, every table in exactly one.
- `tables`: a one-line `purpose` for every table; column notes only where they add something.
- `values`: value lists kept in application code, not in the database.
- `indexes`: why each index exists, when the code shows it.
- `tour`: 8–15 steps, one idea each.
- `reference`: the built-ins, plus topics the repo really documents (conventions, status flows, retention, migrations, known gaps).

Ground every sentence in something you read. When unsure, leave it out rather than guess.

## 5. Build and check

Run `CLI build`, then `CLI check --browser`. Fix every error (usually a misspelt name in guide.json) and rerun until it passes; fix warnings that point at missing text. Without Chrome or Edge, `CLI check` alone is enough.

## 6. Report

Tell the user where the page is (the path `build` printed); the counts (tables, links, areas, tour steps); any warnings left; and to run `/schema-guide:update` after a schema change. If the facts came from files rather than a server, say so — the page says so too. Suggest committing `.schema-guide/guide.json`, `.schema-guide/facts.json` and the page; `.schema-guide/facts.prev.json` can be git-ignored.
