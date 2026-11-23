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

## 2. Read the schema

1. Pick the database: the argument; else a `DATABASE_URL` (or similar) in `.env*`, `docker-compose*.yml` or config files. Prefer a local or dev database; never production unless the user named it.
2. Run `CLI read "<url-or-file>"` (Postgres `postgres://…`, MySQL `mysql://…`, SQLite `path.db`).
   - Client missing (`psql`, `mysql`): look for it (e.g. `C:\Program Files\PostgreSQL\*\bin`, Homebrew, `/usr/lib/postgresql/*/bin`) and add `--client <path>`.
   - Postgres tables outside `public` are included; `--schema <name>` limits it to one schema.
3. If no database can be reached (not running, no client, no credentials), write `.schema-guide/facts.json` yourself from the schema sources, following `${CLAUDE_PLUGIN_ROOT}/reference/facts-format.md`, and tell the user you did.

## 3. Write the guide

Read `${CLAUDE_PLUGIN_ROOT}/reference/guide-format.md` first. Then read the code that uses the tables (models, services, repositories, API handlers, jobs, docs, migration comments) and write `.schema-guide/guide.json`:

- `project`: name, the source of truth (e.g. "the SQL files in `db/migrations/`"), `code: ["sql", "kysely"]` if the project uses Kysely (or `knex`).
- `areas`: 4–12 groups, every table in exactly one.
- `tables`: a one-line `purpose` for every table; column notes only where they add something.
- `values`: only for value lists kept in app code, not in the database.
- `indexes`: why each index exists, when the code shows it.
- `tour`: 8–15 steps, one idea each.
- `reference`: the built-ins, plus topics the repo really documents (conventions, status flows, retention, migrations, known gaps).

Ground every sentence in something you read. When unsure, leave it out rather than guess.

## 4. Build and check

Run `CLI build`, then `CLI check --browser`. Fix every error (usually a misspelt name in guide.json) and rerun until it passes; fix warnings that point at missing text. Without Chrome or Edge, `CLI check` alone is enough.

## 5. Report

Tell the user where the page is; the counts (tables, links, areas, tour steps); any warnings left; and to run `/schema-guide:update` after a schema change. Suggest committing `.schema-guide/guide.json`, `.schema-guide/facts.json` and the page; `.schema-guide/facts.prev.json` can be git-ignored.
