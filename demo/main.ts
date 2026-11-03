import { createEditor, type LayoutMode, createSampleDesign, normalizeColor } from '../src';

const KEY = 'mailcraft-demo-design';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* ignore */ }

// Demo-page labels only (the editor ships its own dictionaries).
const UI = {
  en: { lang: 'Language', theme: 'Theme', brand: 'Brand', presets: 'Presets', primary: 'Primary', secondary: 'Secondary', normal: 'Normal', brandNote: 'Primary: selection, focus, buttons. Secondary: rows, badges, icon accents. Normal: text and surfaces.', light: 'Light', dark: 'Dark', sample: 'Load sample', html: 'Export HTML', json: 'Export JSON', copy: 'Copy HTML', copied: 'Copied', close: 'Close', layout: 'Layout', modeLabel: 'Layout mode', auto: 'Auto', split: 'Split', compact: 'Compact', stacked: 'Stacked', sidebars: 'Sidebars', left: 'Left', right: 'Right', width: 'Container width', current: 'Current', note: 'Auto follows the editor container width, not the window.' },
  ja: { lang: '言語', theme: 'テーマ', brand: 'ブランド', presets: 'プリセット', primary: 'プライマリ', secondary: 'セカンダリ', normal: 'ノーマル', brandNote: 'プライマリ: 選択・フォーカス・ボタン。セカンダリ: 行・バッジ・アイコンの差し色。ノーマル: 文字と背景の基調色。', light: 'ライト', dark: 'ダーク', sample: 'サンプルを読込', html: 'HTML出力', json: 'JSON出力', copy: 'HTMLをコピー', copied: 'コピーしました', close: '閉じる', layout: 'レイアウト', modeLabel: 'レイアウト', auto: '自動', split: '3ペイン', compact: 'コンパクト', stacked: '縦積み', sidebars: 'サイドバー', left: '左', right: '右', width: 'コンテナ幅', current: '現在', note: '自動はウィンドウ幅ではなくエディタの置かれた幅で切り替わります。' },
} as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let lang: 'en' | 'ja' = (params.get('lang') ?? (navigator.language.startsWith('ja') ? 'ja' : 'en')) === 'ja' ? 'ja' : 'en';
let mode: 'light' | 'dark' = params.get('mode') === 'dark' ? 'dark' : 'light';

// Brand colors (experimental theme API).
// URL: ?primary=%23..&secondary=..&normal=.. ; ?accent= is an alias of primary. Invalid values are ignored (default kept).
type BrandKey = 'primary' | 'secondary' | 'normal';
const BRAND_KEYS: BrandKey[] = ['primary', 'secondary', 'normal'];
const PRESETS: Record<string, { label: string } & Record<BrandKey, string>> = {
  indigo: { label: 'Indigo', primary: '#4f46e5', secondary: '#0ea5e9', normal: '#475467' },
  green: { label: 'Green', primary: '#059669', secondary: '#f59e0b', normal: '#44403c' },
  coral: { label: 'Coral', primary: '#e8553a', secondary: '#7c3aed', normal: '#52525b' },
  mono: { label: 'Mono', primary: '#111827', secondary: '#6b7280', normal: '#374151' },
};
const brand: Record<BrandKey, string> = {
  primary: normalizeColor(params.get('primary') ?? params.get('accent')) ?? PRESETS.indigo.primary,
  secondary: normalizeColor(params.get('secondary')) ?? PRESETS.indigo.secondary,
  normal: normalizeColor(params.get('normal')) ?? PRESETS.indigo.normal,
};
const EMAIL_TITLE = 'Mailcraft email'; // same title for "Export HTML" and "Copy HTML"

const MODES: LayoutMode[] = ['auto', 'split', 'compact', 'stacked'];
const pm = params.get('layout');
let layoutMode: LayoutMode = MODES.includes(pm as LayoutMode) ? (pm as LayoutMode) : 'auto';
let showLeft = params.get('left') !== '0';
let showRight = params.get('right') !== '0';
const pw = Number(params.get('width'));
let boxWidth = pw >= 320 ? Math.round(pw) : 0;

