// End-to-end tests: node test/run.mjs [--browser]
// Optional real servers: TEST_PG_URL=postgres://… TEST_MYSQL_URL=mysql://… (each gets the fixture schema in a scratch database you name).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'plugins/schema-guide/scripts/schema-guide.mjs');
const TMP = join(ROOT, 'test/.tmp');
const BROWSER = process.argv.includes('--browser');
const { loadEngine } = await import(pathToFileURL(join(ROOT, 'plugins/schema-guide/scripts/lib/check.mjs')).href);

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${what}`);
  if (!cond) failed++;
  return cond;
};
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 600000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const fresh = (name) => {
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};
const engineOf = (dir) => {
  const html = readFileSync(join(dir, 'docs/schema-guide.html'), 'utf8');
  const facts = JSON.parse(readFileSync(join(dir, '.schema-guide/facts.json'), 'utf8'));
  const guidePath = join(dir, '.schema-guide/guide.json');
  const guide = existsSync(guidePath) ? JSON.parse(readFileSync(guidePath, 'utf8')) : {};
  guide.project = { name: 'Test', ...(guide.project || {}) };
  return loadEngine(html, { facts, guide });
};

/* ---------- 1. The demo example ---------- */
console.log('Demo example (21 tables, PostgreSQL)');
{
  const dir = fresh('demo');
  mkdirSync(join(dir, '.schema-guide'));
  for (const f of ['facts.json', 'guide.json']) cpSync(join(ROOT, 'examples/demo', f), join(dir, '.schema-guide', f));
  const b = cli(dir, 'build');
  ok(b.code === 0 && /21 tables, 45 links/.test(b.out), 'builds: 21 tables, 45 links');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0 && /Check passed/.test(c.out) && !/warning:/.test(c.out), `check passes with no warnings: ${c.out.trim().split('\n').pop()}`);
  const g = engineOf(dir);
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/8 levels/.test(text(g.viewDiagram('layers'))), 'Layers: 8 levels');
  ok(/5 owners at the top/.test(text(g.viewDiagram('ownership'))), 'Ownership: 5 owners at the top');
  ok(/15 owned tables/.test(text(g.viewDiagram('ownership'))), 'Ownership: 15 owned tables');
  ok(/events 8 in, 3 out/.test(text(g.viewDiagram('hubs'))), 'Most connected: events first, 8 in');
  ok(g.DOMAINS.length === 7 && g.DOMAINS[0].id === 'tenants', '7 areas, Organizations & people first');
  g.setHash('#tools/join/attendees/order_lines');
  ok(/AND [a-z0-9]+\.line_no = /.test(g.viewTools()), 'the composite link to order_lines joins on both columns');
  g.setHash('#tools/impact/events');
  const impact = text(g.viewTools());
  ok(/6 tables lose rows/.test(impact) && /links can block it/.test(impact), `deleting an event: ${impact.match(/\d+ tables? lose rows/)[0]}`);
}

/* ---------- 2. SQLite fixture ---------- */
const FIXTURE = `
CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK (status IN ('active', 'suspended')), deleted_at TEXT);
CREATE TABLE coupons (code TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind = 'percent' OR kind = 'fixed'));
CREATE TABLE "order" (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  coupon_code TEXT REFERENCES coupons(code) ON DELETE SET NULL, total_cents INTEGER NOT NULL CHECK (total_cents >= 0));
CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE order_lines (order_id INTEGER NOT NULL REFERENCES "order"(id) ON DELETE CASCADE, line_no INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id), qty INTEGER NOT NULL, PRIMARY KEY (order_id, line_no));
CREATE TABLE refunds (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, line_no INTEGER NOT NULL,
  FOREIGN KEY (order_id, line_no) REFERENCES order_lines(order_id, line_no) ON DELETE CASCADE);
