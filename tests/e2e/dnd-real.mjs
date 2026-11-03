// Real-pointer DnD matrix. NOT part of `npm test`.
// Usage: BROWSER=chromium|firefox|webkit BASE_URL=http://localhost:4173/ [OUT=/dir] [CHROME=/path/to/chrome] node tests/e2e/dnd-real.mjs
// Requires playwright-core (npm i --no-save playwright-core) and a Chromium binary.
import { chromium, firefox, webkit } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? '/tmp/mailcraft-dnd';
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BROWSER = process.env.BROWSER ?? 'chromium';
const b = BROWSER === 'chromium' ? await chromium.launch({ executablePath: exe }) : await { firefox, webkit }[BROWSER].launch();
const KEY = 'mailcraft-demo-design';
const results = [];

async function fresh(opts = {}) {
  const ctx = await b.newContext({ locale: 'en-US', viewport: opts.viewport ?? { width: 1400, height: 850 } });
  const p = await ctx.newPage();
  await p.addInitScript(({ empty, KEY, sim }) => {
    if (empty) localStorage.setItem(KEY, JSON.stringify({ body: { backgroundColor: '#f2f4f7', contentBackgroundColor: '#fff', contentWidth: 600, fontFamily: 'Arial', textColor: '#222', linkColor: '#00f', preheader: '' }, rows: [] }));
    if (sim) Object.defineProperty(DragEvent.prototype, 'relatedTarget', { get: () => null }); // WebKit never sets relatedTarget on drag events
    window.__ev = [];
    for (const t of ['dragstart', 'dragenter', 'drop', 'dragend']) document.addEventListener(t, (e) => window.__ev.push(`${t}:${e.target.className || e.target.tagName}|${e.dataTransfer?.dropEffect}/${e.dataTransfer?.effectAllowed}`), true);
    let last = '';
    document.addEventListener('dragover', (e) => { const s = `dragover:${(e.target.className || e.target.tagName)}|${e.defaultPrevented}`; if (s !== last) { window.__ev.push(s); last = s; } }, false);
  }, { empty: !!opts.empty, KEY, sim: !!process.env.SAFARI_SIM });
  await p.goto(BASE);
  return { p, ctx };
}
const design = (p) => p.evaluate(() => ({ rows: document.querySelectorAll('.mc-row').length, blocks: document.querySelectorAll('.mc-block').length, order: [...document.querySelectorAll('.mc-row')].map((r) => r.dataset.id + '[' + [...r.querySelectorAll('.mc-col')].map((c) => [...c.querySelectorAll('.mc-block')].map((x) => x.dataset.id).join('+')).join('|') + ']').join() }));
const count = (d) => d;

/** Real mouse drag from the centre of `from` locator to (x,y); returns {ev, before, after, indicatorSeen}. */
async function drag(p, from, to, { hold = false } = {}) {
  const before = count(await design(p));
  await p.evaluate(() => (window.__ev = []));
  const box = await from.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 8, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 25 });
  await p.mouse.move(to.x + 1, to.y + 1, { steps: 3 });
  const indicator = await p.locator('.mc-indicator').count();
  if (!hold) await p.mouse.up();
  await p.waitForTimeout(150);
  const after = count(await design(p));
  const ev = await p.evaluate(() => window.__ev);
  const left = await p.locator('.mc-indicator').count();
  return { before, after, indicator, leftover: left, ev };
}
const tile = (p, t) => p.locator(`[data-block-type="${t}"]`);
const rowTile = async (p, l) => { await p.click('[data-tab="rows"]'); return p.locator(`[data-row-layout="${l}"]`); };
const bx = async (loc) => { await loc.scrollIntoViewIfNeeded(); return loc.boundingBox(); };
const toBottom = (p) => p.evaluate(() => { const w = document.querySelector('.mc-canvas-wrap'); w.scrollTop = w.scrollHeight; });
const pt = (b, fx = 0.5, fy = 0.5) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });

async function run(name, setup, act, expectChange) {
  const { p, ctx } = await fresh(setup.opts);
  let r;
  try { r = await act(p); } catch (e) { r = { error: String(e).split('\n')[0] }; }
  const delta = r.after && r.before ? { rows: r.after.rows - r.before.rows, blocks: r.after.blocks - r.before.blocks, reordered: r.after.order !== r.before.order } : null;
  const ok = r.error ? false : expectChange ? (delta.rows !== 0 || delta.blocks !== 0 || delta.reordered) : (delta.rows === 0 && delta.blocks === 0 && !delta.reordered);
  const line = { name, ok, delta, indicatorWhileOver: r.indicator, indicatorLeft: r.leftover, error: r.error };
  if (!ok || process.env.VERBOSE) { line.ev = r.ev; await p.screenshot({ path: `${OUT}/${name.replace(/\W+/g, '_')}.png` }); }
  results.push(line);
  console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(delta), 'ind=' + r.indicator, 'left=' + r.leftover, r.error ?? '');
  if (!ok) console.log('   ev:', JSON.stringify(line.ev));
  await ctx.close();
}