const editor = createEditor($('editor'), {
  design: saved ?? createSampleDesign(lang),
  locale: lang,
  theme: { mode, brand: { ...brand } },
  layout: { mode: layoutMode, sidebars: { left: showLeft, right: showRight } },
  onLayoutChange: () => syncDemoUi(),
  onChange: (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } },
});

function syncLayoutUi() {
  const u = UI[lang];
  $('btn-layout').textContent = u.layout; $('lbl-mode').textContent = u.modeLabel; $('lbl-sidebars').textContent = u.sidebars;
  $('lbl-left').textContent = u.left; $('lbl-right').textContent = u.right; $('lbl-width').textContent = u.width; $('lbl-current').textContent = u.current; $('note-layout').textContent = u.note;
  document.querySelectorAll<HTMLElement>('#seg-layout button').forEach((b) => { const m = b.dataset.layout as LayoutMode; b.textContent = u[m]; b.classList.toggle('on', m === layoutMode); });
  ($('chk-left') as HTMLInputElement).checked = showLeft; ($('chk-right') as HTMLInputElement).checked = showRight;
  ($('sel-width') as HTMLSelectElement).value = boxWidth ? String(boxWidth) : '';
  $('editor').style.width = boxWidth ? `${boxWidth}px` : '';
  $('stage').classList.toggle('framed', !!boxWidth);
  $('cur-layout').textContent = editor.getResolvedLayout();
}

function syncBrandUi() {
  for (const k of BRAND_KEYS) {
    ($('inp-' + k) as HTMLInputElement).value = brand[k];
    const t = $('txt-' + k) as HTMLInputElement;
    if (document.activeElement !== t) { t.value = brand[k]; t.classList.remove('bad'); }
  }
  document.querySelectorAll<HTMLElement>('#presets .chip').forEach((c) => { const q = PRESETS[c.dataset.preset!]; c.classList.toggle('on', BRAND_KEYS.every((k) => q[k] === brand[k])); });
  const pal = editor.getBrandPalette();
  const rs = document.documentElement.style;
  rs.setProperty('--primary', pal.tints.primary.color); rs.setProperty('--on-primary', pal.tints.primary.contrast);
  const t = pal.tints;
  $('tints').replaceChildren(...[t.normal.background, t.primary.soft, t.primary.color, t.primary.hover, t.secondary.soft, t.secondary.color, t.normal.border, t.normal.text].map((c) => {
    const b = document.createElement('b'); b.style.background = c; return b;
  }));
  const w = $('brand-warn'); const ws = editor.getTheme().warnings;
  w.hidden = !ws.length; w.textContent = ws.map((x) => x.message).join(' ');
}

function syncDemoUi() {
  const u = UI[lang];
  document.documentElement.lang = lang;
  document.documentElement.dataset.demoTheme = mode;
  $('lbl-lang').textContent = u.lang; $('lbl-theme').textContent = u.theme; $('lbl-brand').textContent = u.brand;
  $('lbl-presets').textContent = u.presets; $('lbl-primary').textContent = u.primary; $('lbl-secondary').textContent = u.secondary; $('lbl-normal').textContent = u.normal; $('note-brand').textContent = u.brandNote;
  $('theme-light').textContent = u.light; $('theme-dark').textContent = u.dark;
  $('btn-sample').textContent = u.sample; $('btn-html').textContent = u.html; $('btn-json').textContent = u.json; $('btn-copy').textContent = u.copy; $('btn-close').textContent = u.close;
  $('theme-light').classList.toggle('on', mode === 'light'); $('theme-dark').classList.toggle('on', mode === 'dark');
  ($('sel-lang') as HTMLSelectElement).value = lang;
  syncBrandUi();
  syncLayoutUi();
}

function pushBrandUrl() {
  const q = new URLSearchParams(location.search);
  q.delete('accent');
  for (const k of BRAND_KEYS) q.set(k, brand[k]);
  try { history.replaceState(null, '', `${location.pathname}?${q}`); } catch { /* ignore */ }
}

const presetsEl = $('presets');
for (const [id, pr] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.preset = id; b.type = 'button';
  const dots = document.createElement('i');
  for (const k of BRAND_KEYS) { const d = document.createElement('b'); d.style.background = pr[k]; dots.append(d); }
  b.append(dots, pr.label);
  b.onclick = () => { for (const k of BRAND_KEYS) brand[k] = pr[k]; editor.setTheme({ brand: { ...brand } }); syncDemoUi(); pushBrandUrl(); };
  presetsEl.append(b);
}
syncDemoUi();

