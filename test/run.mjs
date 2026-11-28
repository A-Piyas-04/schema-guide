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
  ok(g.TABLES.every((t) => t.examples), 'every table has an Examples tab');
  const ex = text(g.viewTable('orders', 'examples'));
  ok(/18 columns in 5 groups/.test(ex) && /What rows look like/.test(ex) && /What happens when/.test(ex), 'orders/Examples: groups, sample rows and stories');
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

/* ---------- 6. A schema inferred from code, where the project has no database ---------- */
console.log('Inferred schema (no database in the project)');
{
  const dir = fresh('inferred');
  mkdirSync(join(dir, '.schema-guide'));
  const facts = JSON.parse(JSON.stringify(SPLIT));
  facts.source = { kind: 'inferred', name: 'notes', dialect: 'sqlite', inferredFrom: 'the TypeScript types in `src/types/`' };
  for (const t of facts.tables) delete t.database;
  writeFileSync(join(dir, '.schema-guide/facts.json'), JSON.stringify(facts));
  writeFileSync(join(dir, '.schema-guide/guide.json'), JSON.stringify({ project: { name: 'Notes' } }));

  const b = cli(dir, 'build');
  ok(b.code === 0, 'builds');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0 && /inferred from application code and does not exist/.test(c.out), 'check passes and warns that the schema does not exist');

  const html = readFileSync(join(dir, 'docs/schema-guide.html'), 'utf8');
  ok(/<title>Notes proposed schema \(no database\)<\/title>/.test(html), 'the page title says there is no database');

  const g = engineOf(dir);
  const home = g.viewHome();
  ok(/class="noschema"/.test(home) && /Notes has no database\./.test(home), 'Home carries the large "no database" notice');
  ok(/A proposed database for Notes/.test(home), 'and the headline calls it a proposal');
  ok(/None of it exists yet\./.test(home) && /src\/types\//.test(home), 'and says nothing exists yet, naming what it was inferred from');

  // Readers arrive by deep link, so every other page has to say it too.
  ok(/class="strip"/.test(html) && /Proposed schema\./.test(html), 'the per-page strip is in the page');

  // The title is the one place a proposal could still pass for documentation: a tab, a
  // bookmark, a cropped screenshot. The engine rewrites it on every route, so the marker
  // has to survive that, not just the first paint.
  ok(/const BRAND = \(FACTS\.source \|\| \{\}\)\.kind === 'inferred'/.test(html), 'the runtime title keeps the "no database" marker');

  // Hand-written facts leave optional arrays out; that used to crash build after writing the page.
  const bare2 = fresh('inferred-sparse');
  mkdirSync(join(bare2, '.schema-guide'));
  writeFileSync(join(bare2, '.schema-guide/facts.json'), JSON.stringify({
    version: 1,
    source: { kind: 'inferred', name: 'sparse', dialect: 'sqlite', inferredFrom: 'the types in `src/`' },
    tables: [{ name: 'notes', columns: [{ name: 'id', type: 'text', notNull: true }] }],
  }));
  const sparse = cli(bare2, 'build');
  ok(sparse.code === 0, 'build accepts a table with no primaryKey, foreignKeys, indexes or checks');

  const empty = fresh('no-columns');
  mkdirSync(join(empty, '.schema-guide'));
  writeFileSync(join(empty, '.schema-guide/facts.json'), JSON.stringify({ version: 1, source: { kind: 'files' }, tables: [{ name: 'notes' }] }));
  const ec = cli(empty, 'build');
  ok(ec.code === 1 && /no columns/.test(ec.out) && !existsSync(join(empty, 'docs/schema-guide.html')), 'but a table with no columns is refused before anything is written');

  // Without inferredFrom, check says so rather than rendering a vague notice.
  const bare = fresh('inferred-bare');
  mkdirSync(join(bare, '.schema-guide'));
  const noFrom = JSON.parse(JSON.stringify(facts));
  delete noFrom.source.inferredFrom;
  writeFileSync(join(bare, '.schema-guide/facts.json'), JSON.stringify(noFrom));
  ok(/set source.inferredFrom/.test(cli(bare, 'check').out), 'check asks for source.inferredFrom when it is missing');
}

