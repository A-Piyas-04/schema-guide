// Reads a live schema into facts.json. Postgres via psql, MySQL/MariaDB via the mysql client,
// SQLite via node:sqlite (Node >= 22.5) or the sqlite3 CLI. Passwords go through the client's
// environment variable, never the command line. Nothing leaves this machine.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const META = new Set(['pgmigrations', 'knex_migrations', 'knex_migrations_lock', '_prisma_migrations', 'schema_migrations', 'ar_internal_metadata', 'flyway_schema_history', 'alembic_version', 'django_migrations', '__drizzle_migrations', '_sqlx_migrations', 'goose_db_version', 'migrations', 'typeorm_metadata', 'sequelizemeta', 'SequelizeMeta']);
const RULES = { a: 'restrict', r: 'restrict', c: 'cascade', n: 'setnull', d: 'setdefault' };
const MYSQL_RULES = { CASCADE: 'cascade', 'SET NULL': 'setnull', 'SET DEFAULT': 'setdefault', RESTRICT: 'restrict', 'NO ACTION': 'restrict' };

export async function introspect(target, opts = {}) {
  let facts;
  if (/^postgres(ql)?:\/\//i.test(target)) facts = postgres(target, opts);
  else if (/^(mysql|mariadb):\/\//i.test(target)) facts = mysql(target, opts);
  else if (/\.(db|sqlite3?|db3)$/i.test(target) || /^sqlite:/i.test(target)) facts = await sqlite(target.replace(/^sqlite:(\/\/)?/i, ''), opts);
  else throw new Error(`Don't know how to read "${redact(target)}". Use postgres://…, mysql://… or a .db/.sqlite file.`);
  if (!opts.keepMeta) facts.tables = facts.tables.filter((t) => !META.has(t.name) && !META.has(t.name.split('.').pop()));
  for (const t of facts.tables) attachValueLists(t);
  facts.tables.sort((a, b) => a.name.localeCompare(b.name));
  return facts;
}

export const redact = (url) => String(url).replace(/(\/\/[^:/@]+):[^@]*@/, '$1:***@');

/* ---------------- Postgres ---------------- */
const PG_SQL = `
with t as (
  select c.oid, case when n.nspname = 'public' then c.relname else n.nspname || '.' || c.relname end as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition
    and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_toast%' and n.nspname not like 'pg\\_temp%'
    and (:'schema' = '' or n.nspname = :'schema')
),
cols as (
  select co.oid, (select json_agg(a.attname order by k.ord) from unnest(co.conkey) with ordinality k(n, ord)
          join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.n) as names,
         (select json_agg(a.attname order by k.ord) from unnest(co.confkey) with ordinality k(n, ord)
          join pg_attribute a on a.attrelid = co.confrelid and a.attnum = k.n) as refs
  from pg_constraint co where co.conrelid in (select oid from t)
)
select json_build_object('tables', coalesce(json_agg(json_build_object(
  'name', t.name,
  'columns', (select json_agg(json_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
      'default', case when a.attidentity <> '' then 'identity' else pg_get_expr(d.adbin, d.adrelid) end,
      'enum', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = a.atttypid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
  'primaryKey', (select cols.names from pg_constraint co join cols on cols.oid = co.oid where co.conrelid = t.oid and co.contype = 'p'),
  'uniques', (select json_agg(cols.names order by co.conname) from pg_constraint co join cols on cols.oid = co.oid where co.conrelid = t.oid and co.contype = 'u'),
  'foreignKeys', (select json_agg(json_build_object('name', co.conname, 'columns', cols.names,
      'table', (select case when n2.nspname = 'public' then c2.relname else n2.nspname || '.' || c2.relname end
                from pg_class c2 join pg_namespace n2 on n2.oid = c2.relnamespace where c2.oid = co.confrelid),
      'refColumns', cols.refs, 'onDelete', co.confdeltype) order by co.conname)
    from pg_constraint co join cols on cols.oid = co.oid where co.conrelid = t.oid and co.contype = 'f'),
  'indexes', (select json_agg(json_build_object('name', ic.relname, 'unique', i.indisunique,
      'columns', (select json_agg(pg_get_indexdef(i.indexrelid, k, true) || case when i.indoption[k - 1] & 1 = 1 then ' DESC' else '' end order by k)
                  from generate_series(1, i.indnkeyatts) k),
      'where', pg_get_expr(i.indpred, i.indrelid, true)) order by ic.relname)
    from pg_index i join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = t.oid and not exists (select 1 from pg_constraint co where co.conindid = i.indexrelid and co.contype in ('p', 'u', 'x'))),
  'checks', (select json_agg(json_build_object('name', co.conname, 'expr', pg_get_constraintdef(co.oid, true)) order by co.conname)
    from pg_constraint co where co.conrelid = t.oid and co.contype = 'c')
) order by t.name), '[]'::json), 'database', current_database(), 'version', current_setting('server_version'))
from t;
`;

function findClient(name, opts) {
  if (opts.client) return opts.client;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const probe = spawnSync(exe, ['--version'], { encoding: 'utf8' });
  if (!probe.error) return exe;
  const roots = process.platform === 'win32'
    ? ['C:/Program Files/PostgreSQL', 'C:/Program Files/MySQL', 'C:/Program Files/MariaDB', 'C:/tools']
    : ['/usr/lib/postgresql', '/opt/homebrew/opt', '/usr/local/opt', '/Applications/Postgres.app/Contents/Versions'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const hit = [join(root, 'bin', exe), ...readdirSync(root).sort().reverse().map((d) => join(root, d, 'bin', exe))].find((p) => existsSync(p));
    if (hit) return hit;
  }
  throw new Error(`Could not find the ${name} client. Install it, put it on PATH, or pass --client <path to ${exe}>.`);
}

function run(cmd, args, env, input) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, input, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim().split('\n').slice(-3).join('\n'));
  return r.stdout;
}

