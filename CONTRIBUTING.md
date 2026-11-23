# Contributing

Issues and pull requests are welcome.

## Layout

Everything that gets installed lives in `plugins/schema-guide/`:

| Path | What |
| --- | --- |
| `skills/build/`, `skills/update/` | The two commands. Prose only — these are instructions to Claude |
| `scripts/schema-guide.mjs` | The CLI: `read`, `build`, `check` |
| `scripts/lib/introspect.mjs` | Reading PostgreSQL, MySQL and SQLite |
| `scripts/lib/check.mjs` | Validation, and rendering every page in Node |
| `scripts/lib/probe.mjs` | The optional Chrome/Edge check |
| `template/guide.html` | The page: CSS and engine inline, data injected at build time |
| `reference/` | The `facts.json` and `guide.json` formats |

The split that matters: **`facts.json` is what the database says, `guide.json` is what a person says about it.** Structure never goes in `guide.json`, and opinions never go in `facts.json`. An update can then rewrite the facts without touching anyone's wording.

## Running things

```sh
node test/run.mjs            # the example and every fixture
node test/run.mjs --browser  # adds the Chrome/Edge probe
TEST_PG_URL=postgres://… TEST_MYSQL_URL=mysql://… node test/run.mjs   # real servers, optional
claude plugin validate plugins/schema-guide --strict
```

To use a working copy in another project:

```sh
claude --plugin-dir /path/to/schema-guide/plugins/schema-guide
```

## Rules of the house

- **Zero dependencies, and keep it that way.** The CLI is plain Node (18+) and the page is one HTML file. No bundler, no runtime install.
- **Add a test with every change.** `test/run.mjs` builds real schemas and asserts rendered output; follow the existing style rather than adding a framework.
- **`check` must pass with no errors and no warnings** on the example before you push.
- **Never let the page assert something the schema doesn't say.** This is the one rule the project was rewritten for: see [`docs/evaluation.md`](docs/evaluation.md). If a count can be zero, the sentence around it has to read correctly at zero. If a fact is a human judgment (`enforced: false`), the page must present it as one.
- **Prose is part of the product.** Short sentences, plain words, written for a new teammate and not for a DBA. That applies to the skills and the reference docs as much as to the page.

## Releasing

1. Update `CHANGELOG.md`.
2. Bump `version` in `plugins/schema-guide/.claude-plugin/plugin.json` — there only, not in `marketplace.json`.
3. Tag the commit (`v1.0.1`) and push. Installs track the default branch, so merging to `main` ships it.
