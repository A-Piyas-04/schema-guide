# Changelog

## 1.0.0 — 2026-11-23

First release.

**Commands**

- `/schema-guide:build` and `/schema-guide:update`, both user-invoked, so they cost nothing in context until you run them.

**CLI** (zero dependencies, Node 18+)

- `read` for PostgreSQL, MySQL/MariaDB and SQLite, printing a change list against the previous read.
- `build` renders the page and refuses a guide that doesn't match the schema.
- `check` validates the prose against the schema, renders every page in Node, checks the maps for overlaps and, with `--browser`, drives the real page in Chrome or Edge at desktop and phone width.

**The page**

- Home, Tour, Explore (areas → tables → About / Columns / Links / Indexes), Tools (Map with six views, Delete impact, Join path), Reference. Light and dark, one offline file.

**Honesty about what it knows**

Three real codebases were used to find out where the plugin lies; [`docs/evaluation.md`](docs/evaluation.md) has the detail.

- `build` stops on a project with no relational schema instead of inventing tables from application types or JSON files.
- A schema written from files rather than read from a server says so on the page.
- `"enforced": false` records a reference the database doesn't enforce: drawn dashed, excluded from cascades, and shown in delete impact as rows left pointing at nothing — instead of "the delete always succeeds".
- `"database"` groups tables by database; join path declines to offer SQL that would cross a boundary, and `check` errors on an enforced foreign key that crosses one.
- `check` warns on a schema with no links at all, and on a reference page that would silently vanish.
- Maps and tabs no longer describe links, indexes or rankings that aren't there.
- An area whose id collides with a fixed map view (`all`, `layers`, `ownership`, `hubs`, `values`, `table`) no longer breaks its own map page.
- On the Ownership map, a table whose every owned table is already shown under an earlier owner used to read "owns 0 tables" above an empty list. It now names them and says where they are.