function postgres(target, opts) {
  const u = new URL(target);
  const env = {
    PGHOST: decodeURIComponent(u.hostname || 'localhost'),
    PGPORT: u.port || '5432',
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
    PGCONNECT_TIMEOUT: '10',
  };
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  if (u.searchParams.get('sslmode')) env.PGSSLMODE = u.searchParams.get('sslmode');
  const out = run(findClient('psql', opts), ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', `schema=${opts.schema || ''}`, '-f', '-'], env, PG_SQL);
  const raw = JSON.parse(out.trim());
  return {
    version: 1,
    source: { kind: 'postgres', name: raw.database, server: `PostgreSQL ${raw.version}`, readAt: new Date().toISOString() },
    tables: raw.tables.map((t) => ({
      name: t.name,
      columns: (t.columns || []).map((c) => clean({ name: c.name, type: shortType(c.type), notNull: c.notNull || undefined, default: c.default || undefined, values: c.enum || undefined })),
      primaryKey: t.primaryKey || [],
      uniques: t.uniques || [],
      foreignKeys: (t.foreignKeys || []).map((f) => ({ name: f.name, columns: f.columns, table: f.table, refColumns: f.refColumns, onDelete: RULES[f.onDelete] || 'restrict' })),
      indexes: (t.indexes || []).map((i) => clean({ name: i.name, columns: i.columns, unique: i.unique || undefined, where: i.where || undefined })),
      checks: (t.checks || []).map((c) => ({ name: c.name, expr: c.expr.replace(/^CHECK \((.*)\)( NOT VALID)?$/s, '$1') })),
    })),
  };
}

/** Postgres spells some types out in full; use the short names people write in migrations. */
function shortType(t) {
  return t
    .replace(/timestamp(\(\d+\))? with time zone/g, 'timestamptz$1')
    .replace(/timestamp(\(\d+\))? without time zone/g, 'timestamp$1')
    .replace(/time(\(\d+\))? with time zone/g, 'timetz$1')
    .replace(/time(\(\d+\))? without time zone/g, 'time$1')
    .replace(/character varying/g, 'varchar')
    .replace(/^character/, 'char')
    .replace(/^bit varying/, 'varbit');
}

/* ---------------- MySQL / MariaDB ---------------- */
function mysql(target, opts) {
  const u = new URL(target);
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!db) throw new Error('The MySQL URL needs a database name: mysql://user@host:3306/<database>.');
  const args = ['--batch', '--raw', '--skip-column-names', '-h', decodeURIComponent(u.hostname || 'localhost'), '-P', u.port || '3306'];
  if (u.username) args.push('-u', decodeURIComponent(u.username));
  const env = u.password ? { MYSQL_PWD: decodeURIComponent(u.password) } : {};
  const client = findClient('mysql', opts);
  const q = (sql, optional) => {
    try {
      const out = run(client, [...args, db, '-e', sql], env).trim();
      return out && out !== 'NULL' ? JSON.parse(out) : [];
    } catch (err) {
      if (optional) return [];
      throw err;
    }
  };
  const S = 'TABLE_SCHEMA = DATABASE()';
  const names = q(`SELECT JSON_ARRAYAGG(TABLE_NAME) FROM information_schema.TABLES WHERE ${S} AND TABLE_TYPE = 'BASE TABLE'`);
  const cols = q(`SELECT JSON_ARRAYAGG(JSON_OBJECT('t', TABLE_NAME, 'n', COLUMN_NAME, 'type', COLUMN_TYPE, 'nullable', IS_NULLABLE, 'def', COLUMN_DEFAULT, 'pos', ORDINAL_POSITION, 'extra', EXTRA)) FROM information_schema.COLUMNS WHERE ${S}`);
  const keys = q(`SELECT JSON_ARRAYAGG(JSON_OBJECT('t', k.TABLE_NAME, 'c', k.CONSTRAINT_NAME, 'type', tc.CONSTRAINT_TYPE, 'col', k.COLUMN_NAME, 'pos', k.ORDINAL_POSITION, 'rt', k.REFERENCED_TABLE_NAME, 'rc', k.REFERENCED_COLUMN_NAME)) FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND tc.TABLE_NAME = k.TABLE_NAME AND tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME WHERE k.${S}`);
  const rules = q(`SELECT JSON_ARRAYAGG(JSON_OBJECT('t', TABLE_NAME, 'c', CONSTRAINT_NAME, 'del', DELETE_RULE)) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`);
  const statsSql = (expr) => `SELECT JSON_ARRAYAGG(JSON_OBJECT('t', TABLE_NAME, 'i', INDEX_NAME, 'nu', NON_UNIQUE, 'seq', SEQ_IN_INDEX, 'col', ${expr ? 'COALESCE(COLUMN_NAME, EXPRESSION)' : 'COLUMN_NAME'}, 'desc', COLLATION)) FROM information_schema.STATISTICS WHERE ${S}`;
  let stats;
  try {
    stats = q(statsSql(true)); // MySQL 8.0.13+: expression key parts
  } catch {
    stats = q(statsSql(false)); // MariaDB and older MySQL
  }
  const checks = q(`SELECT JSON_ARRAYAGG(JSON_OBJECT('t', tc.TABLE_NAME, 'c', cc.CONSTRAINT_NAME, 'expr', cc.CHECK_CLAUSE)) FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND tc.CONSTRAINT_TYPE = 'CHECK' WHERE cc.CONSTRAINT_SCHEMA = DATABASE()`, true);
  const version = q(`SELECT JSON_ARRAY(VERSION())`)[0];
  const byPos = (a, b) => a.pos - b.pos || a.seq - b.seq;
  const tables = names.map((name) => {
    const k = keys.filter((x) => x.t === name).sort(byPos);
    const constraintNames = new Set(k.map((x) => x.c));
    const group = (type) => [...new Set(k.filter((x) => x.type === type).map((x) => x.c))].map((c) => k.filter((x) => x.c === c));
    // MySQL creates an index for every foreign key, named after the constraint or its first column: not one you wrote.
    const fkCols = new Set(group('FOREIGN KEY').map((g) => g.map((x) => x.col).join(',')));
    const auto = (i) => {
      const cols = stats.filter((x) => x.t === name && x.i === i).sort((a, b) => a.seq - b.seq).map((x) => x.col);
      return fkCols.has(cols.join(',')) && (i === cols[0] || constraintNames.has(i));
    };
    const idx = stats.filter((x) => x.t === name && x.i !== 'PRIMARY' && !constraintNames.has(x.i) && !auto(x.i)).sort((a, b) => a.seq - b.seq);
    return {
      name,
      columns: cols.filter((c) => c.t === name).sort(byPos).map((c) => {
        const en = /^(enum|set)\((.*)\)$/i.exec(c.type);
        return clean({ name: c.n, type: c.type, notNull: c.nullable === 'NO' || undefined, default: c.def == null ? (/auto_increment/i.test(c.extra) ? 'identity' : undefined) : String(c.def), values: en && en[1].toLowerCase() === 'enum' ? splitQuoted(en[2]) : undefined });
      }),
      primaryKey: (group('PRIMARY KEY')[0] || []).map((x) => x.col),
      uniques: group('UNIQUE').map((g) => g.map((x) => x.col)),
      foreignKeys: group('FOREIGN KEY').map((g) => ({
        name: g[0].c,
        columns: g.map((x) => x.col),
        table: g[0].rt,
        refColumns: g.map((x) => x.rc),
        onDelete: MYSQL_RULES[(rules.find((r) => r.t === name && r.c === g[0].c) || {}).del] || 'restrict',
      })),
      indexes: [...new Set(idx.map((x) => x.i))].map((i) => {
        const parts = idx.filter((x) => x.i === i);
        return clean({ name: i, columns: parts.map((x) => `${String(x.col).replace(/`/g, '')}${x.desc === 'D' ? ' DESC' : ''}`), unique: parts[0].nu === 0 || parts[0].nu === '0' || undefined });
      }),
      checks: checks.filter((c) => c.t === name).map((c) => ({ name: c.c, expr: String(c.expr).split(String.fromCharCode(92, 39)).join("'") })),
    };
  });
  return { version: 1, source: { kind: 'mysql', name: db, server: `MySQL ${version}`, readAt: new Date().toISOString() }, tables };
}

/* ---------------- SQLite ---------------- */
async function sqlite(file, opts) {
  if (!existsSync(file)) throw new Error(`No SQLite file at ${file}.`);
  let all;
  try {
    // node:sqlite prints an "experimental" warning on first use; it is noise here.
    const emit = process.emitWarning;
    process.emitWarning = (w, ...rest) => (/SQLite/i.test(String(w && w.message ? w.message : w)) ? undefined : emit.call(process, w, ...rest));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    all = (sql) => db.prepare(sql).all();
  } catch {
    const cli = findClient('sqlite3', opts);
    all = (sql) => JSON.parse(run(cli, ['-readonly', '-json', file, sql], {}).trim() || '[]');
  }
  const q = (s) => `"${s.replace(/"/g, '""')}"`;
  const master = all(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`);
  const tables = master.filter((m) => m.type === 'table').map((m) => {
    const info = all(`PRAGMA table_info(${q(m.name)})`);
    const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    const fkRows = all(`PRAGMA foreign_key_list(${q(m.name)})`);
    const indexes = [];
    const uniques = [];
    for (const i of all(`PRAGMA index_list(${q(m.name)})`)) {
      const cols = all(`PRAGMA index_xinfo(${q(i.name)})`).filter((c) => c.key).sort((a, b) => a.seqno - b.seqno).map((c) => `${c.name ?? '<expr>'}${c.desc ? ' DESC' : ''}`);
      if (i.origin === 'pk') continue;
      if (i.origin === 'u') uniques.push(cols);
      else {
        const sql = (master.find((x) => x.type === 'index' && x.name === i.name) || {}).sql || '';
        const where = /\bWHERE\b([\s\S]*)$/i.exec(sql);
        indexes.push(clean({ name: i.name, columns: cols, unique: i.unique ? true : undefined, where: where ? where[1].trim() : undefined }));
      }
    }
    const fks = [...new Set(fkRows.map((f) => f.id))].map((id) => {
      const g = fkRows.filter((f) => f.id === id).sort((a, b) => a.seq - b.seq);
      return { name: `${m.name}_fk_${id}`, columns: g.map((f) => f.from), table: g[0].table, refColumns: g.map((f) => f.to), onDelete: MYSQL_RULES[String(g[0].on_delete).toUpperCase()] || 'restrict' };
    });
    return {
      name: m.name,
      columns: info.map((c) => clean({ name: c.name, type: c.type || 'any', notNull: c.notnull || c.pk > 0 || undefined, default: c.dflt_value == null ? undefined : String(c.dflt_value) })),
      primaryKey: pk,
      uniques,
      foreignKeys: fks,
      indexes,
      checks: sqliteChecks(m.sql || ''),
    };
  });
  // A foreign key without target columns points at the target's primary key.
  for (const t of tables) for (const f of t.foreignKeys) if (f.refColumns.some((c) => c == null)) f.refColumns = (tables.find((x) => x.name === f.table) || { primaryKey: ['id'] }).primaryKey;
  return { version: 1, source: { kind: 'sqlite', name: file.split(/[\\/]/).pop(), server: 'SQLite', readAt: new Date().toISOString() }, tables };
}

/** CHECK (...) clauses from CREATE TABLE text, with their CONSTRAINT names when given. */
function sqliteChecks(sql) {
  const out = [];
  const re = /(?:CONSTRAINT\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s+)?CHECK\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < sql.length && depth; i++) {
      if (sql[i] === "'") i = sql.indexOf("'", i + 1);
      else if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
    }
    out.push({ name: m[1] ? m[1].replace(/^["`[]|["`\]]$/g, '') : `check_${out.length + 1}`, expr: sql.slice(re.lastIndex, i - 1).trim() });
  }
  return out;
}

/* ---------------- shared ---------------- */
function splitQuoted(list) {
  const out = [];
  const re = /'((?:[^']|'')*)'/g;
  let m;
  while ((m = re.exec(list))) out.push(m[1].replace(/''/g, "'"));
  return out;
}

/** A CHECK that only limits one column to a list of literals becomes that column's `values`. */
export function valuesFromCheck(expr) {
  let s = expr.trim();
  while (/^\(.*\)$/s.test(s) && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
  const ident = String.raw`[\`"\[]?([A-Za-z_][\w$]*)[\`"\]]?`;
  const lit = String.raw`(?:_\w+)?'(?:[^']|'')*'(?:::[\w ]+)?`; // MySQL adds a charset prefix: _utf8mb4'a'
  let m = new RegExp(String.raw`^\(?${ident}\)?(?:::[\w ]+)?\s*=\s*ANY\s*\(\s*\(?ARRAY\[(.*)\]\)?(?:::[\w\[\] ]+)?\s*\)$`, 'is').exec(s);
  if (m) return { column: m[1], values: splitQuoted(m[2]) };
  m = new RegExp(String.raw`^${ident}\s+IN\s*\((\s*${lit}(?:\s*,\s*${lit})*\s*)\)$`, 'is').exec(s);
  if (m) return { column: m[1], values: splitQuoted(m[2]) };
  const parts = s.split(/\s+OR\s+/i);
  if (parts.length > 1) {
    let col = null;
    const values = [];
    for (const p of parts) {
      const x = new RegExp(String.raw`^\(?${ident}\s*=\s*(${lit})\)?$`, 's').exec(p.trim());
      if (!x || (col && x[1] !== col)) return null;
      col = x[1];
      values.push(...splitQuoted(x[2]));
    }
    return { column: col, values };
  }
  return null;
}

function balanced(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === '(') d++;
    else if (ch === ')' && --d < 0) return false;
  }
  return d === 0;
}

function attachValueLists(t) {
  for (const c of t.checks || []) {
    const v = valuesFromCheck(c.expr);
    const col = v && t.columns.find((x) => x.name === v.column);
    if (!col || v.values.length < 2) continue;
    c.column = col.name;
    if (!col.values) col.values = v.values;
  }
}

function clean(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
