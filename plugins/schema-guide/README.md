# schema-guide

A Claude Code plugin that turns your database schema into a step-by-step, offline HTML guide for your team:

- **Tour:** a short guided walk through the whole database.
- **Explore:** every area and table, with columns, links and indexes in plain words.
- **Map:** a pan-and-zoom map of every table, plus dependency layers, ownership trees, the most connected tables and every value list.
- **Delete impact:** everything one `DELETE` takes with it.
- **Join path:** the shortest join between any two tables, as SQL (and Kysely or Knex).
- **Reference:** detailed lists, one topic per page.

One self-contained HTML file. No build step, no server, no dependencies — open it from `file://` or commit it and let your docs site serve it.

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

Both read the live schema (PostgreSQL, MySQL/MariaDB or SQLite). When no database is reachable, Claude writes the schema from your migrations or ORM model definitions instead, and the page says so. Claude then writes the explanations from your code, builds the page and checks it.

`update` prints exactly what changed since the last read — tables, columns, links, indexes, checks and value lists added, removed or altered — and rewords only those parts, so your wording stays put.

The result is three files in your project:
- `docs/schema-guide.html`: the page, one file that works offline;
- `.schema-guide/facts.json`: the schema, read by the CLI;
- `.schema-guide/guide.json`: the words, written by Claude and yours to edit.

Commit all three. Add `.schema-guide/facts.prev.json` to `.gitignore`.

Both commands are user-invoked only, so nothing about this plugin enters Claude's context until you run one.

## Requirements

- **A relational schema.** A reachable PostgreSQL, MySQL/MariaDB or SQLite database, a `.db` file, or SQL migrations / ORM table definitions (Prisma, Drizzle, TypeORM, Sequelize, SQLAlchemy, Django, Laravel, JPA). Projects that persist only to key-value storage, document stores or JSON files have no schema to document, and `build` will tell you so rather than invent one.
- Node.js 18 or newer (22.5+ for SQLite without the `sqlite3` CLI).
- `psql` for PostgreSQL, or `mysql` for MySQL/MariaDB. Not needed for SQLite or for reading from files.
- Chrome, Edge or Chromium (optional) for the in-browser check.

Database URLs and passwords are only handed to your local client. Nothing is sent anywhere.

## Links the database doesn't enforce

Microservices, or any codebase with bare `*_id` columns and no `FOREIGN KEY`, can record those references anyway:

```json
{ "columns": ["rider_id"], "table": "riders", "refColumns": ["id"], "enforced": false }
```

The map draws them dashed, delete impact says the rows will be left pointing at a row that no longer exists instead of calling the delete safe, and join path declines to hand you SQL that would cross a database boundary. Set `"database"` on each table when a system spans several databases.

## Without Claude

The CLI runs on its own, for example in CI after a migration:

```sh
node <plugin>/scripts/schema-guide.mjs read "$DATABASE_URL"   # schema -> .schema-guide/facts.json, prints what changed
node <plugin>/scripts/schema-guide.mjs build                  # -> docs/schema-guide.html
node <plugin>/scripts/schema-guide.mjs check                  # validates and renders every page
```

Zero dependencies, so there is nothing to install. `read` exits non-zero on a connection problem, `build` refuses a guide that doesn't match the schema, and `check` renders every page and fails on a broken link, an overlapping map or a stale build — enough to gate a pull request. Tables added since the last `/schema-guide:update` get automatic text in the meantime.

MIT licensed.
