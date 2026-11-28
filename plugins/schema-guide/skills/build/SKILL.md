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

## 2. Find out what the project actually has

Before reading anything, work out which of three cases you are in. Search the repo: `.env*`, `docker-compose*.yml` and config for a database URL; `*.db` / `*.sqlite`; `migrations/`, `schema.rb`, `structure.sql`, `schema.prisma`; ORM table definitions (Drizzle, TypeORM, Sequelize, SQLAlchemy, Django, Laravel, Ent, JPA `@Entity`).

| What you found | Case | `source.kind` |
| --- | --- | --- |
| A database you can connect to, or a `.db` file | **A — read it** | `postgres` / `mysql` / `sqlite` |
| No reachable database, but real schema sources that declare tables and columns | **B — write it from those files** | `files` |
| No schema anywhere: the project persists to key-value storage, documents, bundled JSON, or nothing at all | **C — ask first** | `inferred` |

The B/C line is the one that matters, and it is easy to get wrong. A schema source **declares tables and columns to a database**: `CREATE TABLE`, a migration, `schema.prisma`, `@Entity`, a Drizzle/TypeORM/Sequelize table definition. TypeScript interfaces, API response types, Zod schemas, AsyncStorage keys, Redis keys and bundled JSON are **not** schema sources, however entity-shaped they look — an `interface Story { id: string; ayahId: string }` is case C, not case B. If nothing in the project would create a table when it ran, you are in case C.

**Case C is not a failure, and it is not business as usual.** Stop and tell the user plainly:

> This project has no database. I found no SQL schema, no migrations and no ORM model definitions — \<name what you did find, e.g. "ten AsyncStorage keys in `src/services/storage.ts` and three bundled JSON files"\>.
>
> I can propose a schema instead: I'd read the app's types, storage layer, services and screens, and design the tables the project would need. Every page would be labelled a proposal, because none of it would exist yet. Want that, or shall I stop here?

Build it only if they say yes, and then set `"kind": "inferred"` with `source.inferredFrom` naming what you read. The page then carries a large notice on Home, a strip on every other page, and "(no database)" in its title. Never label a proposal `files` — that claims the tables exist.

If they say no, or don't answer, write nothing.

## 3. Read the schema

1. Pick the database: the argument; else a `DATABASE_URL` (or similar) in `.env*`, `docker-compose*.yml` or config files. Prefer a local or dev database; never production unless the user named it.
2. Run `CLI read "<url-or-file>"` (Postgres `postgres://…`, MySQL `mysql://…`, SQLite `path.db`).
   - Client missing (`psql`, `mysql`): look for it (e.g. `C:\Program Files\PostgreSQL\*\bin`, Homebrew, `/usr/lib/postgresql/*/bin`) and add `--client <path>`.
   - Postgres tables outside `public` are included; `--schema <name>` limits it to one schema.
3. Several databases (one per service, a separate analytics database): read each into its own file (`CLI read "<url>" --facts .schema-guide/<db>.json`), then merge the tables into one `.schema-guide/facts.json`, setting `"database"` on every table. Ask the user first if it is more than a handful.
4. **Case B.** No database can be reached (not running, no client, no credentials) but schema sources exist: write `.schema-guide/facts.json` yourself from those sources, following `${CLAUDE_PLUGIN_ROOT}/reference/facts-format.md`, and tell the user the schema came from files, not from a server.
5. **Case C**, once the user has agreed. Read the code and design the schema it implies — this is real analysis, not transcription:
   - the storage layer (what each key or collection holds, and its shape);
   - the types and the data actually in bundled JSON or fixtures, including fields the types don't mention;
   - the services, screens and API handlers that read and write it: what is looked up by what, what is listed and sorted, what is counted;
   - anything that is already a de-facto key (an id, a slug, a date used to group by).

   Turn that into tables with real primary keys, foreign keys with the delete rule the app's behaviour implies, indexes for the lookups you actually saw, and value lists taken from the unions and enums in the code. Write `"kind": "inferred"` and `source.inferredFrom`. Say in `guide.json` where each decision came from, and in `project.source` name the files you read. Do not invent features the app doesn't have.

Record relationships the code relies on but the database does not enforce (a bare `rider_id` with no FOREIGN KEY, anything crossing a service boundary) as `"enforced": false` links. Without them every delete looks free and the map comes out empty; recorded as ordinary foreign keys they make the page promise cascades that do not exist.

## 4. Write the guide

Read `${CLAUDE_PLUGIN_ROOT}/reference/guide-format.md` first. Then read the code that uses the tables (models, services, repositories, API handlers, jobs, docs, migration comments) and write `.schema-guide/guide.json`:

- `project`: name, the source of truth (e.g. "the SQL files in `db/migrations/`"), `code: ["sql", "kysely"]` if the project uses Kysely (or `knex`).
- `areas`: 4–12 groups, every table in exactly one.
- `tables`: a one-line `purpose` for every table; column notes only where they add something.
- `tables.<t>.examples`: the table's **Examples** tab, for every table with 5 or more columns. Group the columns, say what each one holds in plain words (explain any jargon), give real-looking example values, 2–4 made-up rows that show different situations, and 1–3 short "what happens when" stories. Follow the Examples section of `guide-format.md`. Invent the values, but take what *happens* to them (limits, jobs, who sets what) from the code; never copy real rows or anyone's personal data.
- `values`: value lists kept in application code, not in the database.
- `indexes`: why each index exists, when the code shows it.
- `tour`: 8–15 steps, one idea each.
- `reference`: the built-ins, plus topics the repo really documents (conventions, status flows, retention, migrations, known gaps).

Ground every sentence in something you read. When unsure, leave it out rather than guess — a missing note costs a reader nothing, a confident wrong one costs them an afternoon.

## 5. Build and check

Run `CLI build`, then `CLI check --browser`, passing the same `--out` to both if you changed it. Fix every error (usually a misspelt name in guide.json) and rerun until it passes; fix warnings that point at missing text. Without Chrome or Edge, `CLI check` alone is enough. On a case C build, `check` always warns that the schema does not exist — that warning is correct, and stays.

## 6. Report

Tell the user where the page is (the path `build` printed); the counts (tables, links, areas, tour steps); any warnings left; and to run `/schema-guide:update` after a schema change. Say where the schema came from, in the same words the page uses: read from the database, written from schema files, or **proposed from application code and not yet real**. Never report a case C build as documentation of the project's database. Suggest committing `.schema-guide/guide.json`, `.schema-guide/facts.json` and the page; `.schema-guide/facts.prev.json` can be git-ignored.
