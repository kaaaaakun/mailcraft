import { FONT_FAMILIES } from '../core/defaults.js';
import { findBlock, findRow, setRowLayout } from '../core/ops.js';
import { safeUrl } from '../core/render.js';
import type { EditorStore } from '../core/store.js';
import type { Align, Block, BlockType, Design, Padding, Row } from '../core/types.js';
import type { I18n, MessageKey } from '../i18n/index.js';
import { h } from './dom.js';
import { icon, type IconName } from './icons.js';

export interface PanelContext {
  store: EditorStore;
  i18n: I18n;
  uploadImage: (file: File) => Promise<string>;
  /** Copy the current contenteditable content of a text block into the store. */
  syncText: (blockId: string) => void;
  getEditable: (blockId: string) => HTMLElement | null;
  /** Titles of accordion sections the user collapsed (kept across re-renders). */
  collapsed: Set<string>;
}

export const LAYOUTS: { ratios: number[] }[] = [
  { ratios: [1] },
  { ratios: [1, 1] },
  { ratios: [1, 1, 1] },
  { ratios: [1, 2] },
  { ratios: [2, 1] },
  { ratios: [1, 1, 1, 1] },
  { ratios: [1, 2, 1] },
  { ratios: [3, 1] },
];

export const BLOCK_ICON: Record<BlockType, IconName> = { text: 'text', heading: 'heading', image: 'image', button: 'button', divider: 'divider', spacer: 'spacer', html: 'html' };
export const BLOCK_LABEL: Record<BlockType, MessageKey> = { text: 'blockText', heading: 'blockHeading', image: 'blockImage', button: 'blockButton', divider: 'blockDivider', spacer: 'blockSpacer', html: 'blockHtml' };

/** Mini column-layout preview used by the row picker (palette and properties). */
export function layoutPreview(ratios: number[]): HTMLElement {
  return h('span', { class: 'mc-layout-prev' }, ...ratios.map((r) => h('i', { style: `flex:${r}` })));
}

function field(label: string, control: Node, inline = false) {
  return h('label', { class: 'mc-field' + (inline ? ' mc-field-inline' : '') }, h('span', { class: 'mc-field-label' }, label), control);
}

function section(ctx: PanelContext, id: string, title: string, ...kids: (Node | null)[]) {
  const key = id;
  const det = h('details', { class: 'mc-section' },
    h('summary', {}, h('span', {}, title), icon('chevron', 14)),
    h('div', { class: 'mc-section-body' }, ...kids));
  det.open = !ctx.collapsed.has(key);
  det.addEventListener('toggle', () => { if (det.open) ctx.collapsed.delete(key); else ctx.collapsed.add(key); });
  return det;
}

function textField(label: string, value: string, onInput: (v: string) => void, multiline = false) {
  const el = multiline
    ? h('textarea', { rows: 6, value, spellcheck: 'false', 'on:input': (e: Event) => onInput((e.target as HTMLTextAreaElement).value) })
    : h('input', { type: 'text', value, 'on:input': (e: Event) => onInput((e.target as HTMLInputElement).value) });
  return field(label, el);
}

function numberField(label: string, value: number, min: number, max: number, onInput: (v: number) => void) {
  const num = h('input', { type: 'number', min, max, value: String(value) });
  const range = h('input', { type: 'range', min, max, value: String(value) });
  const apply = (raw: string) => {
    const n = Math.max(min, Math.min(max, Number(raw)));
    if (Number.isNaN(n)) return;
    num.value = String(n);
    range.value = String(n);
    onInput(n);
  };
  num.addEventListener('input', () => apply(num.value));
  range.addEventListener('input', () => apply(range.value));
  return field(label, h('div', { class: 'mc-num' }, range, num));
}

