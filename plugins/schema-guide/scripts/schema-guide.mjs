#!/usr/bin/env node
// schema-guide CLI. Zero dependencies, Node >= 18.
//   read  <database-url | file.db> [--schema s] [--keep-meta] [--client path]   schema -> facts.json (+ change list)
//   read  --diff                                                                 change list: facts.prev.json -> facts.json
//   build [--out path]                                                           facts + guide + template -> one HTML file
//   check [--browser]                                                            validate, render every page, check the maps
// Shared options: --dir .schema-guide  --facts <file>  --guide <file>  --out docs/schema-guide.html
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '../template/guide.html');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const dir = opt('dir', '.schema-guide');
const paths = {
  facts: resolve(opt('facts', `${dir}/facts.json`)),
  prev: resolve(`${dir}/facts.prev.json`),
  guide: resolve(opt('guide', `${dir}/guide.json`)),
  out: resolve(opt('out', 'docs/schema-guide.html')),
};
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
};
const fail = (msg) => {
  console.error(`schema-guide: ${msg}`);
  process.exit(1);
};

try {
  if (cmd === 'read') await read();
  else if (cmd === 'build') await build();
  else if (cmd === 'check') await check();
  else {
    console.log('Usage: schema-guide.mjs read <database-url|file.db> | read --diff | build [--out path] | check [--browser]');
    process.exit(!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help' ? 0 : 1);
  }
} catch (err) {
  fail(err.message);
}

/* ---------------- read ---------------- */
async function read() {
  if (flag('diff')) {
    if (!existsSync(paths.prev)) fail(`no earlier facts to compare with (${paths.prev}).`);
    return printChanges(diffFacts(readJson(paths.prev), readJson(paths.facts)));
  }
  const target = argv[1] && !argv[1].startsWith('--') ? argv[1] : process.env.DATABASE_URL;
  if (!target) fail('give a database URL or a .db file, or set DATABASE_URL.');
  const { introspect, redact, kindOf } = await import('./lib/introspect.mjs');
  if (!kindOf(target)) fail(`don't know how to read "${redact(target)}". Use postgres://…, mysql://… or a .db/.sqlite file.`);
  console.log(`Reading ${redact(target)} …`);
  const facts = await introspect(target, { schema: opt('schema'), keepMeta: flag('keep-meta'), client: opt('client') });
  if (!facts.tables.length) fail('no tables found (wrong database or schema?).');
  const fkCount = facts.tables.reduce((n, t) => n + t.foreignKeys.length, 0);
  if (existsSync(paths.facts)) {
    const before = readJson(paths.facts);
    copyFileSync(paths.facts, paths.prev);
    writeJson(paths.facts, facts);
    console.log(`Read ${facts.tables.length} tables and ${fkCount} links into ${paths.facts}.`);
    printChanges(diffFacts(before, facts));
  } else {
    writeJson(paths.facts, facts);
    console.log(`Read ${facts.tables.length} tables and ${fkCount} links into ${paths.facts}.`);
  }
}

/** What changed between two facts files, as plain lines grouped by table. */
function diffFacts(a, b) {
  const lines = [];
  const A = new Map(a.tables.map((t) => [t.name, t]));
  const B = new Map(b.tables.map((t) => [t.name, t]));
  for (const [n, t] of B) if (!A.has(n)) lines.push(`+ table ${n} (${t.columns.length} columns)`);
  for (const n of A.keys()) if (!B.has(n)) lines.push(`- table ${n}`);
  const keyed = (list, key) => new Map((list || []).map((x) => [key(x), x]));
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const [n, tb] of B) {
    const ta = A.get(n);
    if (!ta) continue;
    const parts = [
      ['column', ta.columns, tb.columns, (c) => c.name, (c) => `${c.type}${c.notNull ? ' not null' : ''}${c.values ? ` [${c.values.join(', ')}]` : ''}`],
      ['link', ta.foreignKeys, tb.foreignKeys, (f) => `${f.columns.join(', ')} → ${f.table}`, (f) => f.onDelete],
      ['index', ta.indexes, tb.indexes, (i) => i.name, (i) => `${i.unique ? 'unique ' : ''}(${i.columns.join(', ')})${i.where ? ` where ${i.where}` : ''}`],
      ['check', ta.checks, tb.checks, (c) => c.name, (c) => c.expr],
    ];
    for (const [what, la, lb, key, show] of parts) {
      const ma = keyed(la, key);
      const mb = keyed(lb, key);
      for (const [k, x] of mb) if (!ma.has(k)) lines.push(`+ ${what} ${n}.${k}: ${show(x)}`);
      for (const [k, x] of ma) if (!mb.has(k)) lines.push(`- ${what} ${n}.${k}`);
      for (const [k, x] of mb) if (ma.has(k) && !same(show(ma.get(k)), show(x))) lines.push(`~ ${what} ${n}.${k}: ${show(ma.get(k))} → ${show(x)}`);
    }
    if (!same(ta.primaryKey, tb.primaryKey)) lines.push(`~ primary key ${n}: (${ta.primaryKey.join(', ')}) → (${tb.primaryKey.join(', ')})`);
  }
  return lines;
}

