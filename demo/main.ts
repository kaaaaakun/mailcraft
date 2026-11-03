import { createEditor, createSampleDesign, darkTheme, defaultTheme } from '../src';

const KEY = 'mailcraft-demo-design';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* ignore */ }

// Demo-page labels only (the editor ships its own dictionaries).
const UI = {
  en: { lang: 'Language', theme: 'Theme', accent: 'Accent', light: 'Light', dark: 'Dark', sample: 'Load sample', html: 'Export HTML', json: 'Export JSON', copy: 'Copy HTML', copied: 'Copied', close: 'Close' },
  ja: { lang: '言語', theme: 'テーマ', accent: 'アクセント', light: 'ライト', dark: 'ダーク', sample: 'サンプルを読込', html: 'HTML出力', json: 'JSON出力', copy: 'HTMLをコピー', copied: 'コピーしました', close: '閉じる' },
} as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let lang: 'en' | 'ja' = (params.get('lang') ?? (navigator.language.startsWith('ja') ? 'ja' : 'en')) === 'ja' ? 'ja' : 'en';
let mode: 'light' | 'dark' = params.get('mode') === 'dark' ? 'dark' : 'light';
let accent = params.get('accent') ?? (mode === 'dark' ? darkTheme.accent : defaultTheme.accent);

const editor = createEditor($('editor'), {
  design: saved ?? createSampleDesign(lang),
  locale: lang,
  theme: { mode, accent },
  onChange: (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } },
});

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
