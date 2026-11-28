# guide.json

The words people read. Everything structural (tables, columns, types, keys, links, delete rules, indexes, checks, value lists from the database) comes from `facts.json`. Never repeat it here; only explain it.

If you find yourself listing relationships in prose because `facts.json` has none, stop: those belong in `facts.json` as `"enforced": false` links (see `facts-format.md`). Written out here they are invisible to the map, delete impact and join path.

## Writing rules

- Short phrases, plain words, one idea per sentence. Write for a new teammate, not for a DBA.
- `purpose`: one line saying what one row is. "One row per signed-in device." Not "This table stores…".
- Column notes only where they add something: units, who sets it, what NULL means, a gotcha. Skip obvious columns (`id`, `created_at`, a plain `name`) — skipping one does not move it; columns stay in database order.
- Status-like columns: the database's own value lists (CHECK `IN (…)`, enums) are read automatically. Write the list in the note as `a · b · c` (or `a → b → c, or d` for an ordered flow) only when the database doesn't declare it, or when you want hints: `draft · published (live) · archived`.
- Text is mini-markdown: `` `code` ``, `**bold**`, `*em*`, `[[table]]` (links to that table), `[text](#route)`. No HTML.
- Numbers that follow the schema: `{tables}` `{areas}` `{links}` `{cascade}` `{setnull}` `{restrict}` `{hub}` `{in:t}` (links into t) `{inFrom:t}` (tables pointing at t) `{out:t}` `{outTo:t}`.

## Shape (every key is optional)

```json
{
  "project": {
    "name": "Acme",
    "source": "the SQL files in `db/migrations/`",
    "code": ["sql", "kysely"]
  },
  "areas": [
    { "id": "billing", "name": "Billing", "desc": "Plans, invoices and payments.", "tables": ["plans", "invoices", "payments"] }
  ],
  "tables": {
    "invoices": {
      "purpose": "One row per bill sent to a customer.",
      "columns": { "status": "draft → sent → paid, or void", "total_cents": "In cents, tax included" },
      "notes": ["Never deleted; voided instead."],
      "badges": ["soft delete"]
    }
  },
  "indexes": { "invoices_customer_idx": "A customer's invoices, newest first" },
  "checks": { "invoices_total_check": "Totals are never negative" },
  "tour": [],
  "reference": []
}
```