function colorField(ctx: PanelContext, label: string, value: string, onInput: (v: string) => void, allowClear = false) {
  const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff' });
  const hex = h('span', { class: 'mc-hex' }, value || ctx.i18n.t('none'));
  color.addEventListener('input', () => { hex.textContent = color.value; onInput(color.value); });
  const kids: Node[] = [color, hex];
  if (allowClear) kids.push(h('button', { type: 'button', class: 'mc-mini', 'on:click': (e: Event) => { e.preventDefault(); hex.textContent = ctx.i18n.t('none'); onInput(''); } }, ctx.i18n.t('none')));
  return field(label, h('div', { class: 'mc-color' }, ...kids));
}

function selectField<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, ...(v === value ? { selected: true } : {}) }, l)));
  sel.addEventListener('change', () => onChange(sel.value as T));
  return field(label, sel);
}

function alignField(ctx: PanelContext, value: Align, onChange: (v: Align) => void) {
  const items: [Align, IconName, MessageKey][] = [['left', 'alignLeft', 'alignLeft'], ['center', 'alignCenter', 'alignCenter'], ['right', 'alignRight', 'alignRight']];
  const wrap = h('div', { class: 'mc-seg' });
  for (const [a, ic, label] of items) {
    const btn = h('button', { type: 'button', class: a === value ? 'on' : '', title: ctx.i18n.t(label), 'aria-label': ctx.i18n.t(label) }, icon(ic, 16));
    btn.addEventListener('click', () => {
      onChange(a);
      wrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
    });
    wrap.append(btn);
  }
  return field(ctx.i18n.t('fAlign'), wrap);
}

function paddingFields(ctx: PanelContext, p: Padding, onChange: (k: keyof Padding, v: number) => void) {
  const keys: [keyof Padding, MessageKey][] = [['top', 'padTop'], ['right', 'padRight'], ['bottom', 'padBottom'], ['left', 'padLeft']];
  const mk = ([k, label]: [keyof Padding, MessageKey]) => {
    const i = h('input', { type: 'number', min: 0, max: 200, value: String(p[k]) });
    i.addEventListener('input', () => onChange(k, Math.max(0, Math.min(200, Number(i.value) || 0))));
    return h('label', { class: 'mc-pad' }, h('span', {}, ctx.i18n.t(label)), i);
  };
  return field(ctx.i18n.t('fPadding'), h('div', { class: 'mc-pads' }, ...keys.map(mk)));
}

function panelTitle(ic: IconName, title: string, sub?: string) {
  return h('div', { class: 'mc-panel-title' }, h('span', { class: 'mc-panel-title-ico' }, icon(ic, 18)), h('div', {}, h('h3', {}, title), sub ? h('p', {}, sub) : null));
}

