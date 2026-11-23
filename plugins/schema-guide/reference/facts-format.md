# facts.json

The schema itself. Normally written by `schema-guide.mjs read`.

## When to write it by hand

Only when no database can be reached. Then read the project's **schema sources** and record the schema as it is after the last migration:

| Project | Source |
| --- | --- |
| SQL-first | migrations in order, `db/schema.rb`, `structure.sql` |
| Prisma / Drizzle / TypeORM / Sequelize | `schema.prisma`, table/model definitions |
| Django / Rails / Laravel / SQLAlchemy | `models.py`, migrations, `models.rb` |
| JPA / Hibernate (Spring Boot) | `@Entity` classes — see "JPA" below |

**A schema source declares tables, columns and keys.** Plain TypeScript interfaces, API response types, key-value stores (AsyncStorage, Redis, `localStorage`), document collections and bundled JSON files are **not** schema sources. A schema derived from those is a proposal, not a description, and must be marked `"kind": "inferred"` — see below. Never pass one off as `"files"`: a guessed schema that looks as authoritative as one read from a live server is worse than no guide.

```json
{
  "version": 1,
  "source": { "kind": "files", "name": "acme", "dialect": "postgres", "readAt": "2026-01-31T12:00:00Z" },
  "tables": [
    {
      "name": "invoices",
      "database": "billing_db",
      "columns": [
        { "name": "id", "type": "bigint", "notNull": true, "default": "identity" },
        { "name": "status", "type": "text", "notNull": true, "values": ["draft", "sent", "paid", "void"] }
      ],
      "primaryKey": ["id"],
      "uniques": [["number"]],
      "foreignKeys": [
        { "name": "invoices_customer_id_fkey", "columns": ["customer_id"], "table": "customers", "refColumns": ["id"], "onDelete": "cascade" },
        { "columns": ["account_id"], "table": "accounts", "refColumns": ["id"], "enforced": false }
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

- `source.kind`: `postgres` | `mysql` | `sqlite` | `files` | `inferred`. It sets how much the page is allowed to claim, so it must match where the schema really came from:

  | `kind` | Where it came from | What the page says |
  | --- | --- | --- |
  | `postgres` `mysql` `sqlite` | Read from a running database by `read` | Nothing; the facts speak for themselves |
  | `files` | Written by hand from real schema sources (migrations, ORM models, `@Entity`) | A note on Home and in the footer: written from schema files, not verified against a server |
  | `inferred` | **No schema exists.** The shape was proposed by reading application code | A large notice on Home, a strip on every other page, and "(no database)" in the page title |

  With `files` or `inferred`, set `dialect` (`postgres`, `mysql` or `sqlite`) for SQL quoting.
- `source.inferredFrom`: required with `kind: "inferred"`. Mini-markdown naming exactly what was read, shown on the page — e.g. ``"the TypeScript types in `src/types/` and the AsyncStorage keys in `src/services/storage.ts`"``.
- Types as written in the schema, short forms (`timestamptz`, `varchar(80)`, `text[]`).
- `notNull`: true for NOT NULL and primary-key columns; leave it out otherwise.
- `onDelete`: `cascade` | `setnull` | `setdefault` | `restrict`. No action, missing, and `RESTRICT` are all `restrict`.
- `refColumns`: the referenced columns; usually the target's primary key.
- `uniques`: UNIQUE constraints (one array per constraint). Unique *indexes* go in `indexes` with `"unique": true`. A constraint whose generated name you can't work out may be left unnamed.
- `indexes`: only indexes you create yourself, not the ones behind primary keys and UNIQUE constraints. `columns` may hold expressions (`lower(email)`) and ` DESC`.
- `values`: the allowed values of a column **as the database declares them** (enum type, `ENUM(…)`, or a CHECK that only lists literals). Mark that CHECK with `"column"` so it isn't listed twice. A list that only exists in application code (a Java `enum`, a TypeScript union, an `ActiveRecord` enum) is not a database fact: put it in `guide.values` instead.
- `default`: the default as the schema writes it (`"now()"`, `"0"`, `"identity"` for an identity/auto-increment column). Leave it out when there is none.
- Leave out migration bookkeeping tables (`schema_migrations`, `_prisma_migrations`, `flyway_schema_history`, …).
- Sort tables by name. Keep column order as declared.
- Table names must be unique across the whole file, including across databases. Two tables with the same name are an error, not a merge; prefix one (`identity.users`) if a system really has both.

## Links the database doesn't enforce

`"enforced": false` records a reference that is real in the code but absent from the database: a bare `rider_id` column with no FOREIGN KEY, usually because the two tables live in different databases or different services.

Use it whenever the code treats a column as a reference and the database doesn't. It is the honest answer, and the page handles it: the map draws the link dashed, delete impact says the rows will be left pointing at a row that no longer exists instead of claiming the delete is safe, and join path refuses to offer SQL across a database boundary.

- Leave `onDelete` out. Nothing happens on delete — that is the point.
- `name` is optional; there is no constraint to name.
- Do **not** record these as ordinary foreign keys. That makes the page promise cascades and blocks that do not exist, and no check can tell the difference.
- Do **not** leave them out either, unless you are unsure the reference is real. Without them the map is empty and every delete looks free.

## Several databases

Set `"database"` on every table when a system spans more than one database (one per microservice, a read replica, a separate analytics database). It groups the maps, labels each table, and lets join path decline a `JOIN` that would cross databases. With a single database, leave it out.

## JPA / Hibernate

The schema is implicit, so write down what Hibernate would create and say so in `project.source`:

- Names: `CamelCaseToUnderscoresNamingStrategy` is the Spring Boot default — `rideRequestId` becomes `ride_request_id`, class `RideRequest` becomes `ride_request` unless `@Table(name = …)` says otherwise.
- Types (Hibernate 6 on PostgreSQL): `String` → `varchar(255)`, `Long`/`Integer` → `bigint`/`integer`, `Double` → `float8`, `BigDecimal` → `numeric(38,2)`, `LocalDateTime` → `timestamp(6)`, `Boolean` → `boolean`, `UUID` → `uuid`.
- `@GeneratedValue(strategy = IDENTITY)` → `"default": "identity"`. `@Column(nullable = false)` → `notNull`. `@Column(unique = true)` → a one-column entry in `uniques`.
- `@Enumerated(EnumType.STRING)` → a `varchar` column with **no** `values`: the enum is in Java, not in the database. Put the list in `guide.values` with a note saying the database accepts any text.
- `@ManyToOne` with `@JoinColumn` → a real foreign key. A bare id field (`private Long riderId`) → `"enforced": false`.
- `ddl-auto: update` never drops anything, so the live schema may hold columns the entities no longer declare. Say that in `project.source`.
