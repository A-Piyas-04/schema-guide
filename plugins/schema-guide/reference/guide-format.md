# guide.json

The words people read. Everything structural (tables, columns, types, keys, links, delete rules, indexes, checks, value lists from the database) comes from `facts.json`. Never repeat it here; only explain it.

## Writing rules

- Short phrases, plain words, one idea per sentence. Write for a new teammate, not for a DBA.
- `purpose`: one line saying what one row is. "One row per signed-in device." Not "This table stores…".
- Column notes only where they add something: units, who sets it, what NULL means, a gotcha. Skip obvious columns (`id`, `created_at`, a plain `name`).
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
| `tables.<t>.columns` | Column notes. Key order is the display order (unlisted columns follow in database order); `""` means no note. |
| `tables.<t>.notes` | "Good to know" lines on the table's About tab. |
| `tables.<t>.badges` | Replaces the automatic badges (`public_id`, `soft delete`, `stored counts`, `composite PK`, `self-reference`, `ordered`, `slug`). Use `[]` for none. |
| `tables.<t>.checks` | Replaces the CHECK lines on the About tab (default: the database's checks that aren't value lists). |
| `badges` | Help text for a badge, or a new badge name: `{ "soft delete": "Hidden at once; purged after 90 days." }`. |
| `values["t.c"]` | A value list for a column: `{ "values": [...], "flow": true, "or": ["failed"], "hints": { "v": "meaning" }, "note": "…" }`. Must match the database's list when it declares one. |
| `indexes` | Index name → why it exists (which screen or query). Unlisted indexes get "On (a, b)". |
| `checks` | CHECK constraint name → short title for the Rules page. |
| `hub` | The table most others hang off (default: found automatically; `null` for none). |
| `joinExample` | `[from, to]` shown first in Join path. |
| `highlight` | Mark recent additions: `{ "label": "new", "short": "added in v2", "note": "Added in v2.", "tables": [], "columns": ["t.c"], "indexes": [] }`. |
| `labels` | Wording overrides: `refused` (delete can be refused), `softDeleteWhy`, `lookup` (home), `hubWhy`, `selfCascade`. |
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

## On update

Keep every existing sentence word for word. Change only what the change list touches: add entries for new tables, columns, indexes and value lists; delete entries for removed ones; fix any text that mentions something renamed or removed.
