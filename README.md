# schema-guide for Claude Code

Turn any project's database schema into a step-by-step, offline HTML guide: a tour, every table and link in plain words, a pan-and-zoom map, delete impact and join paths. Two commands: **build** and **update**.

## Install

```
/plugin install schema-guide --marketplace A-Piyas-04/schema-guide
```

On Claude Code before 2.1.275, add the marketplace first:

```
/plugin marketplace add A-Piyas-04/schema-guide
/plugin install schema-guide@schema-guide-plugins
```

(Published under another account or repository name? Use that `owner/repo` in the first line.)

## Use

```
/schema-guide:build      # first time: reads the schema, writes the guide, builds docs/schema-guide.html
/schema-guide:update     # after a migration: shows what changed and updates only that
```

Pass a database URL or SQLite file if Claude can't find one (`/schema-guide:build postgres://localhost/app_dev`).

Both commands cost nothing until you run them: they are user-only skills, so their descriptions are never loaded into Claude's context.

## What's in this repository

| Path | What |
| --- | --- |
| `plugins/schema-guide/` | The plugin (this is all that gets installed) |
| `plugins/schema-guide/skills/build`, `skills/update` | The two commands |
| `plugins/schema-guide/scripts/schema-guide.mjs` | The zero-dependency CLI: `read`, `build`, `check` |
| `plugins/schema-guide/template/guide.html` | The page template |
| `plugins/schema-guide/reference/` | The `guide.json` and `facts.json` formats |
| `examples/doshomik/` | A real 39-table PostgreSQL schema and its guide |
| `test/run.mjs` | End-to-end tests (`node test/run.mjs`) |
| `PLAN.md` | Design notes |

## Develop

```sh
node test/run.mjs                                   # build + check the example and the fixtures
claude plugin validate plugins/schema-guide --strict
claude plugin validate . --strict
```

To try a local copy without publishing: `claude --plugin-dir plugins/schema-guide`.

MIT licensed.