$('sel-lang').addEventListener('change', (e) => { lang = (e.target as HTMLSelectElement).value as 'en' | 'ja'; editor.setLocale(lang); syncDemoUi(); });
// Brand colors are re-derived by the editor for the new mode; nothing to remap here.
const setMode = (m: 'light' | 'dark') => { mode = m; editor.setTheme({ mode }); syncDemoUi(); };
$('theme-light').onclick = () => setMode('light');
$('theme-dark').onclick = () => setMode('dark');

const setBrand = (k: BrandKey, raw: string): boolean => {
  const c = normalizeColor(raw);
  if (!c) return false; // invalid input is ignored; the previous color stays
  brand[k] = c; editor.setTheme({ brand: { [k]: c } }); syncDemoUi(); pushBrandUrl();
  return true;
};
for (const k of BRAND_KEYS) {
  $('inp-' + k).addEventListener('input', (e) => { setBrand(k, (e.target as HTMLInputElement).value); });
  $('txt-' + k).addEventListener('input', (e) => { const t = e.target as HTMLInputElement; t.classList.toggle('bad', !setBrand(k, t.value) && t.value.trim() !== ''); });
  $('txt-' + k).addEventListener('blur', () => syncBrandUi());
}
$('btn-sample').onclick = () => editor.loadDesign(createSampleDesign(lang));

const dlg = $('dlg') as unknown as HTMLDialogElement;
const out = $('out') as HTMLTextAreaElement;
const show = (text: string) => { out.value = text; dlg.showModal(); };
$('btn-html').onclick = () => show(editor.exportHtml({ title: EMAIL_TITLE }));
$('btn-json').onclick = () => show(JSON.stringify(editor.getDesign(), null, 2));
$('btn-copy').onclick = async (e) => {
  await navigator.clipboard.writeText(editor.exportHtml({ title: EMAIL_TITLE }));
  const b = e.target as HTMLButtonElement;
  b.textContent = UI[lang].copied;
  setTimeout(() => (b.textContent = UI[lang].copy), 1500);
};

// Header popovers (Layout / Brand; demo-only controls) and ?layout= / ?left=0 / ?right=0 / ?width= URL params.
const POPS: Array<[string, string]> = [['btn-layout', 'pop-layout'], ['btn-brand', 'pop-brand']];
const closePops = (except?: string) => POPS.forEach(([b, m]) => { if (m !== except) { $(m).classList.remove('open'); $(b).setAttribute('aria-expanded', 'false'); } });
for (const [b, m] of POPS) {
  $(b).onclick = (e) => {
    e.stopPropagation(); closePops(m);
    const open = !$(m).classList.contains('open');
    $(m).classList.toggle('open', open); $(b).setAttribute('aria-expanded', String(open));
  };
}
document.addEventListener('click', (e) => { if (!POPS.some(([, m]) => $(m).contains(e.target as Node))) closePops(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(); });
const pushUrl = () => {
  const q = new URLSearchParams(location.search);
  const put = (k: string, v: string | null) => (v === null ? q.delete(k) : q.set(k, v));
  put('layout', layoutMode === 'auto' ? null : layoutMode); put('left', showLeft ? null : '0'); put('right', showRight ? null : '0'); put('width', boxWidth ? String(boxWidth) : null);
  try { history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`); } catch { /* ignore */ }
};
document.querySelectorAll<HTMLElement>('#seg-layout button').forEach((b) => {
  b.onclick = () => { layoutMode = b.dataset.layout as LayoutMode; editor.setLayout({ mode: layoutMode }); syncDemoUi(); pushUrl(); };
});
$('chk-left').addEventListener('change', (e) => { showLeft = (e.target as HTMLInputElement).checked; editor.setLayout({ sidebars: { left: showLeft } }); pushUrl(); });
$('chk-right').addEventListener('change', (e) => { showRight = (e.target as HTMLInputElement).checked; editor.setLayout({ sidebars: { right: showRight } }); pushUrl(); });
$('sel-width').addEventListener('change', (e) => { boxWidth = Number((e.target as HTMLSelectElement).value) || 0; syncDemoUi(); pushUrl(); });