CREATE TABLE categories (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE, name TEXT NOT NULL);
CREATE TABLE teams (id INTEGER PRIMARY KEY, captain_id INTEGER REFERENCES players(id) ON DELETE SET NULL);
CREATE TABLE players (id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE);
CREATE TABLE loop_a (id INTEGER PRIMARY KEY, b_id INTEGER REFERENCES loop_b(id) ON DELETE CASCADE);
CREATE TABLE loop_b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES loop_a(id) ON DELETE CASCADE);
CREATE INDEX order_account_idx ON "order"(account_id, id DESC);
CREATE UNIQUE INDEX accounts_email_lower ON accounts(lower(email));
CREATE INDEX live_accounts ON accounts(id) WHERE deleted_at IS NULL;
CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
`;
console.log('SQLite fixture');
let sqliteOk = true;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = fresh('sqlite');
  const file = join(dir, 'app.db');
  const db = new DatabaseSync(file);
  db.exec(FIXTURE);
  db.close();
  const r = cli(dir, 'read', 'app.db');
  ok(r.code === 0 && /Read 11 tables and 10 links/.test(r.out), `read: 11 tables, 10 links (migrations table skipped) — ${r.out.trim().split('\n').pop()}`);
  const facts = JSON.parse(readFileSync(join(dir, '.schema-guide/facts.json'), 'utf8'));
  const t = (n) => facts.tables.find((x) => x.name === n);
  ok(JSON.stringify(t('accounts').columns.find((c) => c.name === 'status').values) === '["active","suspended"]', 'value list from CHECK … IN');
  ok(JSON.stringify(t('coupons').columns.find((c) => c.name === 'kind').values) === '["percent","fixed"]', 'value list from CHECK … OR …');
  ok(t('refunds').foreignKeys[0].columns.length === 2, 'composite link read');
  ok(t('accounts').indexes.some((i) => i.where) && t('accounts').indexes.some((i) => i.unique), 'partial and unique expression indexes read');
  ok(cli(dir, 'build').code === 0, 'facts-only build');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0, `check passes: ${c.out.trim().split('\n').pop()}`);
  const g = engineOf(dir);
  const sql = (a, b) => {
    g.setHash(`#tools/join/${a}/${b}`);
    return g.viewTools().replace(/&quot;/g, '"');
  };
  const j = sql('refunds', 'accounts');
  ok(/"order" AS/.test(j), 'reserved table name is quoted in SQL');
  ok(/ON ol\.order_id = r\.order_id AND ol\.line_no = r\.line_no/.test(j) || / AND [a-z0-9]+\.line_no = /.test(j), 'composite link joins on both columns');
  const layers = g.viewDiagram('layers');
  ok(/data-layer="teams"[^>]*>teams<small class="loop">/.test(layers) && /data-layer="players"[^>]*>players<small class="loop">/.test(layers), 'Layers marks the teams ⇄ players loop');
  const own = g.viewDiagram('ownership');
  ok(['loop_a', 'loop_b', 'refunds', 'order_lines'].every((n) => own.includes(`>${n}<`)) && /in a cascade loop/.test(own), 'Ownership shows every owned table, cascade loop included');

  // change detection
  const db2 = new DatabaseSync(file);
  db2.exec(`CREATE TABLE wishlists (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE);
            ALTER TABLE products ADD COLUMN price_cents INTEGER;
            DROP INDEX live_accounts;`);
  db2.close();
  const r2 = cli(dir, 'read', 'app.db');
  ok(/\+ table wishlists/.test(r2.out) && /\+ column products\.price_cents/.test(r2.out) && /- index accounts\.live_accounts/.test(r2.out), 'change list: new table, new column, dropped index');
  ok(/Changes since the last read \(3\)/.test(r2.out), 'change list has exactly those 3 lines');
  ok(/Changes since the last read \(3\)/.test(cli(dir, 'read', '--diff').out), 'read --diff repeats it');
} catch (err) {
  sqliteOk = false;
  ok(false, `SQLite fixture: ${err.message}`);
}

