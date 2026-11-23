# Evaluation

Before 1.0, `schema-guide` was run end to end on three real codebases of deliberately different shapes. Each run followed `skills/build/SKILL.md` literally, from finding the database to `check --browser`, and recorded every place the plugin was wrong, ambiguous or misleading. The projects are private, so they are described here by stack and size.

| | Stack | Schema | Result |
| --- | --- | --- | --- |
| **A** | FastAPI + SQLModel, SQLite file in the repo | 24 tables, 44 foreign keys, 9 indexes, 0 CHECKs | Read live. 197 pages rendered, 34 maps without overlaps, `check --browser` passed |
| **B** | Spring Boot, 7 services, 7 PostgreSQL databases, JPA entities | 14 tables, 89 columns, **0** foreign key constraints | Built from entity classes. 130 pages rendered, passed — and was half wrong |
| **C** | React Native / Expo, AsyncStorage + bundled JSON | none | Produced a 9-table schema that does not exist, and labelled it documentation |

Case A is what the plugin was built for, and it held up: the only defect was cosmetic. Cases B and C are where it failed, and both failures had the same shape — the pipeline reported success on output that was not true. Every finding below is fixed in 1.0; the commits are in the history.

## What case B found: a schema whose links the database doesn't enforce

Every relationship in project B is a bare `Long` field (`trips.riderId`, `payments.tripId`). No `@JoinColumn`, so Hibernate creates no `FOREIGN KEY` — not even between two tables in the same database. An honest `facts.json` therefore had `"foreignKeys": []` everywhere, and the page built from it said, for every table:

> 0 tables lose rows · 0 columns set to NULL · 0 links can block it — *Nothing. The delete always succeeds.*

Deleting a rider in that system orphans rows in six other databases. A new teammate reading that page would conclude the opposite. Join path said `trips` and `payments` were "not connected" when `payments.trip_id` connects them; the ownership and layers maps were empty; the tour step about delete rules was three zeros.

The alternative was worse. Recording those 21 references as ordinary foreign keys — what a model under pressure to produce a non-empty map will do — built a page that looked *excellent* and was false: "7 links can block it" when nothing blocks it, and a copy button offering `SELECT … FROM trips JOIN payments …`, a query that cannot run because the two tables live in different databases. `check` passed both versions without comment. The tool rewarded fabrication and punished honesty.

**Fixed** by giving the format a way to say what is true:

- `"enforced": false` on a foreign key — the code treats the column as a reference, the database does not. The map draws it dashed, the links page gets a "Not enforced" filter, and delete impact grows a **Left pointing at nothing** section instead of claiming the delete is safe.
- `"database"` on a table. Join path flags a chain that crosses databases and says plainly that the SQL below it cannot be run as it stands.
- `check` now **errors** on an enforced foreign key that crosses a database boundary (no database can enforce that) and **warns** when a schema has no links at all, which is the signal that would have caught the empty guide immediately.
- `facts-format.md` documents JPA/Hibernate: naming strategy, Hibernate 6 type mappings, `@Enumerated(EnumType.STRING)` columns whose value list exists only in Java, and that `ddl-auto: update` leaves the live schema a superset of the entities.

## What case C found: no stopping rule

Project C has no database of any kind — ten AsyncStorage keys and three bundled JSON files. The build skill had no branch for that. Its only remaining path read *"If no database can be reached, write `.schema-guide/facts.json` yourself from the schema sources"*, and the reference doc's list of sources named "TypeORM / Sequelize models", which a TypeScript interface resembles closely enough.

So the run produced a 9-table schema with foreign keys, `ON DELETE CASCADE` rules and indexes — every one of them invented — and then:

```
Built docs/schema-guide.html (148 KB): 9 tables, 2 links.
Check passed: 88 pages rendered, 16 maps without overlaps.
Browser: 22 pages at 1300px, canvas: focus, drag and zoom work, 22 pages at 520px.
```

A 148 KB page headed "The … database, one step at a time", with a Delete impact page explaining cascades that can never happen, and a footer reading "Tables, columns and links **were read from** the schema files". Nothing in it was checkable against the repo, and it carried exactly the visual authority of a page introspected from a live server. The final step of the skill then told the user to commit it, and `/schema-guide:update` would have refreshed the fiction on every run while `guide-format.md` instructed the next model to preserve its wording word for word.

**Fixed.** The defect was never that a schema got proposed — a proposal is useful, and for a project about to add a database it may be the most useful thing the tool can do. The defect was the register: a proposal presented as a description, with no way for a reader to tell. So the fix separates the two rather than banning one.