/* ---------- 7. The Examples tab ---------- */
console.log('Examples tab');
{
  const col = (name, type, notNull, values) => ({ name, type, ...(notNull ? { notNull: true } : {}), ...(values ? { values } : {}) });
  const MEDIA = {
    version: 1,
    source: { kind: 'postgres', name: 'media' },
    tables: [
      { name: 'users', columns: [col('id', 'bigint', true), col('email', 'text', true)], primaryKey: ['id'], uniques: [['email']], foreignKeys: [], indexes: [], checks: [] },
      {
        name: 'media_assets',
        columns: [
          col('id', 'bigint', true),
          col('owner_id', 'bigint'),
          col('kind', 'text', true, ['image', 'video']),
          col('status', 'text', true, ['uploading', 'processing', 'ready', 'failed']),
          col('mime_type', 'text', true),
          col('duration_ms', 'integer'),
          col('meta', 'jsonb'),
          col('error', 'text'),
        ],
        primaryKey: ['id'],
        uniques: [],
        foreignKeys: [{ name: 'media_assets_owner_id_fkey', columns: ['owner_id'], table: 'users', refColumns: ['id'], onDelete: 'setnull' }],
        indexes: [],
        checks: [],
      },
    ],
  };
  const reel = { id: 501, owner_id: 101, kind: 'video', status: 'ready', mime_type: 'video/mp4', duration_ms: 60000, meta: { width: 1080, height: 1920 }, error: null };
  const EXAMPLES = {
    intro: 'Every upload is a row here.',
    groups: [
      // A one-word meaning makes [["101","Rahim"]] in the JSON, which must not read as a [[table]] link.
      { name: 'Which file', columns: { id: 'The internal number.', owner_id: { means: 'Who uploaded it.', examples: [['101', 'Rahim']] } } },
      {
        name: 'What it is',
        text: '`kind` is what the file is.',
        columns: {
          kind: { means: 'What the file is.', examples: { image: 'A photo or diagram', video: 'A Reel or lecture' } },
          mime_type: { means: 'The file format, as browsers name it (a *MIME type*).', examples: { 'video/mp4': 'an MP4 video', 'image/png': 'a PNG image' } },
          duration_ms: { means: 'Length in milliseconds.', examples: ['59750'] },
          meta: 'Width and height.',
        },
        table: { head: ['File', 'kind'], rows: [['A Reel', 'video']], prose: [0] },
      },
      {
        name: 'Processing',
        columns: { status: 'Where processing is.', error: 'Why it failed.' },
        scenarios: [{ title: 'A video is too long', text: 'Two minutes; the limit is 90 seconds.', values: { status: 'failed', error: 'Video exceeds the maximum allowed duration.' } }],
      },
    ],
    records: [
      { name: 'A Reel', text: 'Ready to play.', values: reel },
      { name: 'A failed upload', values: { ...reel, id: 502, status: 'failed', meta: null, error: 'Too long.' } },
    ],
    scenarios: [{ title: 'An upload is abandoned', text: ['The app closes.'], steps: ['uploading', 'deleted'], values: { status: 'uploading' } }],
  };
  const setup = (name, guide) => {
    const dir = fresh(name);
    mkdirSync(join(dir, '.schema-guide'));
    writeFileSync(join(dir, '.schema-guide/facts.json'), JSON.stringify(MEDIA));
    writeFileSync(join(dir, '.schema-guide/guide.json'), JSON.stringify(guide));
    return dir;
  };
  const withExamples = (ex) => ({ project: { name: 'Media' }, tables: { media_assets: { purpose: 'One row per upload.', examples: ex }, users: { purpose: 'One row per person.' } } });

  const dir = setup('examples', withExamples(EXAMPLES));
  ok(cli(dir, 'build').code === 0, 'builds');
  const c = cli(dir, 'check', ...(BROWSER ? ['--browser'] : []));
  ok(c.code === 0 && !/warning:/.test(c.out), `check passes with no warnings: ${c.out.trim().split('\n').pop()}`);
  const g = engineOf(dir);
  const tab = g.viewTable('media_assets', 'examples');
  const text = tab.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/<a href="#table\/media_assets\/examples" aria-current="page">Examples<\/a>/.test(tab), 'the Examples tab is there, after Columns, and marked');
  ok(g.TABS.map(([k]) => k).join(' ') === 'about columns examples links indexes', 'tab order: About, Columns, Examples, Links, Indexes');
  ok(/8 columns in 3 groups/.test(text) && /Which file/.test(text) && /What it is/.test(text) && /Processing/.test(text), 'the overview names the groups');
  ok(/MIME type/.test(text) && /video\/mp4 an MP4 video/.test(text), 'a column shows what it means and its example values with meanings');
  ok(/Possible values/.test(text) && ['uploading', 'processing', 'ready', 'failed'].every((v) => tab.includes(`<span class="val">${v}</span>`)), 'a column with a value list shows every allowed value, even ones the guide never mentions');
  ok(/A photo or diagram/.test(text) && /A Reel or lecture/.test(text), 'and the meaning of each one');
  ok((tab.match(/data-rec="/g) || []).length === 2 && (tab.match(/data-rec-panel="1" hidden/g) || []).length === 1, 'two example rows, one shown at a time');
  ok(/None of them were read from the database/.test(text), 'the rows are labelled as made up');
  ok(/class="ex-null">NULL/.test(tab) && /\{&quot;width&quot;:1080,&quot;height&quot;:1920\}/.test(tab), 'NULL and JSON values render as such');
  ok(/A video is too long/.test(text) && /Video exceeds the maximum allowed duration\./.test(text) && /An upload is abandoned/.test(text), 'group and table stories render with the values they leave');
  ok(/Not sure what a column holds\?/.test(g.viewTable('media_assets', 'columns')), 'the Columns tab points to Examples');
  ok(!/#table\/users\/examples/.test(g.viewTable('users', 'about')), 'a table without examples has no Examples tab');
  ok(/aria-current="page">About</.test(g.viewTable('users', 'examples')), 'and #table/users/examples falls back to About');

  // Guides written before the tab existed: nothing changes, and check doesn't ask for examples.
  const old = setup('examples-none', { project: { name: 'Media' }, tables: { media_assets: { purpose: 'One row per upload.' } } });
  ok(cli(old, 'build').code === 0, 'a guide with no examples still builds');
  const oc = cli(old, 'check');
  ok(oc.code === 0 && !/examples/.test(oc.out), 'and check does not mention examples');
  ok(!/\/examples"/.test(engineOf(old).viewTable('media_assets', 'about')), 'and no table shows the tab');

  // Examples have to match the schema, like every other name in the guide.
  const bad = JSON.parse(JSON.stringify(EXAMPLES));
  bad.groups[0].columns.nope = 'A column that is not there.';
  bad.groups[1].columns.kind.examples.audio = 'Not in the list';
  bad.groups[2].columns.id = 'Again.';
  bad.records[0].values = { ...reel, status: 'done', mime_type: null };
  bad.scenarios[0].values = { colour: 'red' };
  const bd = setup('examples-bad', withExamples(bad));
  const bc = cli(bd, 'check');
  ok(bc.code === 1, 'check fails on examples that contradict the schema');
  ok(/names a column that doesn't exist: nope/.test(bc.out), 'an unknown column in a group');
  ok(/gives kind the example "audio", but kind only allows \[image, video\]/.test(bc.out), 'an example value outside the list');
  ok(/id is in two groups/.test(bc.out), 'a column in two groups');
  ok(/sets status to "done", but status only allows/.test(bc.out), 'a record value outside the list');
  ok(/sets mime_type to null, but mime_type is NOT NULL/.test(bc.out), 'NULL in a NOT NULL column');
  ok(/story "An upload is abandoned" names a column that doesn't exist: colour/.test(bc.out), 'an unknown column in a story');
  ok(cli(bd, 'build').code === 1, 'and build refuses it');
  const shape = setup('examples-shape', withExamples({ groups: { id: 'not a list' }, records: EXAMPLES.records }));
  const sc = cli(shape, 'check');
  ok(sc.code === 1 && /examples\.groups must be a list/.test(sc.out) && !/is not a function/.test(sc.out), 'a group object instead of a list is named, not a crash');

  // Gaps are warnings: they render, but check says what is missing.
  const thin = JSON.parse(JSON.stringify(EXAMPLES));
  delete thin.groups[2];
  thin.groups = thin.groups.filter(Boolean);
  thin.records[1].values = { id: 502, status: 'failed' };
  thin.intro = 'Each row belongs to [[no_such_table]].';
  const facts2 = JSON.parse(JSON.stringify(MEDIA));
  facts2.tables.push({ name: 'albums', columns: ['id', 'owner_id', 'title', 'cover_id', 'created_at'].map((n) => col(n, 'text', n === 'id')), primaryKey: ['id'], uniques: [], foreignKeys: [], indexes: [], checks: [] });
  const td = setup('examples-thin', withExamples(thin));
  writeFileSync(join(td, '.schema-guide/facts.json'), JSON.stringify(facts2));
  const tc = cli(td, 'check');
  ok(tc.code === 0, 'incomplete examples still pass');
  ok(/2 column\(s\) are in no group and show under "Other columns": status, error/.test(tc.out), 'warns about columns in no group');
  ok(/record "A failed upload" leaves out 6 column\(s\)/.test(tc.out), 'warns about a record that leaves columns out');
  ok(/1 table\(s\) with 5 or more columns have no examples yet, so they have no Examples tab: albums/.test(tc.out), 'warns about a table with 5+ columns and no examples');
  ok(/a \[\[no_such_table\]\] link points to a table that doesn't exist/.test(tc.out) && !/\[\["/.test(tc.out), 'a broken [[table]] link in example text is still caught; JSON brackets are not');
  cli(td, 'build');
  ok(/Other columns/.test(engineOf(td).viewTable('media_assets', 'examples')), 'ungrouped columns show under "Other columns"');
}

/* ---------- 8. 300 tables ---------- */
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

/* ---------- 9. Real servers, when given ---------- */
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