export function renderPanel(ctx: PanelContext, view: 'props' | 'body'): HTMLElement {
  const { store, i18n } = ctx;
  const { t } = i18n;
  const sel = store.selection;
  const root = h('div', { class: 'mc-panel-inner' });

  const setBlock = (id: string, key: string, v: unknown) =>
    store.change((d) => { const loc = findBlock(d, id); if (loc) (loc.block as any)[key] = v; }, { render: 'canvas', coalesceKey: `b:${id}:${key}` });
  const setBlockPad = (id: string, k: keyof Padding, v: number) =>
    store.change((d) => { const loc = findBlock(d, id); if (loc) loc.block.padding[k] = v; }, { render: 'canvas', coalesceKey: `bp:${id}:${k}` });

  if (view === 'props' && sel.kind === 'block') {
    const loc = findBlock(store.design, sel.id);
    if (!loc) return root;
    const b = loc.block;
    const id = b.id;
    root.append(panelTitle(BLOCK_ICON[b.type], t(BLOCK_LABEL[b.type])));
    root.append(...blockFields(ctx, b, setBlock));
    root.append(section(ctx, 'spacing', t('secSpacing'), paddingFields(ctx, b.padding, (k, v) => setBlockPad(id, k, v))));
    return root;
  }

  if (view === 'props' && sel.kind === 'row') {
    const row = findRow(store.design, sel.id);
    if (!row) return root;
    const setRow = (key: keyof Row, v: unknown) => store.change((d) => { const r = findRow(d, row.id); if (r) (r as any)[key] = v; }, { render: 'canvas', coalesceKey: `r:${row.id}:${String(key)}` });
    const layouts = h('div', { class: 'mc-layouts' }, ...LAYOUTS.map((l) =>
      h('button', {
        type: 'button', class: 'mc-layout' + (l.ratios.join() === row.ratios.join() ? ' on' : ''), title: l.ratios.join(' : '),
        'on:click': () => store.change((d) => { const r = findRow(d, row.id); if (r) setRowLayout(r, l.ratios); }),
      }, layoutPreview(l.ratios))));
    const stack = h('input', { type: 'checkbox', checked: row.stackOnMobile, 'on:change': (e: Event) => setRow('stackOnMobile', (e.target as HTMLInputElement).checked) });
    root.append(
      panelTitle('rows', t('rowName')),
      section(ctx, 'layout', t('secLayout'), field(t('fColumnLayout'), layouts), field(t('fStackOnMobile'), h('span', { class: 'mc-check' }, stack), true)),
      section(ctx, 'style', t('secStyle'), colorField(ctx, t('fBackground'), row.backgroundColor, (v) => setRow('backgroundColor', v), true)),
      section(ctx, 'spacing', t('secSpacing'),
        paddingFields(ctx, row.padding, (k, v) => store.change((d) => { const r = findRow(d, row.id); if (r) r.padding[k] = v; }, { render: 'canvas', coalesceKey: `rp:${row.id}:${k}` }))),
    );
    return root;
  }

  // body
  const setBody = (key: keyof Design['body'], v: unknown) => store.change((d) => { (d.body as any)[key] = v; }, { render: 'canvas', coalesceKey: `body:${key}` });
  const body = store.design.body;
  const fonts = Object.entries(FONT_FAMILIES).map(([l, v]) => [v, fontLabel(i18n, l)] as [string, string]);
  root.append(
    panelTitle('settings', t('panelBodyTitle'), t('panelBodyHint')),
    section(ctx, 'layout', t('secLayout'), numberField(t('fContentWidth'), body.contentWidth, 320, 800, (v) => setBody('contentWidth', v))),
    section(ctx, 'colors', t('secColors'),
      colorField(ctx, t('fPageBackground'), body.backgroundColor, (v) => setBody('backgroundColor', v)),
      colorField(ctx, t('fContentBackground'), body.contentBackgroundColor, (v) => setBody('contentBackgroundColor', v))),
    section(ctx, 'text', t('secText'),
      selectField(t('fFont'), fonts, body.fontFamily, (v) => setBody('fontFamily', v)),
      textField(t('fPreheader'), body.preheader, (v) => setBody('preheader', v))),
  );
  return root;
}

function fontLabel(i18n: I18n, name: string): string {
  const map: Record<string, MessageKey> = { 'Sans-serif': 'fontSans', Serif: 'fontSerif', Monospace: 'fontMono', 'Japanese (Gothic)': 'fontJapanese' };
  return map[name] ? i18n.t(map[name]) : name;
}