`build` now classifies the project before reading anything, and the page carries whichever claim the source supports:

| Source | `kind` | What the page says |
| --- | --- | --- |
| A running database | `postgres` `mysql` `sqlite` | Nothing; the facts speak for themselves |
| Real schema sources, no server | `files` | A note on Home and in the footer: written from schema files, not verified |
| No schema at all | `inferred` | A large notice on Home, a strip on every other page, "(no database)" in the title |

- In the third case the skill **stops and asks** before writing anything, naming what it found instead of a schema. If the user declines, nothing is written.
- If they accept, the proposal is built properly — from the storage layer, the types, the fixture data and the services and screens that query it — and labelled as a proposal everywhere, including the page title and the footer. The headline becomes "A proposed database for …" rather than "The … database, one step at a time".
- `check` warns on every `inferred` build, and again if `source.inferredFrom` doesn't say what was read.
- `update` keeps `kind: "inferred"` until a real schema appears, and says so each time.
- `facts-format.md` states that application types, key-value stores and JSON fixtures are not schema sources, and that a schema derived from them must be marked `inferred`.
- A schema written from files now says so **on the page**, not just in a footer line that claimed the tables "were read from" something.

## Smaller defects, all fixed

| Found in | Defect | Fix |
| --- | --- | --- |
| A | A declared `{ "builtin": "checks" }` reference page vanished silently when the schema had no CHECKs, while Home still advertised it | `check` warns; Home hides the card when Reference is empty |
| B | `docs/` resolved to the project's existing `Docs/` on a case-insensitive filesystem, and the CLI printed a path that didn't exist as spelled | `build` prints the real resolved path; the skill looks for an existing docs folder first |
| B | `values` notes and hints rendered literal backticks and `[[table]]` instead of code and links | They go through the same mini-markdown renderer as every other guide string |
| B | Skipping an obvious column in `guide.json` silently reordered the whole table, moving the primary key last | Columns keep database order unless the guide lists every one of them |
| B | A table's Indexes tab asserted "That is enough for how it is read" about reads nobody had looked at | Reworded to what is actually known, with a `labels.indexesNone` override |
| B | Ownership and Most connected described links that did not exist ("the ten tables with the most links", all showing `0 in, 0 out`) | Both gate their wording on the real counts |
| B | Two tables with the same name in different databases silently merged into one | `check` errors |
| B | `build` emitted a page from a facts/guide mismatch that only `check` would catch | `build` validates first and writes nothing on an error |
| B | `psql`'s connection error printed its hint before its cause, and twice | The cause first, de-duplicated, at most three lines |
| B | `--help` exited 1 | Exits 0 |
| B | "1 levels" on the Layers map | Singular forms |
| C | `read <not-a-database>` printed "Reading …" before rejecting the argument | The target is checked before anything is printed |

## What held up

The CLI's error handling was already sound: every bad input produced one clear line and a correct exit code, and passwords were masked in `read`'s output in both the success and failure paths. `check`'s referential validation caught every misspelt table, column, index, area and tour reference it was given, and the browser probe — 24 pages at 1300 px and 520 px, with drag, zoom and focus on the canvas — is a real gate. On case A, a 24-table schema with three generations of notification tables, the generated areas, tour and maps needed no hand-holding.

The authoring format also proved expressive enough to carry everything the evaluations knew about these systems, including the parts that turned out to belong in `facts.json` instead.

## Known limits

- **Several databases are described, not introspected together.** `read` connects to one database at a time; a multi-database `facts.json` is assembled by reading each in turn and merging. Table names must still be unique across the whole file.
- **`enforced: false` is a human judgment.** Nothing can verify that a bare `rider_id` really points at `riders`, so `check` only enforces internal consistency.
- **A proposed (`inferred`) schema is a design, not a record.** Nothing validates it against anything, because there is nothing to validate against. The labelling is what makes it safe, and the labelling is enforced by the template rather than by the model.
- **A schema built from files is as current as the files.** With Hibernate's `ddl-auto: update` or any ORM that creates tables at startup, the live database may hold columns the models no longer declare.
- Only PostgreSQL, MySQL/MariaDB and SQLite can be read directly. Anything else goes through the hand-written path.

## Reproducing

```sh
node test/run.mjs            # the example and every fixture, including the unenforced-link cases
node test/run.mjs --browser  # adds the Chrome/Edge probe
```

Real servers are optional: `TEST_PG_URL` and `TEST_MYSQL_URL` point the suite at a scratch database holding `test/fixture.pg.sql` or `test/fixture.mysql.sql`.
