// Real-browser layout checks (container-width switching, forced modes, sidebars, DnD per mode). NOT part of `npm test`.
// Usage: OUT=/dir [BASE_URL=http://localhost:4173/] node tests/e2e/layout-real.mjs   (needs playwright-core + `vite preview --outDir dist-demo --port 4173`)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? '/tmp/mailcraft-layout'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
let fails = 0;
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) fails++; };
const page = async (vp, q = '', init) => { const ctx = await b.newContext({ viewport: vp, locale: q.includes('lang=ja') ? 'ja-JP' : 'en-US' }); const p = await ctx.newPage(); await p.addInitScript(() => localStorage.removeItem('mailcraft-demo-design')); await p.goto(BASE + q); await p.waitForTimeout(250); return p; };
const lay = (p) => p.evaluate(() => document.querySelector('.mc-root').dataset.layout);
const hscroll = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

// 1 viewport resize
let p = await page({ width: 1400, height: 850 });
check('1400 -> wide', await lay(p) === 'wide'); await shot(p, '01-wide-1400');
await p.setViewportSize({ width: 1000, height: 850 }); await p.waitForTimeout(200);
check('1000 -> compact', await lay(p) === 'compact'); await shot(p, '02-compact-1000');
await p.setViewportSize({ width: 700, height: 850 }); await p.waitForTimeout(200);
check('700 -> stacked', await lay(p) === 'stacked'); await shot(p, '03-stacked-700');
check('no page h-scroll at 700 (header wraps)', !(await hscroll(p)));
await p.setViewportSize({ width: 380, height: 800 }); await p.waitForTimeout(200); await shot(p, '03b-stacked-380');
check('no page h-scroll at 380', !(await hscroll(p)));
await p.setViewportSize({ width: 1400, height: 850 }); await p.waitForTimeout(200);
check('back to wide', await lay(p) === 'wide');
await p.context().close();

// 2 embed in narrow container inside wide page (demo width control)
for (const [w, exp] of [[1280, 'wide'], [1000, 'compact'], [700, 'stacked']]) {
  p = await page({ width: 1600, height: 900 }, `?width=${w}`);
  check(`wide page(1600), container ${w} -> ${exp}`, await lay(p) === exp, await lay(p)); await shot(p, `04-embed-${w}`);
  await p.context().close();
}
// runtime container change via the popover
p = await page({ width: 1600, height: 900 });
await p.click('#btn-layout'); await shot(p, '05-popover');
await p.selectOption('#sel-width', '700'); await p.waitForTimeout(400);
check('popover width 700 -> stacked', await lay(p) === 'stacked');
check('current label updated', (await p.textContent('#cur-layout')) === 'stacked');
await p.selectOption('#sel-width', ''); await p.waitForTimeout(400);
check('width reset -> wide', await lay(p) === 'wide');
// forced modes on wide page
for (const m of ['compact', 'stacked', 'split']) {
  await p.click(`#seg-layout [data-layout=${m}]`); await p.waitForTimeout(150);
  check(`forced ${m}`, await lay(p) === (m === 'split' ? 'wide' : m)); await shot(p, `06-forced-${m}`);
  check(`url has layout=${m}`, (await p.evaluate(() => location.search)).includes(`layout=${m}`));
}
// sidebars toggle
await p.click('#seg-layout [data-layout=auto]');
await p.uncheck('#chk-left'); check('left hidden', !(await p.isVisible('.mc-sidebar')) && await p.isVisible('.mc-panel')); await shot(p, '07-no-left');
await p.uncheck('#chk-right'); check('right hidden', !(await p.isVisible('.mc-panel'))); await shot(p, '08-no-sidebars');
await p.check('#chk-left'); await p.check('#chk-right'); check('both back', await p.isVisible('.mc-sidebar') && await p.isVisible('.mc-panel'));
await p.context().close();
// URL params
p = await page({ width: 1400, height: 850 }, '?layout=stacked&left=0');
check('?layout=stacked&left=0', await lay(p) === 'stacked' && !(await p.isVisible('.mc-sidebar'))); await p.context().close();

// 3 DnD + click-to-add in every mode (real mouse)
async function dragTile(p, type) {
  const t = p.locator(`[data-block-type="${type}"]`); await t.scrollIntoViewIfNeeded(); const tb = await t.boundingBox();
  const c = await p.locator('.mc-block').nth(1).boundingBox();
  const before = await p.locator('.mc-block').count();
  await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.mouse.down();
  await p.mouse.move(tb.x + tb.width / 2 + 8, tb.y + tb.height / 2 + 8, { steps: 4 });
  await p.mouse.move(c.x + c.width / 2, c.y + c.height * .8, { steps: 25 }); await p.mouse.move(c.x + c.width / 2 + 1, c.y + c.height * .8 + 1, { steps: 3 });
  const ind = await p.locator('.mc-indicator').count();
  await p.mouse.up(); await p.waitForTimeout(150);
  return { added: (await p.locator('.mc-block').count()) - before, ind };
}
for (const m of ['split', 'compact', 'stacked']) {
  p = await page({ width: 1400, height: 1400 }, `?layout=${m}`);
  await p.locator('.mc-block').nth(1).scrollIntoViewIfNeeded();
  const r = await dragTile(p, 'button'); check(`DnD in ${m}`, r.added === 1 && r.ind === 1, JSON.stringify(r));
  await p.locator('[data-block-type="divider"]').click(); await p.waitForTimeout(100);
  check(`click-to-add in ${m}`, (await p.locator('.mc-block.selected').count()) === 1);
  await p.click('[data-tab="rows"]'); await p.waitForTimeout(100); await shot(p, `09-rows-tab-${m}`);
  const before = await p.locator('.mc-row').count(); await p.locator('[data-row-layout="1:1"]').click();
  check(`row click-add in ${m}`, (await p.locator('.mc-row').count()) === before + 1);
  await p.locator('.mc-block').nth(2).click(); await p.waitForTimeout(100); await shot(p, `10-selected-${m}`);
  await p.context().close();
}
// 4 preview, dark+ja, compact 
p = await page({ width: 1000, height: 850 }, '?lang=ja&mode=dark');
await shot(p, '11-ja-dark-compact');
await p.click('.mc-tb-text'); await p.waitForTimeout(150);
check('preview hides sidebars (compact)', !(await p.isVisible('.mc-sidebar')) && !(await p.isVisible('.mc-panel'))); await shot(p, '12-preview-compact-dark-ja');
await p.setViewportSize({ width: 600, height: 850 }); await p.waitForTimeout(200); await shot(p, '13-preview-stacked-dark-ja');
await p.click('.mc-tb-text'); await p.waitForTimeout(150);
check('exit preview restores sidebars (stacked)', await p.isVisible('.mc-sidebar') && await p.isVisible('.mc-panel') && await lay(p) === 'stacked');
await shot(p, '14-ja-dark-stacked');
await p.context().close();
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