function printChanges(lines) {
  if (!lines.length) return console.log('Changes since the last read: none.');
  console.log(`Changes since the last read (${lines.length}):`);
  for (const l of lines) console.log(`  ${l}`);
}

/* ---------------- build ---------------- */
function loadInputs() {
  if (!existsSync(paths.facts)) fail(`no facts at ${paths.facts}. Run "read" first.`);
  const facts = readJson(paths.facts);
  const guide = existsSync(paths.guide) ? readJson(paths.guide) : {};
  const name = (guide.project && guide.project.name) || titleCase((facts.source && facts.source.name) || 'This project');
  guide.project = { ...(guide.project || {}), name };
  return { facts, guide };
}
function titleCase(s) {
  return String(s).replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function render(facts, guide) {
  const title = escHtml(`${guide.project.name} schema guide`);
  const LS = String.fromCharCode(8232);
  const PS = String.fromCharCode(8233);
  const data = JSON.stringify({ facts, guide }).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
  return readFileSync(TEMPLATE, 'utf8').replace(/\{\{TITLE\}\}/g, () => title).replace('{{DATA}}', () => data);
}

async function build() {
  const { facts, guide } = loadInputs();
  const { validate } = await import('./lib/check.mjs');
  const errors = [];
  validate(facts, guide, errors, []);
  for (const e of errors) console.log(`error: ${e}`);
  if (errors.length) fail(`${errors.length} error(s) in facts.json / guide.json. Nothing was written; fix them and build again.`);
  const html = render(facts, guide);
  mkdirSync(dirname(paths.out), { recursive: true });
  writeFileSync(paths.out, html);
  const links = facts.tables.reduce((n, t) => n + t.foreignKeys.length, 0);
  // realpathSync: on Windows and macOS "docs/" can resolve to an existing "Docs/".
  const where = realpathSync(paths.out);
  console.log(`Built ${where} (${Math.round(html.length / 1024)} KB): ${facts.tables.length} tables, ${links} links${existsSync(paths.guide) ? '' : ', no guide text yet'}.`);
}

/* ---------------- check ---------------- */
async function check() {
  const { facts, guide } = loadInputs();
  const { checkGuide } = await import('./lib/check.mjs');
  const html = existsSync(paths.out) ? readFileSync(paths.out, 'utf8') : render(facts, guide);
  const report = await checkGuide({ facts, guide, html: render(facts, guide), builtHtml: html, browser: flag('browser') });
  for (const w of report.warnings) console.log(`warning: ${w}`);
  for (const e of report.errors) console.log(`error: ${e}`);
  console.log(report.summary);
  if (report.errors.length) process.exit(1);
}
