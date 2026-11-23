// Checks a guide three ways: the guide text against the facts, every page rendered in Node,
// and (with --browser) the real page in Chrome/Edge at desktop and phone width.
import vm from 'node:vm';

export async function checkGuide({ facts, guide, html, builtHtml, browser }) {
  const errors = [];
  const warnings = [];
  validate(facts, guide, errors, warnings);
  if (builtHtml !== html) warnings.push('the built HTML is older than facts.json / guide.json: run "build".');
  let pages = 0;
  let maps = 0;
  if (!errors.length) {
    const r = renderAll(html, facts, guide);
    pages = r.pages;
    maps = r.maps;
    errors.push(...r.errors);
  }
  let probe = '';
  if (browser && !errors.length) {
    const { probeInBrowser } = await import('./probe.mjs');
    const r = await probeInBrowser(html);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    probe = r.summary ? ` ${r.summary}` : '';
  }
  const summary = errors.length
    ? `Check failed: ${errors.length} error(s), ${warnings.length} warning(s).`
    : `Check passed: ${pages} pages rendered, ${maps} maps without overlaps.${probe}${warnings.length ? ` ${warnings.length} warning(s).` : ''}`;
  return { errors, warnings, summary };
}

/* ---------------- the guide against the facts ---------------- */
export function validate(facts, guide, errors, warnings) {
  const tables = new Map(facts.tables.map((t) => [t.name, t]));
  const hasTable = (n) => tables.has(n);
  const hasColumn = (key) => {
    const i = key.lastIndexOf('.');
    const t = tables.get(key.slice(0, i));
    return !!t && t.columns.some((c) => c.name === key.slice(i + 1));
  };
  const indexNames = new Set(facts.tables.flatMap((t) => (t.indexes || []).map((i) => i.name)));
  const checkNames = new Set(facts.tables.flatMap((t) => (t.checks || []).map((c) => c.name)));
  const need = (ok, what) => ok || errors.push(what);

  const kind = (facts.source || {}).kind;
  if (kind === 'inferred') {
    warnings.push('this schema is inferred from application code and does not exist: the page is labelled as a proposal throughout.');
    if (!(facts.source || {}).inferredFrom) warnings.push('set source.inferredFrom to name what the schema was inferred from (it is shown on the page).');
  }

  // Tables are keyed by name everywhere, so a repeat would silently shadow the first one.
  const seenTable = new Set();
  for (const t of facts.tables) {
    need(!seenTable.has(t.name), `two tables are both called "${t.name}"; names must be unique across databases too`);
    seenTable.add(t.name);
  }

  let links = 0;
  let soft = 0;
  for (const t of facts.tables) {
    for (const f of t.foreignKeys || []) {
      links++;
      need(hasTable(f.table), `${t.name}.${f.columns.join(', ')} links to a table that isn't in the facts: ${f.table}`);
      for (const c of f.columns) need(hasColumn(`${t.name}.${c}`), `${t.name} has a link on a column that doesn't exist: ${c}`);
      if (f.enforced === false) {
        soft++;
        if (f.onDelete) warnings.push(`${t.name}.${f.columns.join(', ')} is not enforced, so onDelete "${f.onDelete}" can't happen; remove it.`);
      }
    }
  }
  const sameDb = (a, b) => (tables.get(a) || {}).database === (tables.get(b) || {}).database;
  for (const t of facts.tables) {
    for (const f of t.foreignKeys || []) {
      if (f.enforced !== false && hasTable(f.table) && !sameDb(t.name, f.table)) {
        errors.push(`${t.name}.${f.columns.join(', ')} is a foreign key to ${f.table} in another database, which no database can enforce: add "enforced": false`);
      }
    }
  }
  if (!links && facts.tables.length > 1) {
    warnings.push(
      (facts.source || {}).kind === 'files'
        ? `no links between ${facts.tables.length} tables: the map, delete impact and join path will all be empty. If the code treats columns as references the database doesn't enforce, record them with "enforced": false.`
        : `no foreign keys in ${facts.tables.length} tables: the map, delete impact and join path will all be empty.`,
    );
  } else if (soft && soft === links) {
    warnings.push(`all ${links} links are unenforced; check that the database really declares no foreign keys.`);
  }

  const seenArea = new Set();
  const areaOf = new Map();
  for (const a of guide.areas || []) {
    const id = a.id || a.name;
    need(!seenArea.has(id), `two areas share the id "${id}"`);
    seenArea.add(id);
    for (const n of a.tables || []) {
      need(hasTable(n), `area "${a.name}" lists a table that doesn't exist: ${n}`);
      need(!areaOf.has(n), `${n} is in two areas: "${areaOf.get(n)}" and "${a.name}"`);
      areaOf.set(n, a.name);
    }
    if ((a.tables || []).length > 14) warnings.push(`area "${a.name}" has ${a.tables.length} tables; consider splitting it.`);
  }
  if ((guide.areas || []).length) {
    const loose = facts.tables.map((t) => t.name).filter((n) => !areaOf.has(n));
    if (loose.length) warnings.push(`${loose.length} table(s) have no area and go to "Other tables": ${loose.join(', ')}`);
  }

  const gt = guide.tables || {};
  for (const [n, t] of Object.entries(gt)) {
    if (!need(hasTable(n), `guide.tables names a table that doesn't exist: ${n}`)) continue;
    for (const c of Object.keys(t.columns || {})) need(hasColumn(`${n}.${c}`), `guide.tables.${n}.columns names a column that doesn't exist: ${c}`);
  }
  if (Object.keys(gt).length) {
    const bare = facts.tables.map((t) => t.name).filter((n) => !(gt[n] && gt[n].purpose));
    if (bare.length) warnings.push(`${bare.length} table(s) have no purpose yet: ${bare.join(', ')}`);
  }

  const hl = guide.highlight || {};
  for (const n of hl.tables || []) need(hasTable(n), `highlight.tables names a table that doesn't exist: ${n}`);
  for (const c of hl.columns || []) need(hasColumn(c), `highlight.columns names a column that doesn't exist: ${c}`);
  for (const i of hl.indexes || []) need(indexNames.has(i), `highlight.indexes names an index that doesn't exist: ${i}`);
  for (const i of Object.keys(guide.indexes || {})) need(indexNames.has(i), `guide.indexes names an index that doesn't exist: ${i}`);
  for (const c of Object.keys(guide.checks || {})) need(checkNames.has(c), `guide.checks names a check that doesn't exist: ${c}`);
  if (guide.hub) need(hasTable(guide.hub), `guide.hub names a table that doesn't exist: ${guide.hub}`);
  for (const n of guide.joinExample || []) need(hasTable(n), `guide.joinExample names a table that doesn't exist: ${n}`);

  for (const [key, v] of Object.entries(guide.values || {})) {
    if (!need(hasColumn(key), `guide.values names a column that doesn't exist: ${key}`)) continue;
    const i = key.lastIndexOf('.');
    const col = tables.get(key.slice(0, i)).columns.find((c) => c.name === key.slice(i + 1));
    if (col.values && v.values) {
      const a = [...col.values].sort().join('|');
      const b = [...v.values].sort().join('|');
      need(a === b, `guide.values.${key} lists [${v.values.join(', ')}] but the database allows [${col.values.join(', ')}]`);
    }
  }

  (guide.tour || []).forEach((s, i) => {
    for (const n of s.tables || []) need(hasTable(n), `tour step ${i + 1} names a table that doesn't exist: ${n}`);
  });
  const refHas = { links, indexes: indexNames.size, checks: checkNames.size };
  for (const r of guide.reference || []) {
    // The page drops a built-in with nothing to show, so say so rather than losing it quietly.
    if (r.builtin && !(r.sections || []).length && !refHas[r.builtin]) {
      warnings.push(`reference built-in "${r.builtin}" has nothing to show and won't appear on the page.`);
    }
    for (const s of r.sections || []) {
      for (const it of s.items || []) {
        for (const n of it.tables || []) need(hasTable(n), `reference "${r.title || r.builtin}" item "${it.title}" names a table that doesn't exist: ${n}`);
        if (it.on) need(hasTable(it.on), `reference "${r.title || r.builtin}" item "${it.title}" is on a table that doesn't exist: ${it.on}`);
      }
    }
  }

  // [[table]] links anywhere in the guide text
  const text = JSON.stringify(guide);
  for (const m of text.matchAll(/\[\[([^\]\s]+)\]\]/g)) if (!hasTable(m[1])) warnings.push(`a [[${m[1]}]] link points to a table that doesn't exist.`);
}