/* ---------- 3. A guide with mistakes is refused ---------- */
console.log('Guide validation');
{
  const dir = fresh('invalid');
  mkdirSync(join(dir, '.schema-guide'));
  cpSync(join(ROOT, 'examples/demo/facts.json'), join(dir, '.schema-guide/facts.json'));
  writeFileSync(join(dir, '.schema-guide/guide.json'), JSON.stringify({
    areas: [{ id: 'a', name: 'A', tables: ['users', 'no_such_table'] }, { id: 'b', name: 'B', tables: ['users'] }],
    tables: { users: { purpose: 'x', columns: { nope: 'y' } } },
    values: { 'orders.status': { values: ['draft', 'live'] } },
  }));
  const c = cli(dir, 'check');
  ok(c.code === 1, 'check fails');
  ok(/no_such_table/.test(c.out) && /in two areas/.test(c.out) && /column that doesn't exist: nope/.test(c.out) && /database allows/.test(c.out), 'and names each mistake');
}

/* ---------- 4. Links the database doesn't enforce ---------- */
const SPLIT = {
  version: 1,
  source: { kind: 'postgres', name: 'split' },
  tables: [
    {
      name: 'customers',
      database: 'core_db',
      columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'email', type: 'text', notNull: true }],
      primaryKey: ['id'],
      uniques: [['email']],
      foreignKeys: [],
      indexes: [],
      checks: [],
    },
    {
      name: 'invoice_lines',
      database: 'billing_db',
      columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'invoice_id', type: 'bigint', notNull: true }, { name: 'amount_cents', type: 'integer', notNull: true }],
      primaryKey: ['id'],
      uniques: [],
      // A real foreign key: both tables live in billing_db.
      foreignKeys: [{ name: 'invoice_lines_invoice_id_fkey', columns: ['invoice_id'], table: 'invoices', refColumns: ['id'], onDelete: 'cascade' }],
      indexes: [],
      checks: [],
    },
    {
      name: 'invoices',
      database: 'billing_db',
      columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'subscription_id', type: 'bigint', notNull: true }, { name: 'total_cents', type: 'integer', notNull: true }],
      primaryKey: ['id'],
      uniques: [],
      // Crosses a database boundary, so no database can enforce it.
      foreignKeys: [{ columns: ['subscription_id'], table: 'subscriptions', refColumns: ['id'], enforced: false }],
      indexes: [],
      checks: [],
    },
    {
      name: 'subscriptions',
      database: 'core_db',
      columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'customer_id', type: 'bigint', notNull: true }, { name: 'plan', type: 'text', notNull: true }],
      primaryKey: ['id'],
      uniques: [],
      foreignKeys: [{ name: 'subscriptions_customer_id_fkey', columns: ['customer_id'], table: 'customers', refColumns: ['id'], onDelete: 'cascade' }],
      indexes: [],
      checks: [],
    },
    {
      name: 'usage_events',
      database: 'billing_db',
      columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'invoice_id', type: 'bigint' }, { name: 'units', type: 'integer', notNull: true }],
      primaryKey: ['id'],
      uniques: [],
      // Same database, but the column was never declared as a foreign key.
      foreignKeys: [{ columns: ['invoice_id'], table: 'invoices', refColumns: ['id'], enforced: false }],
      indexes: [],
      checks: [],
    },
  ],
};
console.log('Links the database does not enforce');
{
  const dir = fresh('unenforced');
  mkdirSync(join(dir, '.schema-guide'));
  writeFileSync(join(dir, '.schema-guide/facts.json'), JSON.stringify(SPLIT));
  const b = cli(dir, 'build');
  ok(b.code === 0 && /5 tables, 4 links/.test(b.out), 'builds: 5 tables, 4 links across two databases');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0, `check passes: ${c.out.trim().split('\n').pop()}`);
  const g = engineOf(dir);
  g.setHash('#tools/impact/subscriptions');
  const impact = g.viewTools();
  ok(/Left pointing at nothing/.test(impact), 'delete impact on subscriptions: "Left pointing at nothing"');
  ok(!/The delete always succeeds/.test(impact), 'and it does not claim the delete always succeeds');
  g.setHash('#tools/join/customers/invoices');
  ok(/Crosses databases/.test(g.viewTools()), 'join path customers → invoices: "Crosses databases"');
  ok(/e-dangle/.test(g.viewDiagram('all')), 'the map draws the unenforced links dashed (e-dangle)');

  // The same link written as a real foreign key is an error, because nothing can enforce it.
  const bad = fresh('unenforced-bad');
  mkdirSync(join(bad, '.schema-guide'));
  const badFacts = JSON.parse(JSON.stringify(SPLIT));
  badFacts.tables.find((t) => t.name === 'invoices').foreignKeys = [
    { name: 'invoices_subscription_id_fkey', columns: ['subscription_id'], table: 'subscriptions', refColumns: ['id'], onDelete: 'cascade' },
  ];
  writeFileSync(join(bad, '.schema-guide/facts.json'), JSON.stringify(badFacts));
  const cb = cli(bad, 'check');
  ok(cb.code === 1, 'a foreign key across databases fails check');
  ok(/in another database/.test(cb.out) && /"enforced": false/.test(cb.out), 'and says to use "enforced": false');
}