| Key | What it does |
| --- | --- |
| `project.name` | Brand, page title and home headline ("The Acme database, one step at a time"). `headline` overrides the headline; `footer` replaces the footer line; `source` names the source of truth in the footer. |
| `project.code` | Code tabs in Join path: `sql` always, plus `kysely` and/or `knex` when the project uses them. |
| `areas` | 4–12 groups of related tables, in reading order. Each table in exactly one area. `id` is a short slug used in links. Tables left out go to "Other tables". |
| `tables.<t>.purpose` | One line. Shown everywhere the table is listed. |
| `tables.<t>.columns` | Column notes; `""` means no note. Columns keep database order. To choose the order instead, list **every** column of that table — then your key order wins. |
| `tables.<t>.notes` | "Good to know" lines on the table's About tab. |
| `tables.<t>.badges` | Replaces the automatic badges (`public_id`, `soft delete`, `stored counts`, `composite PK`, `self-reference`, `ordered`, `slug`). Use `[]` for none. |
| `tables.<t>.checks` | Replaces the CHECK lines on the About tab (default: the database's checks that aren't value lists). |
| `tables.<t>.examples` | The table's **Examples** tab: every column in plain words with example values, made-up rows, and short "what happens when" stories. See [Examples](#examples) below. A table without it has no Examples tab. |
| `badges` | Help text for a badge, or a new badge name: `{ "soft delete": "Hidden at once; purged after 90 days." }`. |
| `values["t.c"]` | A value list for a column: `{ "values": [...], "flow": true, "or": ["failed"], "hints": { "v": "meaning" }, "note": "…" }`. `note` and `hints` are mini-markdown. Must match the database's list when it declares one; this is the right place for a list that only exists in application code (a Java `enum`, a TypeScript union) — say so in `note`. |
| `indexes` | Index name → why it exists (which screen or query). Unlisted indexes get "On (a, b)". |
| `checks` | CHECK constraint name → short title for the Rules page. |
| `hub` | The table most others hang off (default: found automatically; `null` for none). |
| `joinExample` | `[from, to]` shown first in Join path. |
| `highlight` | Mark recent additions: `{ "label": "new", "short": "added in v2", "note": "Added in v2.", "tables": [], "columns": ["t.c"], "indexes": [] }`. |
| `labels` | Wording overrides: `refused` (delete can be refused), `softDeleteWhy`, `lookup` (home), `hubWhy`, `selfCascade`, `indexesNone` (the "nothing else is indexed" line on a table's Indexes tab). |
| `aliases` | Old `#route` → new route, for links from elsewhere. |

## Tour

8–15 steps, one idea each, from the big picture to the details. Default (when `tour` is missing): overview → delete rules → the hub → one step per area.

```json
{ "title": "What happens when something is deleted",
  "text": ["Every link says what happens to a row when the row it points to is deleted."],
  "visual": { "kind": "rules", "cascade": "An order's lines go with it. {cascade} links work this way.", "setnull": "…", "restrict": "…" },
  "tables": ["orders", "order_lines"] }
```

`visual` is one of: `"areas"`; `{ "kind": "rules", … }`; `{ "kind": "flow", "steps": ["draft", "sent", "paid"] }`; `{ "kind": "table", "head": [...], "rows": [[...]], "prose": [2] }` (`prose` = columns in normal type); `"next"` (Explore / Reference buttons, for the last step).

## Reference

Topics, one page each. Built-ins: `{ "builtin": "links" }` (every link, filterable), `{ "builtin": "indexes" }`, `{ "builtin": "checks" }`. Default: those three. Add topics only for what the repo actually documents (conventions, status flows, retention jobs, migrations, known gaps).

```json
{ "id": "lifecycle", "title": "How data changes and expires", "desc": "Status flows, and what is cleaned up when",
  "sections": [
    { "title": "Status flows", "items": [
      { "title": "An invoice", "steps": ["draft", "sent", "paid"], "text": "Void is allowed from any step." } ] },
    { "title": "Errors the API returns", "table": { "head": ["When", "Answer"], "rows": [["Unique violation", "`409`"]], "prose": [0] } }
  ] }
```

A section has any of `title`, `intro`, `items`, `table`, `note`. An item (one folded row) has `title` plus any of `text` (string or list of paragraphs), `steps`, `before` / `after`, `where`, `on` (a table), `tables` (chips), `tag` (small label).

## Examples

The Examples tab is for the reader who opens a table and doesn't know what half its columns mean: what is `kind`, what values can it hold, what is a `mime_type`? It explains every column in plain words, shows the values it really holds, and shows whole rows in different situations. Columns and Links state the facts; Examples makes them concrete.

Write it for every table with 5 or more columns (`check` lists the ones still missing once any table has examples). Small link tables can go without.

```json
"media_assets": {
  "purpose": "One row per uploaded image or video.",
  "examples": {
    "intro": "Every upload is a row here, from the moment it starts until its files are cleaned up.",
    "groups": [
      { "name": "What the file is",
        "text": "`kind` is what the file is; `purpose` is what it is used for. Each purpose gets its own processing.",
        "columns": {
          "kind": "What the file is.",
          "purpose": { "means": "Where the file is used.", "examples": { "avatar": "A profile photo, cropped square", "post": "An image or video in a post" } },
          "mime_type": { "means": "The file's format, in the standard form browsers use (a *MIME type*).", "examples": { "video/mp4": "an MP4 video", "image/jpeg": "a JPEG photo", "image/png": "a PNG image" } },
          "duration_ms": { "means": "Length in milliseconds, so 59.75 seconds is `59750`. NULL for images.", "examples": ["60000", "59750"] }
        },
        "table": { "head": ["File", "kind", "purpose"], "rows": [["Profile photo", "image", "avatar"], ["A Reel", "video", "post"]], "prose": [0] },
        "scenarios": [
          { "title": "A video is too long", "text": "Rahim uploads a two-minute video; the limit is 90 seconds.",
            "values": { "status": "failed", "error": "Video exceeds the maximum allowed duration." } } ] }
    ],
    "records": [
      { "name": "A published Reel", "text": "Processed and playing; the original upload is gone.",
        "values": { "id": 501, "kind": "video", "purpose": "post", "status": "ready", "raw_key": null, "duration_ms": 60000 } },
      { "name": "A failed upload",
        "values": { "id": 502, "kind": "video", "purpose": "post", "status": "failed", "raw_key": "raw/502/original.mp4", "duration_ms": 120000 } }
    ],
    "scenarios": [
      { "title": "An upload is abandoned", "text": ["The app closes halfway through an upload.", "The hourly cleanup removes uploads still `uploading` a day later."],
        "steps": ["uploading", "deleted by cleanup"], "values": { "status": "uploading" } }
    ]
  }
}
```

| Key | What it does |
| --- | --- |
| `intro` | One or two sentences above everything else: what a row is, in a newcomer's words. |
| `groups` | 2–7 groups of related columns, in reading order. A group has `name`, optional `text` (string or list of paragraphs), `columns`, and optional `table` (same shape as a tour `table` visual) and `scenarios`. Put **every column in exactly one group**; columns left out are shown under "Other columns" and `check` warns. Name a group by what its columns do for the reader ("Who uploaded it", "Where the files are"), not by type. |
| `groups[].columns.<c>` | Either a string (what the column means) or `{ "means": "…", "examples": … }`. `means` falls back to the column's note on the Columns tab. |
| `examples` | 1–5 typical values: `["a", "b"]`, `[["a", "what a means"]]` or `{ "a": "what a means" }`. Give meanings when the value alone doesn't explain itself (`image/webp`, `250` basis points). |
| `records` | 2–4 made-up rows, each `{ "name", "text", "values": { column: value } }`, shown one at a time with a switcher. Pick rows that differ in a way that teaches something (each `kind`, a `failed` row, a row with its optional columns empty), so the reader sees which columns stay NULL when. Give **every column**, `null` where it is empty (the example above is shortened; `check` warns about a record that leaves columns out). A `json`/`jsonb` value can be a JSON object. |
| `scenarios` | 1–3 short stories of something happening to a row: `{ "title", "text", "steps", "values" }`. `steps` draws a flow (`["uploading", "processing", "ready"]`); `values` shows what the row then holds. Top-level stories close the tab; a group's stories sit next to the columns they explain. |

Rules:

- **Explain jargon on first use.** If a newcomer would ask "what is that?" (MIME type, basis points, ISO 4217, HLS playlist, idempotency key), answer it in `means`.
- **Values with a list.** A column whose values the database restricts (CHECK, enum), or that has a `values` entry, shows **every** allowed value automatically, in order for a flow. Use `examples` as an object to say what each value means. Values outside the list are an error.
- **The values are made up; the behaviour is not.** Invent ids, names, emails, keys and timestamps, but take what *happens* (limits, jobs, who sets what, what NULL means) from code you read. If the code doesn't show it, leave it out.
- **Never copy real data.** No rows from the database, a dump, logs, seeds or fixtures that hold real people's data. No real names of users, real emails, tokens, keys, passwords or URLs with secrets. Use `example.com` addresses and plain placeholder names.
- **Stay inside the schema.** Records and stories may only name real columns, may not set a `NOT NULL` column to `null`, and must use listed values; `check` errors otherwise. Keep numbers consistent with the database's own checks (a total that must equal its parts should).
- **Explain; don't review.** Say what a column is for and how it is used. No "keep / remove" verdicts or design advice: the page describes the schema as it is.

The page says, above the rows, that they are made up and were not read from the database.

## On update

Keep every existing sentence word for word. Change only what the change list touches: add entries for new tables, columns, indexes and value lists; delete entries for removed ones; fix any text that mentions something renamed or removed.

The same goes for `examples`: a new column joins a group and gets a value in every record; a removed column leaves its group, the records and the stories; a changed value list changes the values the records and stories use. `check` names each one that no longer matches.
