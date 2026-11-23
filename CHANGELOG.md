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

- Home, Tour, Explore (areas → tables → About / Columns / Links / Indexes), Tools (Map with six views, Delete impact, Join path), Reference. One offline file, opening in light mode with a remembered dark toggle.
- Every page's footer carries a **Meet the dev** button linking to the author's portfolio.

**Honesty about what it knows**

Three real codebases were used to find out where the plugin lies; [`docs/evaluation.md`](docs/evaluation.md) has the detail.

- Three provenance levels, each with the wording it earns. A schema **read** from a database claims nothing extra; one **written from schema files** says so on Home and in the footer; one **inferred** from application code, where the project has no database at all, gets a large notice on Home, a strip on every other page, "A proposed database for …" as its headline and "(no database)" in its title.
- On a project with no schema, `build` stops and asks before writing anything, rather than inventing tables from application types and presenting them as documentation. If the user wants a proposal, it reads the storage layer, types, fixtures and the services that query them, and designs one — labelled as a proposal everywhere.
- `"enforced": false` records a reference the database doesn't enforce: drawn dashed, excluded from cascades, and shown in delete impact as rows left pointing at nothing — instead of "the delete always succeeds".
- `"database"` groups tables by database; join path declines to offer SQL that would cross a boundary, and `check` errors on an enforced foreign key that crosses one.
- `check` warns on a schema with no links at all, and on a reference page that would silently vanish.
- Maps and tabs no longer describe links, indexes or rankings that aren't there.
- An area whose id collides with a fixed map view (`all`, `layers`, `ownership`, `hubs`, `values`, `table`) no longer breaks its own map page.
- On the Ownership map, a table whose every owned table is already shown under an earlier owner used to read "owns 0 tables" above an empty list. It now names them and says where they are.
- Every page's footer separates what was read from what was written: the structure is introspected and `check` refuses prose that names anything absent from it, but the explanations are Claude's reading of the code and can be wrong. The footer says so and names the file to correct.
- A hand-written `facts.json` that leaves out `primaryKey`, `foreignKeys`, `indexes` or `checks` now builds, instead of writing the page and then failing with "Cannot read properties of undefined". A table with no columns is refused before anything is written.
- The "(no database)" marker survives navigation: the engine rewrites the tab title on every route, and used to drop it after the first paint.