/* ---------- 5. Input the CLI refuses ---------- */
console.log('Bad input');
{
  const dir = fresh('bad-guide');
  mkdirSync(join(dir, '.schema-guide'));
  writeFileSync(join(dir, '.schema-guide/facts.json'), JSON.stringify(SPLIT));
  writeFileSync(join(dir, '.schema-guide/guide.json'), JSON.stringify({ areas: [{ id: 'a', name: 'A', tables: ['customers', 'no_such_table'] }] }));
  const b = cli(dir, 'build');
  ok(b.code === 1 && /no_such_table/.test(b.out), 'build refuses a guide naming a table that does not exist');
  ok(!existsSync(join(dir, 'docs/schema-guide.html')), 'and writes nothing');

  ok(cli(dir, '--help').code === 0, '--help exits 0');

  const dup = fresh('duplicate-names');
  mkdirSync(join(dup, '.schema-guide'));
  const dupFacts = JSON.parse(JSON.stringify(SPLIT));
  dupFacts.tables.push({ ...dupFacts.tables[0], database: 'billing_db' });
  writeFileSync(join(dup, '.schema-guide/facts.json'), JSON.stringify(dupFacts));
  const cd = cli(dup, 'check');
  ok(cd.code === 1 && /both called "customers"/.test(cd.out) && /unique/.test(cd.out), 'two tables with the same name fail check');
}

/* ---------- 6. 300 tables ---------- */
console.log('300-table schema');
{
  const dir = fresh('big');
  const tables = [];
  for (let i = 0; i < 300; i++) {
    const name = `g${String(i % 12).padStart(2, '0')}_t${String(i).padStart(3, '0')}`;
    const fks = [];
    if (i > 0) fks.push({ name: `${name}_p`, columns: ['parent_id'], table: tables[Math.floor((i * 7919) % i)].name, refColumns: ['id'], onDelete: ['cascade', 'setnull', 'restrict'][i % 3] });
    if (i > 10) fks.push({ name: `${name}_q`, columns: ['other_id'], table: tables[(i * 31) % 10].name, refColumns: ['id'], onDelete: 'setnull' });
    tables.push({ name, columns: [{ name: 'id', type: 'bigint', notNull: true }, { name: 'parent_id', type: 'bigint' }, { name: 'other_id', type: 'bigint' }], primaryKey: ['id'], uniques: [], foreignKeys: fks, indexes: [], checks: [] });
  }
  mkdirSync(join(dir, '.schema-guide'));
  writeFileSync(join(dir, '.schema-guide/facts.json'), JSON.stringify({ version: 1, source: { kind: 'postgres', name: 'big' }, tables }));
  const t0 = Date.now();
  ok(cli(dir, 'build').code === 0, 'builds');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0, `check passes in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${c.out.trim().split('\n').pop()}`);
}

/* ---------- 7. Real servers, when given ---------- */
for (const [label, url] of [['PostgreSQL', process.env.TEST_PG_URL], ['MySQL', process.env.TEST_MYSQL_URL]]) {
  if (!url) {
    console.log(`${label}: skipped (set TEST_${label === 'MySQL' ? 'MYSQL' : 'PG'}_URL to a scratch database with the fixture schema)`);
    continue;
  }
  console.log(label);
  const dir = fresh(label.toLowerCase());
  const extra = process.env[`TEST_${label === 'MySQL' ? 'MYSQL' : 'PG'}_CLIENT`];
  const r = cli(dir, 'read', url, ...(extra ? ['--client', extra] : []));
  ok(r.code === 0 && /Read 11 tables and 10 links/.test(r.out), `read: ${r.out.trim().split('\n').pop()}`);
  ok(cli(dir, 'build').code === 0 && cli(dir, 'check').code === 0, 'build + check');
}

if (!sqliteOk) console.log('(SQLite needs Node 22.5+)');
console.log(failed ? `\n${failed} test(s) failed.` : '\nAll tests passed.');
process.exit(failed ? 1 : 0);
