# Changelog

## 1.1.0 — unreleased

**An Examples tab on every table page.** Columns and Links state the facts; Examples makes them concrete for someone who has never seen the schema: what `kind` is and what it can hold, what a `mime_type` is, why `duration_ms` is in milliseconds.

- Columns in a few named groups, each one explained in plain words with real-looking example values. A column with a value list shows every allowed value, in order for a flow, with what each one means.
- Made-up rows showing the table in different situations (a paid order, a basket, an expired one), one at a time, with `NULL` marked. The page says the rows are invented and were not read from the database.
- Short "what happens when…" stories: a flow of statuses and the values the row ends up with.
- Written by `build` into `tables.<t>.examples` in `guide.json`, for every table with 5 or more columns, and kept in step by `update`. An older guide gets its examples on the next `update`.
- `check` holds the examples to the schema: every column they name must exist; a sample value must be one the column's list allows; `NULL` is refused in a `NOT NULL` column; a column may sit in only one group. It warns about columns in no group, sample rows that leave columns out, and tables with 5 or more columns that have no examples yet.
- Additive: a guide without `examples` renders exactly as before, with no Examples tab and no new warnings. The Columns tab gains one line pointing to Examples when a table has them.
- The demo's 21 tables all have examples.
- Fix: `check` looked for `[[table]]` links in the raw JSON of guide.json, so an example pair like `[["101", "Rahim"]]` passed for a broken link. It now reads only the guide's text; a real broken link is still caught.

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
