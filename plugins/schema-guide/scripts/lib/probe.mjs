// check --browser: open the page in headless Chrome/Edge at 1300 px and 520 px and test what only a
// browser can show: text overflow, sideways scroll, the header and menu marks, and the canvas.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const files = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
  }[process.platform] || [];
  const hit = files.find((f) => existsSync(f));
  if (hit) return hit;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return name;
  }
  return null;
}

// Runs inside the page. Engine globals (TABLES, DOMAINS, REF, …) are visible to later scripts.
const PROBE = String.raw`
<script>
window.addEventListener('load', () => {
  const st = document.createElement('style');
  st.textContent = '*{transition:none!important;animation:none!important}';
  document.head.appendChild(st);
  const t0 = TABLES[0].name, a0 = DOMAINS[0].id;
  // The Examples tab exists only on tables whose guide has examples; check the one with the most.
  const tx = TABLES.filter((t) => t.examples).sort((a, b) => JSON.stringify(b.examples).length - JSON.stringify(a.examples).length).map((t) => t.name)[0];
  const routes = [
    ['#home', 'Home'], ['#tour/1', 'Tour'], ['#explore', 'Explore'], ['#explore/' + a0, 'Explore'],
    ['#table/' + t0 + '/about', 'Explore', 'About'], ['#table/' + t0 + '/columns', 'Explore'], ['#table/' + t0 + '/links', 'Explore'], ['#table/' + t0 + '/indexes', 'Explore'],
    ...(tx ? [['#table/' + tx + '/examples', 'Explore', 'Examples']] : []),
    ['#ref', 'Reference'], ...REF.map(([id]) => ['#ref/' + id, 'Reference']),
    ['#tools', 'Tools', null, ''], ['#tools/impact/' + DEFAULT_IMPACT, 'Tools', null, 'Delete impact'], ['#tools/join/' + DEFAULT_JOIN.join('/'), 'Tools', null, 'Join path'],
    ['#diagram', 'Tools', 'Areas', 'Map'], ['#diagram/all', 'Tools', 'Every table', 'Map'], ['#diagram/' + a0, 'Tools', 'Areas', 'Map'],
    ['#diagram/table/' + (HUB || t0), 'Tools', 'Areas', 'Map'], ['#diagram/layers', 'Tools', 'Layers', 'Map'], ['#diagram/ownership', 'Tools', 'Ownership', 'Map'],
    ['#diagram/hubs', 'Tools', 'Most connected', 'Map'], ['#diagram/values', 'Tools', 'Values', 'Map'],
  ];
  const out = { errors: [], pages: 0, canvas: '' };
  const say = (r, m) => out.errors.push(innerWidth + 'px ' + r + ': ' + m);
  const text = (el) => (el ? el.textContent.trim() : '');
  const step = (i) => {
    if (i >= routes.length) return canvas();
    const [r, section, tab, tool] = routes[i];
    location.hash = r;
    setTimeout(() => {
      out.pages++;
      const head = document.querySelector('header.bar');
      if (!head || head.getBoundingClientRect().height < 40) say(r, 'the header is collapsed');
      const on = text(document.querySelector('nav.main [aria-current]'));
      if (on !== section) say(r, 'header marks "' + on + '" instead of "' + section + '"');
      const sub = document.getElementById('subbar');
      if (section === 'Tools') {
        if (!sub || sub.hidden) say(r, 'the Tools row is missing');
        else if (tool !== undefined && text(sub.querySelector('a:not(.subbar-up)[aria-current]')) !== tool) say(r, 'the Tools row marks the wrong tool');
      } else if (sub && !sub.hidden) say(r, 'the Tools row shows outside Tools');
      if (tab && !text(document.querySelector('#app .tabs [aria-current]')).startsWith(tab)) say(r, 'the tab "' + tab + '" is not marked');
      if (document.documentElement.scrollWidth > innerWidth + 1) say(r, 'the page scrolls sideways (' + document.documentElement.scrollWidth + 'px)');
      document.querySelectorAll('header *, #app *').forEach((el) => {
        if (el.children.length || el.closest('svg, .layers, pre, .tabs, .subbar-in, .matrix-wrap')) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) say(r, 'text overflows: "' + el.textContent.trim().slice(0, 40) + '"');
      });
      step(i + 1);
    }, 120);
  };
  const canvas = () => {
    location.hash = '#diagram/all';
    setTimeout(() => {
      const svg = document.querySelector('svg.map.is-canvas');
      const vp = svg && svg.querySelector('.viewport');
      const rect = svg && svg.querySelector('.node rect');
      if (!vp || !rect) return finish('no canvas on #diagram/all');
      const p = (el, type, x, y, extra) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, ...extra }));
      const b = rect.getBoundingClientRect();
      p(rect, 'pointerdown', b.left + 4, b.top + 4);
      p(rect, 'pointerup', b.left + 4, b.top + 4);
      const lit = svg.querySelectorAll('.node.on').length;
      if (!svg.classList.contains('selecting') || lit < 1) return finish('clicking a table does not focus it');
      if (!svg.querySelector('.edge.on') && svg.querySelectorAll('.edge').length) out.canvas += ' (focused table has no links)';
      setTimeout(() => {
        const before = vp.style.transform || vp.getAttribute('transform') || '';
        const s = svg.getBoundingClientRect();
        const x = s.left + 30, y = s.bottom - 30;
        p(svg, 'pointerdown', x, y);
        p(svg, 'pointermove', x + 90, y - 40, { buttons: 1 });
        p(svg, 'pointerup', x + 90, y - 40);
        const moved = (vp.style.transform || vp.getAttribute('transform') || '') !== before;
        const z0 = text(document.querySelector('.zoom-level'));
        svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: s.left + s.width / 2, clientY: s.top + s.height / 2, deltaY: -400 }));
        const z1 = text(document.querySelector('.zoom-level'));
        if (!moved) return finish('dragging does not move the canvas');
        if (z0 === z1) return finish('the wheel does not zoom');
        finish('', 'canvas: focus, drag and zoom work' + out.canvas);
      }, 450);
    }, 400);
  };
  const finish = (err, ok) => {
    if (err) say('#diagram/all', err);
    out.canvas = ok || '';
    const pre = document.createElement('pre');
    pre.id = 'probe-out';
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  };
  step(0);
});
</script>`;

export async function probeInBrowser(html) {
  const browser = findBrowser();
  if (!browser) return { errors: [], warnings: ['no Chrome, Edge or Chromium found: skipped the browser check (set CHROME_PATH to point at one).'], summary: '' };
  const dir = mkdtempSync(join(tmpdir(), 'schema-guide-'));
  const file = join(dir, 'probe.html');
  writeFileSync(file, html.replace(/<\/body>\s*<\/html>\s*$/i, `${PROBE}\n</body>\n</html>\n`));
  const errors = [];
  const notes = [];
  try {
    for (const width of [1300, 520]) {
      const r = spawnSync(
        browser,
        ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(dir, 'profile')}`, `--window-size=${width},900`, '--virtual-time-budget=30000', '--dump-dom', pathToFileURL(file).href],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
      );
      const m = /<pre id="probe-out">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
      if (!m) {
        errors.push(`browser check at ${width}px did not finish${r.error ? `: ${r.error.message}` : ''}`);
        continue;
      }
      const out = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      errors.push(...out.errors);
      notes.push(`${out.pages} pages at ${width}px`);
      if (out.canvas && width === 1300) notes.push(out.canvas);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors, warnings: [], summary: notes.length ? `Browser: ${notes.join(', ')}.` : '' };
}