const S = {}; // sample design
const E = { opts: { empty: true } };
const TALL = { opts: { viewport: { width: 1400, height: 1900 } } };

for (const kind of ['block', 'row']) {
  const src = (p) => kind === 'block' ? tile(p, 'button') : rowTile(p, '1:1');
  const wantChange = true;
  await run(`${kind}: empty canvas (placeholder)`, E, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-empty-canvas')))), wantChange);
  await run(`${kind}: empty canvas (page gray margin)`, E, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-canvas-wrap')), 0.1, 0.5)), wantChange);
  await run(`${kind}: sample, top of first block`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-block').first()), 0.5, 0.1)), wantChange);
  await run(`${kind}: sample, middle of a text block`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(1)), 0.5, 0.5)), wantChange);
  await run(`${kind}: sample, bottom of last block`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-block').last()), 0.5, 0.9)), wantChange);
  await run(`${kind}: image block (placeholder)`, S, async (p) => { await tile(p, 'image').click(); await p.click('.mc-canvas-wrap', { position: { x: 3, y: 3 } }); return drag(p, await src(p), pt(await bx(p.locator('.mc-block:has(.mc-img-ph)').first()))); }, wantChange);
  await run(`${kind}: sample, left gray margin`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-canvas-wrap')), 0.04, 0.4)), wantChange);
  await run(`${kind}: sample, right gray margin`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-canvas-wrap')), 0.97, 0.4)), wantChange);
  await run(`${kind}: sample, top margin above email`, S, async (p) => drag(p, await src(p), { x: (await bx(p.locator('.mc-canvas'))).x + 50, y: (await bx(p.locator('.mc-canvas-wrap'))).y + 8 }), wantChange);
  await run(`${kind}: sample, below last row (page padding)`, S, async (p) => { await toBottom(p); const c = await p.locator('.mc-canvas').boundingBox(); return drag(p, await src(p), { x: c.x + c.width / 2, y: c.y + c.height + 12 }); }, wantChange);
  await run(`${kind}: sample, below page (workspace bottom)`, S, async (p) => { const w = await bx(p.locator('.mc-canvas-wrap')); return drag(p, await src(p), { x: w.x + w.width / 2, y: w.y + w.height - 6 }); }, wantChange);
  await run(`${kind}: sample, row-gap`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-row').nth(2)), 0.5, 0.02)), wantChange);
  await run(`${kind}: sample, 2nd/3rd drops`, S, async (p) => { await drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(1)), .5, .8)); await drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(2)), .5, .8)); const c = await bx(p.locator('.mc-block').nth(1)); return drag(p, await src(p), pt(c, .5, .2)); }, wantChange);
  await run(`${kind}: sample, after selecting a block`, S, async (p) => { await p.locator('.mc-block').nth(2).click(); return drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(4)), .5, .5)); }, wantChange);
  await run(`${kind}: sample, over selected block's own chrome`, S, async (p) => { await p.locator('.mc-block').nth(2).click(); return drag(p, await src(p), pt(await bx(p.locator('.mc-block.selected > .mc-chrome')))); }, wantChange);
  await run(`${kind}: sample, over selected text (contenteditable)`, S, async (p) => { await p.locator('.mc-block:has([data-editable])').first().click(); return drag(p, await src(p), pt(await bx(p.locator('[contenteditable=true]')))); }, wantChange);
  await run(`${kind}: sample, text focused, then drag`, S, async (p) => { await p.locator('.mc-block:has([data-editable])').first().click(); await p.locator('[contenteditable=true]').click(); await p.keyboard.type('x'); return drag(p, await src(p), pt(await bx(p.locator('.mc-block').last()), .5, .9)); }, wantChange);
  await run(`${kind}: sample, after click-to-add`, S, async (p) => { await (await src(p)).click(); return drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(1)), .5, .8)); }, wantChange);
  await run(`${kind}: sample, mobile mode`, S, async (p) => { await p.click('button[title="Mobile"]'); return drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(2)), .5, .7)); }, wantChange);
  await run(`${kind}: sample, mobile mode gray margin`, S, async (p) => { await p.click('button[title="Mobile"]'); return drag(p, await src(p), pt(await bx(p.locator('.mc-canvas-wrap')), 0.05, 0.5)); }, wantChange);
  await run(`${kind}: sample, hold on indicator (pointer over indicator)`, S, async (p) => { const r = await drag(p, await src(p), pt(await bx(p.locator('.mc-block').nth(1)), .5, .8), { hold: true }); const ib = await bx(p.locator('.mc-indicator')); await p.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(150); return { ...r, after: count(await design(p)), ev: await p.evaluate(() => window.__ev) }; }, wantChange);
  // must reject
  await run(`${kind}: onto right panel (reject)`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-panel')))), false);
  await run(`${kind}: onto toolbar (reject)`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-toolbar')))), false);
  await run(`${kind}: onto sidebar (reject)`, S, async (p) => drag(p, await src(p), pt(await bx(p.locator('.mc-sidebar')), .5, .9)), false);
}
// existing handles
await run('move-block handle -> other column', TALL, async (p) => { await p.locator('.mc-block').nth(2).click(); return drag(p, p.locator('.mc-block.selected .mc-handle'), pt(await bx(p.locator('.mc-block').last()), .5, .5)); }, true);
await run('move-block handle -> gray margin', S, async (p) => { await p.locator('.mc-block').nth(2).click(); return drag(p, p.locator('.mc-block.selected .mc-handle'), pt(await bx(p.locator('.mc-canvas-wrap')), .04, .4)); }, true);
await run('move-row handle -> below last row', TALL, async (p) => { await p.locator('.mc-row').first().click({ position: { x: 2, y: 2 } }); await toBottom(p); const c = await p.locator('.mc-canvas').boundingBox(); return drag(p, p.locator('.mc-row.selected > .mc-chrome .mc-handle'), { x: c.x + c.width / 2, y: c.y + c.height + 12 }); }, true);
await run('move-row handle -> gray margin', S, async (p) => { await p.locator('.mc-row').first().click({ position: { x: 2, y: 2 } }); return drag(p, p.locator('.mc-row.selected > .mc-chrome .mc-handle'), pt(await bx(p.locator('.mc-canvas-wrap')), .04, .9)); }, true);

// extra situations
await run('block: empty column placeholder of a fresh 2-col row', TALL, async (p) => { await (await rowTile(p, '1:1')).click(); await p.click('[data-tab="content"]'); return drag(p, tile(p, 'button'), pt(await bx(p.locator('.mc-empty-col').nth(1)))); }, true);
await run('block: row padding (between columns, outside any column)', TALL, async (p) => { await (await rowTile(p, '1:1')).click(); await p.click('[data-tab="content"]'); const r = await bx(p.locator('.mc-row-inner').last()); return drag(p, tile(p, 'button'), { x: r.x + 3, y: r.y + r.height / 2 }); }, true);
await run('move-block handle onto itself (no-op, must not break)', TALL, async (p) => { await p.locator('.mc-block').nth(2).click(); const b = await bx(p.locator('.mc-block.selected')); const r = await drag(p, p.locator('.mc-block.selected .mc-handle'), pt(b)); return { ...r, after: { ...r.after, order: r.before.order } }; }, false);
await run('narrow viewport 700px: block tile -> canvas', { opts: { viewport: { width: 700, height: 1600 } } }, async (p) => drag(p, tile(p, 'button'), pt(await bx(p.locator('.mc-block').nth(2)), .5, .7)), true);
await run('tablet 1000px: block tile -> gray margin', { opts: { viewport: { width: 1000, height: 900 } } }, async (p) => drag(p, tile(p, 'button'), pt(await bx(p.locator('.mc-canvas-wrap')), .03, .5)), true);
await run('dark theme: block tile -> canvas', S, async (p) => { await p.evaluate(() => document.querySelector('#theme-dark')?.click()); return drag(p, tile(p, 'divider'), pt(await bx(p.locator('.mc-block').nth(2)))); }, true);
// OS file drop (synthetic: Playwright cannot start a native drag from the desktop)
await run('image FILE dropped from the OS onto the canvas', S, async (p) => {
  const before = await design(p);
  const b = await bx(p.locator('.mc-block').nth(2));
  await p.evaluate(({ x, y }) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from([137,80,78,71])], 'a.png', { type: 'image/png' }));
    const t = document.elementFromPoint(x, y);
    const ev = (type) => t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    ev('dragenter'); const o = ev('dragover'); window.__fileOver = !o; ev('drop');
  }, { x: b.x + b.width / 2, y: b.y + b.height * .7 });
  await p.waitForTimeout(400);
  return { before, after: await design(p), indicator: 0, leftover: await p.locator('.mc-indicator').count(), ev: [] };
}, true);

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
await b.close();
process.exit(bad.length ? 1 : 0);
