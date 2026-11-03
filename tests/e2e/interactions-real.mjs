// Real-browser interaction checks (focus/keyboard, number fields, links, row selection, toolbar placement, upload validation,
// preview button, DnD no-op, a11y, paste). NOT part of `npm test`.
// Usage: OUT=/dir [BASE_URL=http://localhost:4183/] [CHROME=/path] node tests/e2e/interactions-real.mjs
//   (needs playwright-core and `npm run build && npx vite preview --outDir dist-demo --port 4183`)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:4183/';
const OUT = process.env.OUT ?? '/tmp/mailcraft-interactions';
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const b = await chromium.launch({ executablePath: exe });
const KEY = 'mailcraft-demo-design';
let fails = 0;
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info === '' ? '' : JSON.stringify(info)); if (!ok) fails++; };

async function fresh(q = '', vp = { width: 1400, height: 1000 }, locale = 'en-US') {
  const ctx = await b.newContext({ locale, viewport: vp });
  const p = await ctx.newPage(); p.setDefaultTimeout(5000);
  await p.addInitScript(() => { try { if (!sessionStorage.getItem('__kept')) localStorage.removeItem('mailcraft-demo-design'); sessionStorage.setItem('__kept', '1'); } catch {} });
  await p.goto(BASE + q);
  await p.waitForSelector('.mc-root');
  return { p, ctx };
}
const inRoot = (p) => p.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.mc-root'));
const active = (p) => p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${a.className}` : 'none'; });
const counts = (p) => p.evaluate(() => ({ rows: document.querySelectorAll('.mc-row').length, blocks: document.querySelectorAll('.mc-block').length }));
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
const view = (p) => p.evaluate(() => document.querySelector('.mc-panel').dataset.view);
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const rect = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const blockOf = (p, type) => p.locator(`.mc-block:has(${{ button: '.mc-block-content a', text: '[data-editable]' }[type]})`).first();
const tickle = (p) => p.waitForTimeout(120);

// ---------------------------------------------------------------- B1 focus & shortcuts
{
  let { p, ctx } = await fresh();
  // A: toolbar Duplicate -> focus stays inside, Delete / Ctrl+Z still work
  await p.locator('.mc-block').nth(2).click();
  const n0 = (await counts(p)).blocks;
  await p.locator('.mc-block.selected > .mc-chrome button[title="Duplicate"]').click(); await tickle(p);
  check('B1A duplicate: block added', (await counts(p)).blocks === n0 + 1);
  check('B1A focus still inside editor after Duplicate', await inRoot(p), await active(p));
  await p.keyboard.press('Delete'); await tickle(p);
  check('B1A Delete works after Duplicate', (await counts(p)).blocks === n0, await counts(p));
  await p.keyboard.press('Control+z'); await tickle(p);
  check('B1A Ctrl+Z works after Delete', (await counts(p)).blocks === n0 + 1, await counts(p));
  await p.keyboard.press('Control+Shift+z'); await tickle(p);
  check('B1A Ctrl+Shift+Z redoes', (await counts(p)).blocks === n0, await counts(p));
  await p.keyboard.press('Control+z'); await tickle(p);
  await p.keyboard.press('Control+y'); await tickle(p);
  check('B1A Ctrl+Y redoes', (await counts(p)).blocks === n0, await counts(p));
  // Move down
  await p.locator('.mc-block').nth(2).click();
  await p.locator('.mc-block.selected > .mc-chrome button[title="Move down"]').click(); await tickle(p);
  check('B1A focus inside after Move down', await inRoot(p), await active(p));
  // row layout button in the panel
  await p.locator('.mc-row').nth(1).click({ position: { x: 2, y: 2 } });
  const ratiosBefore = await p.evaluate(() => document.querySelector('.mc-layout.on')?.title);
  await p.locator('.mc-layout:not(.on)').first().click(); await tickle(p);
  check('B1A focus inside after panel row-layout click', await inRoot(p), await active(p));
  await p.keyboard.press('Control+z'); await tickle(p);
  check('B1A Ctrl+Z after row-layout click undoes it', await p.evaluate(() => document.querySelector('.mc-layout.on')?.title) === ratiosBefore);
  await ctx.close();

  // B: clicking a Button block
  ({ p, ctx } = await fresh());
  const btn = blockOf(p, 'button');
  const n1 = (await counts(p)).blocks;
  await btn.locator('a').click(); await tickle(p);
  check('B1B focus inside editor after clicking a Button block', await inRoot(p), await active(p));
  await p.keyboard.press('Delete'); await tickle(p);
  check('B1B Delete deletes the clicked Button block', (await counts(p)).blocks === n1 - 1, await counts(p));
  await ctx.close();

  // C: type, undo, redo
  ({ p, ctx } = await fresh());
  await p.locator('.mc-block:has([data-editable])').first().click();
  await p.locator('[contenteditable=true]').click();
  await p.keyboard.press('End');
  await p.keyboard.type('ZZZ'); await p.waitForTimeout(900);
  const hasZ = () => p.evaluate(() => document.querySelector('[data-editable]').textContent.includes('ZZZ'));
  await p.keyboard.press('Control+z'); await tickle(p);
  check('B1C undo removes typed text', !(await hasZ()));
  check('B1C focus inside editor after undo', await inRoot(p), await active(p));
  check('B1C focus restored to the editable text', await p.evaluate(() => !!document.activeElement?.isContentEditable), await active(p));
  await p.keyboard.press('Control+Shift+z'); await tickle(p);
  check('B1C redo restores typed text', await hasZ());
  await p.keyboard.press('Control+z'); await tickle(p);
  await p.keyboard.press('Control+y'); await tickle(p);
  check('B1C Ctrl+Y after undo works again', await hasZ());
  await ctx.close();
}

// ---------------------------------------------------------------- B2 number fields
{
  const { p, ctx } = await fresh();
  await p.locator('.mc-block:has([data-editable])').first().click();
  const fs = p.locator('.mc-field:has(.mc-field-label:text-is("Font size")) input[type=number]');
  await fs.click(); await fs.selectText(); await p.keyboard.type('24'); await tickle(p);
  check('B2 typing 24 into font size keeps 24', await fs.inputValue() === '24', await fs.inputValue());
  const fsOf = () => p.evaluate(() => document.querySelector('.mc-block.selected [data-editable]')?.style.fontSize);
  check('B2 live apply of valid value while typing', await fsOf() === '24px', await fsOf());
  await fs.selectText(); await p.keyboard.type('99'); await p.keyboard.press('Tab'); await tickle(p);
  check('B2 out-of-range clamps on blur (48)', await fs.inputValue() === '48', await fs.inputValue());
  await fs.selectText(); await p.keyboard.press('Backspace'); await p.keyboard.press('Tab'); await tickle(p);
  check('B2 empty restores last valid value on blur', await fs.inputValue() === '48', await fs.inputValue());
  await fs.focus(); await p.keyboard.press('ArrowDown'); await tickle(p);
  check('B2 arrow-down steps by 1', await fs.inputValue() === '47', await fs.inputValue());
  await fs.selectText(); await p.keyboard.type('16'); await p.keyboard.press('Enter'); await tickle(p);
  check('B2 Enter commits', await fs.inputValue() === '16' && await fsOf() === '16px');
  // line height decimal
  const lh = p.locator('.mc-field:has(.mc-field-label:text-matches("^Line height")) input[type=number]');
  check('B2 line height is a decimal field (step 0.1)', (await lh.count()) === 1 && (await lh.getAttribute('step')) === '0.1' && Number(await lh.inputValue()) === 1.6, await lh.count() ? await lh.inputValue() : 'missing');
  await lh.selectText(); await p.keyboard.type('1.8'); await tickle(p);
  const lhOf = () => p.evaluate(() => (document.querySelector('.mc-block.selected [data-editable]')?.style.lineHeight));
  check('B2 line height 1.8 applied', await lhOf() === '1.8' && await lh.inputValue() === '1.8', [await lhOf(), await lh.inputValue()]);
  // body content width
  await p.locator('.mc-canvas-wrap').click({ position: { x: 3, y: 3 } });
  const cw = p.locator('.mc-field:has(.mc-field-label:text-is("Content width")) input[type=number]');
  await cw.click(); await cw.selectText(); await p.keyboard.type('640'); await p.waitForTimeout(350);
  check('B2 typing 640 for content width stays 640', await cw.inputValue() === '640' && Math.abs((await rect(p.locator('.mc-canvas'))).w - 640) < 1, [await cw.inputValue(), (await rect(p.locator('.mc-canvas'))).w]);
  await cw.selectText(); await p.keyboard.type('5000'); await p.keyboard.press('Tab'); await tickle(p);
  check('B2 content width clamps to 800 on blur', await cw.inputValue() === '800', await cw.inputValue());
  // slider <-> number sync
  const range = p.locator('.mc-field:has(.mc-field-label:text-is("Content width")) input[type=range]');
  await range.fill('500'); await tickle(p);
  check('B2 slider updates number field', await cw.inputValue() === '500', await cw.inputValue());
  await ctx.close();
}
{
  const { p, ctx } = await fresh('?lang=ja', undefined, 'ja-JP');
  await p.locator('.mc-block:has([data-editable])').first().click();
  const lbl = await p.locator('.mc-field-label').allTextContents();
  check('B2 ja has no "(10倍値)" label', !lbl.some((t) => t.includes('10倍')), lbl);
  await ctx.close();
}

// ---------------------------------------------------------------- B3 links never navigate
for (const mode of ['edit', 'preview']) {
  const { p, ctx } = await fresh();
  if (mode === 'preview') await p.locator('.mc-tb-text').click();
  let popups = 0, navs = 0;
  ctx.on('page', () => popups++);
  p.on('framenavigated', () => navs++);
  const a = p.locator('.mc-canvas a').first();
  await a.scrollIntoViewIfNeeded();
  await a.click(); await tickle(p);
  await a.click({ button: 'middle' }); await tickle(p);
  await a.click({ modifiers: ['Control'] }); await tickle(p);
  await a.click({ modifiers: ['Shift'] }); await tickle(p);
  await p.waitForTimeout(300);
  check(`B3 ${mode}: no new tab / navigation from canvas links`, popups === 0 && navs === 0 && ctx.pages().length === 1, { popups, navs });
  await ctx.close();
}
{
  // link text stays editable in a text block
  const { p, ctx } = await fresh();
  const tb = p.locator('.mc-block:has([data-editable] a)').first();
  if (await tb.count()) {
    await tb.click(); await tickle(p);
    await p.locator('[contenteditable=true] a').first().click(); await p.keyboard.type('Q'); await tickle(p);
    check('B3 link text editable inside text block', await p.evaluate(() => document.querySelector('[contenteditable=true] a').textContent.includes('Q')));
  } else console.log('SKIP B3 editable link (no text block with link in sample)');
  await ctx.close();
}

// ---------------------------------------------------------------- B6 row selection + Escape + toolbar placement
{
  const { p, ctx } = await fresh();
  await shot(p, 'b6-initial');
  const row = p.locator('.mc-row').nth(2);
  await row.hover(); await tickle(p);
  const gut = row.locator('.mc-row-gutter');
  check('B6 row gutter exists and is visible on hover', (await gut.count()) === 1 && await gut.isVisible());
  await shot(p, 'b6-row-hover');
  if (await gut.count()) { await gut.click(); await tickle(p); }
  check('B6 gutter click selects the row', await view(p) === 'props' && await p.locator('.mc-row.selected').count() === 1);
  await shot(p, 'b6-row-selected');
  await p.keyboard.press('Escape'); await tickle(p);
  check('Esc deselects row (panel back to Body)', await view(p) === 'body');
  // select-parent in block toolbar
  await p.locator('.mc-block').nth(3).click(); await tickle(p);
  const sp = p.locator('.mc-block.selected > .mc-chrome [data-act="select-parent"]');
  check('B6 block toolbar has a "select parent row" button', (await sp.count()) === 1);
  if (await sp.count()) { await sp.click(); await tickle(p); }
  check('B6 select-parent selects the row', await p.locator('.mc-row.selected').count() === 1);
  check('B6 focus inside after select-parent', await inRoot(p), await active(p));
  await p.locator('.mc-block').nth(3).click(); await tickle(p);
  await p.keyboard.press('Escape'); await tickle(p);
  check('Esc deselects block (panel back to Body)', await view(p) === 'body');
  await ctx.close();
}
for (const mode of ['light', 'dark']) {
  const { p, ctx } = await fresh(`?mode=${mode}`);
  const overlap = async (idx) => {
    await p.locator('.mc-block').nth(idx).scrollIntoViewIfNeeded();
    await p.locator('.mc-block').nth(idx).click({ position: { x: 5, y: 3 } }); await tickle(p);
    return p.evaluate(() => {
      const sel = document.querySelector('.mc-block.selected'); const ch = sel.querySelector(':scope > .mc-chrome');
      const c = ch.getBoundingClientRect(); const wrap = document.querySelector('.mc-canvas-wrap').getBoundingClientRect();
      let hit = null;
      for (const o of document.querySelectorAll('.mc-block')) {
        if (o === sel) continue;
        const r = o.getBoundingClientRect();
        if (r.width && c.left < r.right && c.right > r.left && c.top < r.bottom - 1 && c.bottom > r.top + 1) { hit = o.dataset.id; break; }
      }
      return { hit, clipped: c.top < wrap.top - 0.5 || c.bottom > wrap.bottom + 0.5, cls: ch.className };
    });
  };
  const res = [];
  for (const i of [0, 1, 2, 3, 4, 5]) res.push(await overlap(i));
  check(`toolbar never covers another block or leaves the scroll area (${mode})`, res.every((r) => !r.hit && !r.clipped), res);
  await p.locator('.mc-block').nth(1).click({ position: { x: 5, y: 3 } }); await tickle(p);
  await shot(p, `toolbar-${mode}`);
  await ctx.close();
}

// ---------------------------------------------------------------- B5 upload validation
{
  const { p, ctx } = await fresh();
  await p.locator('[data-block-type="image"]').click(); await tickle(p);
  const input = p.locator('.mc-panel input[type=file]');
  const srcOf = async () => (await stored(p)).rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).filter((x) => x.type === 'image').map((x) => x.src);
  const before = await srcOf();
  await input.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await tickle(p);
  const err = p.locator('.mc-panel .mc-upload-error');
  check('B5 .txt rejected with an inline error', (await err.count()) === 1 && (await err.innerText()).length > 5, await err.count() ? await err.innerText() : 'none');
  check('B5 .txt did not change the design', JSON.stringify(await srcOf()) === JSON.stringify(before));
  await shot(p, 'b5-txt-error');
  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024) }); await tickle(p);
  check('B5 >5MB rejected with an inline error', (await err.count()) === 1 && /5/.test(await err.innerText()), await err.count() ? await err.innerText() : 'none');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await input.setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(300);
  check('B5 valid PNG accepted (data URL)', (await srcOf()).some((s) => s.startsWith('data:image/png')), (await srcOf()).map((s) => s.slice(0, 20)));
  check('B5 error cleared after success', (await p.locator('.mc-panel .mc-upload-error').count()) === 0);
  // OS file drop path
  const nBlocks = (await counts(p)).blocks;
  const target = await rect(p.locator('.mc-block').first());
  await p.evaluate(({ x, y }) => {
    const dt = new DataTransfer(); dt.items.add(new File(['hello'], 'a.txt', { type: 'text/plain' }));
    const t = document.elementFromPoint(x, y);
    for (const type of ['dragenter', 'dragover', 'drop']) t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
  }, { x: target.x + target.w / 2, y: target.y + target.h * 0.7 });
  await tickle(p);
  check('B5 dropping a .txt creates no block and shows an error notice', (await counts(p)).blocks === nBlocks && (await p.locator('.mc-notice').count()) === 1, [await counts(p), await p.locator('.mc-notice').count()]);
  await shot(p, 'b5-drop-txt');
  await ctx.close();
}

// ---------------------------------------------------------------- B4 Exit preview hover contrast
{
  const { p, ctx } = await fresh();
  const btn = p.locator('.mc-tb-text');
  await btn.click(); await tickle(p);
  await p.mouse.move(0, 0);
  await shot(p, 'b4-exit-preview-normal');
  await btn.hover(); await tickle(p); await p.waitForTimeout(250);
  const cr = await btn.evaluate((e) => {
    const cs = getComputedStyle(e);
    // parse rgb()/color(srgb ...) incl. alpha and composite over the toolbar background
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); const srgb = c.startsWith('color('); const k = srgb ? 255 : 1; return { r: m[0] * k, g: m[1] * k, b: m[2] * k, a: m.length > 3 ? m[3] : 1 }; };
    const under = parse(getComputedStyle(e.closest('.mc-toolbar')).backgroundColor);
    const fg = parse(cs.color); const raw = parse(cs.backgroundColor);
    const bgc = { r: raw.r * raw.a + under.r * (1 - raw.a), g: raw.g * raw.a + under.g * (1 - raw.a), b: raw.b * raw.a + under.b * (1 - raw.a) };
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    const a = lum(fg), bg = lum(bgc); return { ratio: (Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05), color: cs.color, bg: cs.backgroundColor };
  });
  check('B4 Exit preview text readable on hover (contrast >= 4.5)', cr.ratio >= 4.5, cr);
  await shot(p, 'b4-exit-preview-hover');
  await ctx.close();
}

// ---------------------------------------------------------------- DnD edge: drop inside own edge is a no-op
{
  const { p, ctx } = await fresh('', { width: 1400, height: 1000 });
  const order = () => p.evaluate(() => [...document.querySelectorAll('.mc-row')].map((r) => r.dataset.id + '[' + [...r.querySelectorAll('.mc-col')].map((c) => [...c.querySelectorAll('.mc-block')].map((x) => x.dataset.id).join('+')).join('|') + ']').join());
  for (const [label, idx, dy, from] of [['first block of first row (1px inside top)', 0, 1, 'inside'], ['block of a later row (1px inside top)', 2, 1, 'inside'], ['own bottom edge (1px inside)', 0, -1, 'inside'], ['first block of first row, approached from above', 0, 1, 'above'], ['block of a later row, approached from above', 2, 1, 'above'], ['block approached from below (1px inside bottom)', 1, -1, 'below']]) {
    const blk = p.locator('.mc-block').nth(idx);
    await blk.scrollIntoViewIfNeeded(); await blk.click({ position: { x: 5, y: 5 } }); await tickle(p);
    const o0 = await order();
    const h = await rect(p.locator('.mc-block.selected > .mc-chrome .mc-handle'));
    const bb = await rect(p.locator('.mc-block.selected'));
    await p.mouse.move(h.x + h.w / 2, h.y + h.h / 2); await p.mouse.down();
    await p.mouse.move(h.x + 20, h.y + 20, { steps: 4 });
    const ty = dy > 0 ? bb.y + dy : bb.b + dy;
    const via = from === 'above' ? bb.y - 24 : from === 'below' ? bb.b + 24 : bb.y + bb.h / 2;
    await p.mouse.move(bb.x + bb.w / 2, via, { steps: 12 });
    await p.mouse.move(bb.x + bb.w / 2, ty, { steps: 6 });
    await p.mouse.move(bb.x + bb.w / 2, ty, { steps: 2 });
    await p.mouse.up(); await tickle(p);
    check(`DnD drop inside ${label} is a no-op`, (await order()) === o0 && (await p.locator('.mc-indicator').count()) === 0, { before: o0, after: await order() });
  }
  await ctx.close();
}

// ---------------------------------------------------------------- A11Y
{
  const { p, ctx } = await fresh();
  check('A11Y handle has role=button and aria-label', await p.evaluate(() => { const h = document.querySelector('.mc-handle'); return !!h && h.getAttribute('role') === 'button' && !!h.getAttribute('aria-label'); }));
  check('A11Y links inside canvas are not tabbable', await p.evaluate(() => [...document.querySelectorAll('.mc-canvas a')].every((a) => a.tabIndex === -1)));
  const stops = await p.evaluate(() => document.querySelectorAll('.mc-canvas [tabindex="0"]').length);
  check('A11Y exactly one block/row tab stop (roving tabindex)', stops === 1, stops);
  await p.evaluate(() => document.querySelector('.mc-canvas [tabindex="0"]')?.focus());
  await p.keyboard.press('Enter'); await tickle(p);
  const selId = () => p.evaluate(() => document.querySelector('.mc-row.selected,.mc-block.selected')?.dataset.id);
  const sel0 = await selId();
  check('A11Y Enter selects the focused item', !!sel0);
  await p.keyboard.press('ArrowDown'); await tickle(p);
  const sel1 = await selId();
  check('A11Y ArrowDown moves the selection', !!sel1 && sel1 !== sel0, [sel0, sel1]);
  check('A11Y focus follows selection', await p.evaluate(() => document.activeElement?.dataset?.id === document.querySelector('.mc-row.selected,.mc-block.selected')?.dataset.id));
  await p.locator('.mc-block').nth(1).focus(); await p.keyboard.press('Enter'); await tickle(p); // second block of a 3-block column
  const allIds = () => p.evaluate(() => [...document.querySelectorAll('.mc-block')].map((x) => x.dataset.id));
  const cur = await p.evaluate(() => document.querySelector('.mc-block.selected')?.dataset.id);
  if (cur) {
    const i0 = (await allIds()).indexOf(cur);
    await p.keyboard.press('Alt+ArrowDown'); await tickle(p);
    check('A11Y Alt+ArrowDown moves the block', (await allIds()).indexOf(cur) !== i0, [i0, (await allIds()).indexOf(cur)]);
    check('A11Y live region announces the move', (await p.locator('.mc-live').innerText()).length > 0);
    const n = (await counts(p)).blocks;
    await p.keyboard.press('Delete'); await tickle(p);
    check('A11Y Delete deletes the focused block and announces', (await counts(p)).blocks === n - 1 && (await p.locator('.mc-live').innerText()).length > 0);
  } else check('A11Y reached a block with ArrowDown', false);
  // tabs
  await p.locator('[data-tab="content"]').focus();
  await p.keyboard.press('ArrowRight'); await tickle(p);
  check('A11Y role=tab ArrowRight activates next tab and moves focus', await p.evaluate(() => document.activeElement?.dataset?.tab === 'rows' && document.activeElement.getAttribute('aria-selected') === 'true'), await active(p));
  check('A11Y inactive tab has tabindex -1', await p.evaluate(() => document.querySelector('[data-tab="content"]').tabIndex === -1));
  await ctx.close();
}

// ---------------------------------------------------------------- B9 paste & list cleanup
{
  const { p, ctx } = await fresh();
  await p.locator('.mc-block:has([data-editable])').first().click();
  await p.locator('[contenteditable=true]').click();
  await p.keyboard.press('End');
  await p.evaluate(() => {
    const el = document.querySelector('[contenteditable=true]'); el.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', '<p>pasted para</p><iframe src="about:blank"></iframe><script>window.__x=1</script><p onclick="x()">second</p>');
    dt.setData('text/plain', 'pasted para second');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await tickle(p);
  const st = await p.evaluate(() => { const el = document.querySelector('[contenteditable=true]'); return { iframe: el.querySelectorAll('iframe,script').length, onclick: el.innerHTML.includes('onclick'), text: el.textContent.includes('pasted para'), unstyledP: [...el.querySelectorAll('p')].filter((x) => !x.style.margin).length }; });
  check('B9 paste drops iframe/script/on* and keeps text', st.iframe === 0 && !st.onclick && st.text, st);
  check('B9 pasted paragraphs get margin:0', st.unstyledP === 0, st);
  // lists
  await p.locator('[contenteditable=true]').click();
  await p.keyboard.press('Control+a');
  await p.locator('.mc-tool-btn[title="Bulleted list"]').click(); await p.waitForTimeout(300);
  const html = (await stored(p)).rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).filter((x) => x.type === 'text').map((x) => x.html).join('\n');
  check('B9 list: no stray empty <p> wrappers', !/<p[^>]*><\/p>/.test(html), html.slice(0, 300));
  check('B9 list: no empty style="" attributes', !/style=""/.test(html), html.slice(0, 300));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
