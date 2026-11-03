import { createEditor, type LayoutMode, createSampleDesign, darkTheme, defaultTheme } from '../src';

const KEY = 'mailcraft-demo-design';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* ignore */ }

// Demo-page labels only (the editor ships its own dictionaries).
const UI = {
  en: { lang: 'Language', theme: 'Theme', accent: 'Accent', light: 'Light', dark: 'Dark', sample: 'Load sample', html: 'Export HTML', json: 'Export JSON', copy: 'Copy HTML', copied: 'Copied', close: 'Close', layout: 'Layout', modeLabel: 'Layout mode', auto: 'Auto', split: 'Split', compact: 'Compact', stacked: 'Stacked', sidebars: 'Sidebars', left: 'Left', right: 'Right', width: 'Container width', current: 'Current', note: 'Auto follows the editor container width, not the window.' },
  ja: { lang: '言語', theme: 'テーマ', accent: 'アクセント', light: 'ライト', dark: 'ダーク', sample: 'サンプルを読込', html: 'HTML出力', json: 'JSON出力', copy: 'HTMLをコピー', copied: 'コピーしました', close: '閉じる', layout: 'レイアウト', modeLabel: 'レイアウト', auto: '自動', split: '3ペイン', compact: 'コンパクト', stacked: '縦積み', sidebars: 'サイドバー', left: '左', right: '右', width: 'コンテナ幅', current: '現在', note: '自動はウィンドウ幅ではなくエディタの置かれた幅で切り替わります。' },
} as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let lang: 'en' | 'ja' = (params.get('lang') ?? (navigator.language.startsWith('ja') ? 'ja' : 'en')) === 'ja' ? 'ja' : 'en';
let mode: 'light' | 'dark' = params.get('mode') === 'dark' ? 'dark' : 'light';
let accent = params.get('accent') ?? (mode === 'dark' ? darkTheme.accent : defaultTheme.accent);

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
  theme: { mode, accent },
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

function syncDemoUi() {
  const u = UI[lang];
  document.documentElement.lang = lang;
  document.documentElement.dataset.demoTheme = mode;
  $('lbl-lang').textContent = u.lang; $('lbl-theme').textContent = u.theme; $('lbl-accent').textContent = u.accent;
  $('theme-light').textContent = u.light; $('theme-dark').textContent = u.dark;
  $('btn-sample').textContent = u.sample; $('btn-html').textContent = u.html; $('btn-json').textContent = u.json; $('btn-copy').textContent = u.copy; $('btn-close').textContent = u.close;
  $('theme-light').classList.toggle('on', mode === 'light'); $('theme-dark').classList.toggle('on', mode === 'dark');
  ($('sel-lang') as HTMLSelectElement).value = lang;
  ($('inp-accent') as HTMLInputElement).value = accent;
  syncLayoutUi();
}
syncDemoUi();

$('sel-lang').addEventListener('change', (e) => { lang = (e.target as HTMLSelectElement).value as 'en' | 'ja'; editor.setLocale(lang); syncDemoUi(); });
const setMode = (m: 'light' | 'dark') => {
  // Switching mode swaps the preset; keep the picked accent unless it is still a preset default.
  const wasPreset = accent === defaultTheme.accent || accent === darkTheme.accent;
  mode = m;
  if (wasPreset) accent = m === 'dark' ? darkTheme.accent : defaultTheme.accent;
  editor.setTheme({ mode, accent });
  syncDemoUi();
};
$('theme-light').onclick = () => setMode('light');
$('theme-dark').onclick = () => setMode('dark');
$('inp-accent').addEventListener('input', (e) => { accent = (e.target as HTMLInputElement).value; editor.setTheme({ accent }); });
$('btn-sample').onclick = () => editor.loadDesign(createSampleDesign(lang));

const dlg = $('dlg') as unknown as HTMLDialogElement;
const out = $('out') as HTMLTextAreaElement;
const show = (text: string) => { out.value = text; dlg.showModal(); };
$('btn-html').onclick = () => show(editor.exportHtml({ title: 'Mailcraft email' }));
$('btn-json').onclick = () => show(JSON.stringify(editor.getDesign(), null, 2));
$('btn-copy').onclick = async (e) => {
  await navigator.clipboard.writeText(editor.exportHtml());
  const b = e.target as HTMLButtonElement;
  b.textContent = UI[lang].copied;
  setTimeout(() => (b.textContent = UI[lang].copy), 1500);
};

// Layout popover (demo-only controls) and ?layout= / ?left=0 / ?right=0 / ?width= URL params.
const pop = $('pop-layout');
const setPop = (open: boolean) => { pop.classList.toggle('open', open); $('btn-layout').setAttribute('aria-expanded', String(open)); };
$('btn-layout').onclick = (e) => { e.stopPropagation(); setPop(!pop.classList.contains('open')); };
document.addEventListener('click', (e) => { if (!pop.contains(e.target as Node)) setPop(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPop(false); });
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
