# schema-guide

A Claude Code plugin that turns your database schema into a step-by-step, offline HTML guide for your team:

- **Tour:** a short guided walk through the whole database.
- **Explore:** every area and table, with columns, links and indexes in plain words.
- **Map:** a pan-and-zoom map of every table, plus dependency layers, ownership trees, the most connected tables and every value list.
- **Delete impact:** everything one `DELETE` takes with it.
- **Join path:** the shortest join between any two tables, as SQL (and Kysely or Knex).
- **Reference:** detailed lists, one topic per page.

## Install

```
/plugin install schema-guide --marketplace A-Piyas-04/schema-guide
```

On Claude Code before 2.1.275: `/plugin marketplace add A-Piyas-04/schema-guide`, then `/plugin install schema-guide@schema-guide-plugins`.

## Commands

| Command | When |
| --- | --- |
| `/schema-guide:build [database-url-or-file] [--out path]` | First time in a project |
| `/schema-guide:update [database-url-or-file]` | After any schema change |

Both read the live schema (PostgreSQL, MySQL/MariaDB or SQLite), or your schema files when no database is reachable. Claude writes the explanations from your code, then builds and checks the page.

The result is three files in your project:
- `docs/schema-guide.html`: the page, one file that works offline;
- `.schema-guide/facts.json`: the schema, read by the CLI;
- `.schema-guide/guide.json`: the words, written by Claude and yours to edit.

Commit all three. Add `.schema-guide/facts.prev.json` to `.gitignore`.

## Requirements

- Node.js 18 or newer (22.5+ for SQLite without the `sqlite3` CLI).
- `psql` for PostgreSQL, or `mysql` for MySQL/MariaDB.
- Chrome, Edge or Chromium (optional) for the in-browser check.

Database URLs and passwords are only handed to your local client. Nothing is sent anywhere.

## Without Claude

The CLI runs on its own, for example in CI after a migration:

```sh
node <plugin>/scripts/schema-guide.mjs read "$DATABASE_URL"   # schema -> .schema-guide/facts.json, prints what changed
node <plugin>/scripts/schema-guide.mjs build                    # -> docs/schema-guide.html
node <plugin>/scripts/schema-guide.mjs check                    # validates and renders every page
```

New tables get automatic text until the next `/schema-guide:update`.

MIT licensed.