function blockFields(ctx: PanelContext, b: Block, set: (id: string, key: string, v: unknown) => void): Node[] {
  const id = b.id;
  const { t } = ctx.i18n;
  const s = (key: string) => (v: unknown) => set(id, key, v);
  const color = (label: string, v: string, key: string) => colorField(ctx, label, v, s(key));
  switch (b.type) {
    case 'text':
      return [
        section(ctx, 'format', t('secFormat'), richToolbar(ctx, id)),
        section(ctx, 'style', t('secStyle'), numberField(t('fFontSize'), b.fontSize, 10, 48, s('fontSize')), numberField(t('fLineHeight'), Math.round(b.lineHeight * 10), 10, 30, (v) => set(id, 'lineHeight', v / 10)), color(t('fColor'), b.color, 'color'), alignField(ctx, b.align, s('align'))),
      ];
    case 'heading':
      return [
        section(ctx, 'content', t('secContent'), textField(t('fText'), b.text, s('text')), selectField(t('fHeadingLevel'), [['1', 'H1'], ['2', 'H2'], ['3', 'H3']], String(b.level) as '1', (v) => set(id, 'level', Number(v)))),
        section(ctx, 'style', t('secStyle'), numberField(t('fFontSize'), b.fontSize, 12, 64, s('fontSize')), color(t('fColor'), b.color, 'color'), alignField(ctx, b.align, s('align'))),
      ];
    case 'image':
      return [
        section(ctx, 'image', t('secImage'),
          textField(t('fImageUrl'), b.src.startsWith('data:') ? t('uploadedImage') : b.src, (v) => set(id, 'src', v)),
          field(t('fUpload'), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', 'on:change': async (e: Event) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) set(id, 'src', await ctx.uploadImage(f));
            ctx.store.select(ctx.store.selection); // refresh panel
          } })),
          textField(t('fAltText'), b.alt, s('alt')),
          textField(t('fLinkUrl'), b.href, s('href'))),
        section(ctx, 'style', t('secStyle'), numberField(t('fWidthPercent'), b.widthPercent, 5, 100, s('widthPercent')), alignField(ctx, b.align, s('align'))),
      ];
    case 'button':
      return [
        section(ctx, 'content', t('secContent'), textField(t('fLabel'), b.text, s('text')), textField(t('fLinkUrl'), b.href, s('href'))),
        section(ctx, 'style', t('secStyle'), color(t('fBackground'), b.backgroundColor, 'backgroundColor'), color(t('fTextColor'), b.color, 'color'),
          numberField(t('fFontSize'), b.fontSize, 10, 32, s('fontSize')), numberField(t('fCornerRadius'), b.borderRadius, 0, 40, s('borderRadius')),
          numberField(t('fInnerPaddingY'), b.innerPaddingY, 0, 40, s('innerPaddingY')), numberField(t('fInnerPaddingX'), b.innerPaddingX, 0, 80, s('innerPaddingX')), alignField(ctx, b.align, s('align'))),
      ];
    case 'divider':
      return [section(ctx, 'style', t('secStyle'), color(t('fColor'), b.color, 'color'), numberField(t('fThickness'), b.thickness, 1, 10, s('thickness')))];
    case 'spacer':
      return [section(ctx, 'style', t('secStyle'), numberField(t('fHeight'), b.height, 4, 200, s('height')))];
    case 'html':
      return [section(ctx, 'content', t('secContent'), textField(t('fHtml'), b.html, s('html'), true), h('p', { class: 'mc-warn' }, icon('warn', 14), h('span', {}, t('htmlWarning'))))];
  }
}

function richToolbar(ctx: PanelContext, id: string): Node {
  const { t } = ctx.i18n;
  const exec = (cmd: string, arg?: string) => {
    const el = ctx.getEditable(id);
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, arg);
    ctx.syncText(id);
  };
  const btn = (ic: IconName, title: string, fn: () => void) =>
    h('button', { type: 'button', class: 'mc-tool-btn', title, 'aria-label': title, 'on:mousedown': (e: Event) => e.preventDefault(), 'on:click': fn }, icon(ic, 16));
  return h('div', { class: 'mc-rich' },
    btn('bold', t('bold'), () => exec('bold')),
    btn('italic', t('italic'), () => exec('italic')),
    btn('underline', t('underline'), () => exec('underline')),
    btn('ul', t('bulletList'), () => exec('insertUnorderedList')),
    btn('ol', t('numberedList'), () => exec('insertOrderedList')),
    btn('link', t('link'), () => {
      const s = window.getSelection();
      const range = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const url = safeUrl(window.prompt(t('linkPrompt')) ?? '');
      if (!url || !range) return;
      const el = ctx.getEditable(id);
      el?.focus();
      s?.removeAllRanges();
      s?.addRange(range);
      exec('createLink', url);
    }),
    btn('clear', t('clearFormatting'), () => exec('removeFormat')),
  );
}
