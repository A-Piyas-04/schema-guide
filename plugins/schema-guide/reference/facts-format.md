# facts.json

The schema itself. Normally written by `schema-guide.mjs read`. Write it by hand only when no database can be reached; then read the schema sources (SQL migrations in order, Prisma `schema.prisma`, Drizzle / TypeORM / Sequelize models, Django `models.py`, Rails `db/schema.rb`, Laravel migrations, SQLAlchemy models) and record the schema **as it is after the last migration**.

```json
{
  "version": 1,
  "source": { "kind": "files", "name": "acme", "dialect": "postgres", "readAt": "2026-01-31T12:00:00Z" },
  "tables": [
    {
      "name": "invoices",
      "columns": [
        { "name": "id", "type": "bigint", "notNull": true, "default": "identity" },
        { "name": "status", "type": "text", "notNull": true, "values": ["draft", "sent", "paid", "void"] }
      ],
      "primaryKey": ["id"],
      "uniques": [["number"]],
      "foreignKeys": [
        { "name": "invoices_customer_id_fkey", "columns": ["customer_id"], "table": "customers", "refColumns": ["id"], "onDelete": "cascade" }
      ],
      "indexes": [
        { "name": "invoices_customer_idx", "columns": ["customer_id", "created_at DESC"], "where": "deleted_at IS NULL" }
      ],
      "checks": [
        { "name": "invoices_status_check", "expr": "status IN ('draft', 'sent', 'paid', 'void')", "column": "status" }
      ]
    }
  ]
}
```

Rules:

- `source.kind`: `postgres` | `mysql` | `sqlite` | `files`. With `files`, set `dialect` (`postgres`, `mysql` or `sqlite`) for SQL quoting.
- Types as written in the schema, short forms (`timestamptz`, `varchar(80)`, `text[]`).
- `notNull`: true for NOT NULL and primary-key columns; leave it out otherwise.
- `onDelete`: `cascade` | `setnull` | `setdefault` | `restrict`. No action, missing, and `RESTRICT` are all `restrict`.
- `refColumns`: the referenced columns; usually the target's primary key.
- `uniques`: UNIQUE constraints (one array per constraint). Unique *indexes* go in `indexes` with `"unique": true`.
- `indexes`: only indexes you create yourself, not the ones behind primary keys and UNIQUE constraints. `columns` may hold expressions (`lower(email)`) and ` DESC`.
- `values`: the allowed values of a column (enum type, `ENUM(…)`, or a CHECK that only lists literals). Mark that CHECK with `"column"` so it isn't listed twice.
- Leave out migration bookkeeping tables (`schema_migrations`, `_prisma_migrations`, …).
- Sort tables by name. Keep column order as declared.