/* ---------------- every page, rendered in Node ---------------- */
function stubElement() {
  return {
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

export function loadEngine(html, data) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const engine = scripts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const app = stubElement();
  const document = {
    getElementById: (id) => (id === 'app' ? app : stubElement()),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: { dataset: {} },
    title: '',
  };
  const sandbox = {
    SCHEMA_GUIDE_DATA: data,
    document,
    window: { addEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false }) },
    location: { hash: '' },
    history: { replaceState() {} },
    navigator: {},
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  const names = 'viewHome viewTour viewExplore viewArea viewTable viewRef viewDiagram viewTools TOUR DOMAINS TABLES REF EDGES TABS DEFAULT_JOIN';
  return vm.runInContext(`${engine}\n;({${names.split(' ').join(',')}, setHash: (h) => { location.hash = h; }})`, sandbox, { timeout: 60000 });
}

function renderAll(html, facts, guide) {
  const errors = [];
  let g;
  try {
    g = loadEngine(html, { facts, guide });
  } catch (err) {
    return { errors: [`the page script fails to start: ${err.message}`], pages: 0, maps: 0 };
  }
  const out = [];
  const add = (label, fn) => {
    try {
      out.push([label, fn()]);
    } catch (err) {
      errors.push(`${label}: ${err.message}`);
    }
  };
  add('#home', () => g.viewHome());
  add('#explore', () => g.viewExplore());
  add('#ref', () => g.viewRef());
  g.TOUR.forEach((_, i) => add(`#tour/${i + 1}`, () => g.viewTour(String(i + 1))));
  g.DOMAINS.forEach((d) => add(`#explore/${d.id}`, () => g.viewArea(d.id)));
  g.TABLES.forEach((t) => g.TABS.forEach(([k]) => add(`#table/${t.name}/${k}`, () => g.viewTable(t.name, k))));
  g.REF.forEach(([id]) => add(`#ref/${id}`, () => g.viewRef(id)));
  const maps = [];
  for (const v of ['', 'all', 'layers', 'ownership', 'hubs', 'values']) add(`#diagram${v ? `/${v}` : ''}`, () => g.viewDiagram(v || undefined));
  g.DOMAINS.forEach((d) => add(`#diagram/${d.id}`, () => g.viewDiagram(d.id)));
  g.TABLES.forEach((t) => add(`#diagram/table/${t.name}`, () => g.viewDiagram('table', t.name)));
  add('#tools', () => (g.setHash('#tools'), g.viewTools()));
  g.TABLES.forEach((t) => add(`#tools/impact/${t.name}`, () => (g.setHash(`#tools/impact/${t.name}`), g.viewTools())));
  const names = g.TABLES.map((t) => t.name);
  const pairs = [g.DEFAULT_JOIN];
  for (let i = 0; i < names.length && pairs.length < 60; i += 3) pairs.push([names[i], names[(i * 7 + 5) % names.length]]);
  pairs.forEach(([a, b]) => add(`#tools/join/${a}/${b}`, () => (g.setHash(`#tools/join/${a}/${b}`), g.viewTools())));

  for (const [label, h] of out) {
    if (typeof h !== 'string') errors.push(`${label}: rendered nothing`);
    else if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(h.replace(/<pre[\s\S]*?<\/pre>/g, ''))) errors.push(`${label}: shows "undefined", "NaN" or "[object Object]"`);
    if (/^#diagram(\/|$)/.test(label) && typeof h === 'string' && /<svg class="map/.test(h)) {
      maps.push(label);
      const boxes = [...h.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
      let hits = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]];
          if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) hits++;
        }
      }
      if (hits) errors.push(`${label}: ${hits} pair(s) of table boxes overlap`);
    }
  }
  return { errors, pages: out.length, maps: maps.length };
}
