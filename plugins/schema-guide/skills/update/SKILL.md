---
description: Update the schema guide after a schema change (new migration, table, column or index).
argument-hint: "[database-url-or-file]"
disable-model-invocation: true
allowed-tools: Read Write Edit Glob Grep Bash(node *)
---

# Update the schema guide

Bring the guide in line with the current schema, changing only what the schema change touched.

- CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/schema-guide.mjs"` (called `CLI` below; Node 18+). Run it from the project root.
- Files: `.schema-guide/facts.json`, `.schema-guide/guide.json`, `docs/schema-guide.html` (or the `--out <path>` used before; pass it to `build` and `check`).
- Privacy: database URLs and passwords go only to the local CLI. Never print a password. Never send the schema or a URL anywhere.

Arguments: $ARGUMENTS

## 1. Start

If `.schema-guide/guide.json` doesn't exist, there is nothing to update: say so, then follow `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` instead.

## 2. Read the schema again

- Source: the argument; else the same database as last time (`source` in facts.json names its kind and database; the URL is in the same `.env` or config as before).
- Run `CLI read "<url-or-file>"`. It saves the old facts as `facts.prev.json` and prints **Changes since the last read**.
- If `source.kind` is `files`, rewrite facts.json from the schema sources (see `${CLAUDE_PLUGIN_ROOT}/reference/facts-format.md`), save the old copy as `.schema-guide/facts.prev.json` first, then run `CLI read --diff`. Rewrite it only from sources that actually declare tables and columns (SQL migrations, ORM table definitions, `@Entity` classes). If the project has no such sources, stop and tell the user the guide can't be verified against anything — do not refresh it from application types or JSON files.
- Keep `"enforced": false` on links the database still doesn't enforce, and add it for new ones (a bare id column, anything crossing a service boundary).
- No changes: still run step 4 (the page template may be newer) and tell the user the schema is unchanged.

## 3. Edit guide.json, only where the change list points

Read the "On update" part of `${CLAUDE_PLUGIN_ROOT}/reference/guide-format.md`, and the code behind each change. Then, per line of the change list:

| Change | Edit |
| --- | --- |
| `+ table t` | Put it in an area; write its purpose and useful column notes; add it to a tour step or reference topic only if it is a major feature. |
| `- table t` | Remove it from `areas`, `tables`, tour `tables`, reference items, `highlight`, `joinExample`, `hub`; fix sentences that mention it. |
| `+ column` / `~ column` | Add or fix its note if it isn't obvious; add `values` hints if useful. |
| `- column` | Remove its note and `highlight` entry; fix sentences that mention it. |
| `+ index` / `- index` | Add why it exists / remove its entry. |
| `+ link` / `~ link` / `- link` | Fix sentences that describe the old relationship or delete rule. |
| `+ check` / `- check` | Add or remove its title in `checks`. |

Keep every other sentence word for word. If the project marks recent additions with `highlight`, add the new names to it.

## 4. Build and check

Run `CLI build`, then `CLI check --browser`. Fix every error and rerun until it passes. Without Chrome or Edge, `CLI check` alone is enough.

## 5. Report

Give the user the change list, which guide entries you added, changed or removed, and any warnings left.
