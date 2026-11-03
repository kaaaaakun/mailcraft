import { FONT_FAMILIES } from '../core/defaults.js';
import { findBlock, findRow, setRowLayout } from '../core/ops.js';
import { safeUrl } from '../core/render.js';
import type { EditorStore } from '../core/store.js';
import type { Align, Block, Design, Padding, Row } from '../core/types.js';
import { h } from './dom.js';

export interface PanelContext {
  store: EditorStore;
  uploadImage: (file: File) => Promise<string>;
  /** Copy the current contenteditable content of a text block into the store. */
  syncText: (blockId: string) => void;
  getEditable: (blockId: string) => HTMLElement | null;
}

export const LAYOUTS: { label: string; ratios: number[] }[] = [
  { label: '1', ratios: [1] },
  { label: '1 : 1', ratios: [1, 1] },
  { label: '1 : 1 : 1', ratios: [1, 1, 1] },
  { label: '1 : 2', ratios: [1, 2] },
  { label: '2 : 1', ratios: [2, 1] },
  { label: '1 : 1 : 1 : 1', ratios: [1, 1, 1, 1] },
];

const field = (label: string, control: Node) => h('label', { class: 'mc-field' }, h('span', { class: 'mc-field-label' }, label), control);
const section = (title: string, ...kids: Node[]) => h('section', { class: 'mc-section' }, h('h4', {}, title), ...kids);

function textField(label: string, value: string, onInput: (v: string) => void, multiline = false) {
  const el = multiline
    ? h('textarea', { rows: 5, value, 'on:input': (e: Event) => onInput((e.target as HTMLTextAreaElement).value) })
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

function colorField(label: string, value: string, onInput: (v: string) => void, allowClear = false) {
  const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff' });
  color.addEventListener('input', () => onInput(color.value));
  const kids: Node[] = [color];
  if (allowClear) kids.push(h('button', { type: 'button', class: 'mc-mini', 'on:click': () => onInput('') }, 'None'));
  return field(label, h('div', { class: 'mc-color' }, ...kids));
}

function selectField<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, ...(v === value ? { selected: true } : {}) }, l)));
  sel.addEventListener('change', () => onChange(sel.value as T));
  return field(label, sel);
}

function alignField(value: Align, onChange: (v: Align) => void) {
  const items: [Align, string][] = [['left', '⬅'], ['center', '↔'], ['right', '➡']];
  const wrap = h('div', { class: 'mc-seg' });
  for (const [a, icon] of items) {
    const btn = h('button', { type: 'button', class: a === value ? 'on' : '', title: a }, icon);
    btn.addEventListener('click', () => {
      onChange(a);
      wrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
    });
    wrap.append(btn);
  }
  return field('Align', wrap);
}

function paddingFields(p: Padding, onChange: (k: keyof Padding, v: number) => void) {
  const mk = (k: keyof Padding, l: string) => {
    const i = h('input', { type: 'number', min: 0, max: 200, value: String(p[k]), title: k });
    i.addEventListener('input', () => onChange(k, Math.max(0, Math.min(200, Number(i.value) || 0))));
    return h('label', { class: 'mc-pad' }, h('span', {}, l), i);
  };
  return field('Padding (px)', h('div', { class: 'mc-pads' }, mk('top', '↑'), mk('right', '→'), mk('bottom', '↓'), mk('left', '←')));
}

export function renderPanel(ctx: PanelContext): HTMLElement {
  const { store } = ctx;
  const sel = store.selection;
  const root = h('div', { class: 'mc-panel-inner' });

  const setBlock = (id: string, key: string, v: unknown) =>
    store.change((d) => { const loc = findBlock(d, id); if (loc) (loc.block as any)[key] = v; }, { render: 'canvas', coalesceKey: `b:${id}:${key}` });
  const setBlockPad = (id: string, k: keyof Padding, v: number) =>
    store.change((d) => { const loc = findBlock(d, id); if (loc) loc.block.padding[k] = v; }, { render: 'canvas', coalesceKey: `bp:${id}:${k}` });

  if (sel.kind === 'block') {
    const loc = findBlock(store.design, sel.id);
    if (!loc) return root;
    const b = loc.block;
    const id = b.id;
    root.append(h('h3', {}, `${ICON[b.type]} ${b.type[0].toUpperCase()}${b.type.slice(1)}`));
    root.append(...blockFields(ctx, b, setBlock));
    root.append(section('Spacing', paddingFields(b.padding, (k, v) => setBlockPad(id, k, v))));
    return root;
  }

  if (sel.kind === 'row') {
    const row = findRow(store.design, sel.id);
    if (!row) return root;
    const setRow = (key: keyof Row, v: unknown) => store.change((d) => { const r = findRow(d, row.id); if (r) (r as any)[key] = v; }, { render: 'canvas', coalesceKey: `r:${row.id}:${String(key)}` });
    const layouts = h('div', { class: 'mc-layouts' }, ...LAYOUTS.map((l) =>
      h('button', {
        type: 'button', class: 'mc-layout' + (l.ratios.join() === row.ratios.join() ? ' on' : ''), title: l.label,
        'on:click': () => store.change((d) => { const r = findRow(d, row.id); if (r) setRowLayout(r, l.ratios); }),
      }, h('span', { class: 'mc-layout-prev' }, ...l.ratios.map((r) => h('i', { style: `flex:${r}` }))))));
    root.append(
      h('h3', {}, '▤ Row'),
      section('Layout', layouts, field('Stack on mobile', h('input', { type: 'checkbox', checked: row.stackOnMobile, 'on:change': (e: Event) => setRow('stackOnMobile', (e.target as HTMLInputElement).checked) }))),
      section('Style', colorField('Background', row.backgroundColor, (v) => setRow('backgroundColor', v), true),
        paddingFields(row.padding, (k, v) => store.change((d) => { const r = findRow(d, row.id); if (r) r.padding[k] = v; }, { render: 'canvas', coalesceKey: `rp:${row.id}:${k}` }))),
    );
    return root;
  }

  // body
  const setBody = (key: keyof Design['body'], v: unknown) => store.change((d) => { (d.body as any)[key] = v; }, { render: 'canvas', coalesceKey: `body:${key}` });
  const body = store.design.body;
  root.append(
    h('h3', {}, '⚙️ Email settings'),
    section('Layout', numberField('Content width', body.contentWidth, 320, 800, (v) => setBody('contentWidth', v))),
    section('Colors',
      colorField('Page background', body.backgroundColor, (v) => setBody('backgroundColor', v)),
      colorField('Content background', body.contentBackgroundColor, (v) => setBody('contentBackgroundColor', v))),
    section('Text',
      selectField('Font', Object.entries(FONT_FAMILIES).map(([l, v]) => [v, l] as [string, string]), body.fontFamily, (v) => setBody('fontFamily', v)),
      textField('Preheader', body.preheader, (v) => setBody('preheader', v))),
    h('p', { class: 'mc-hint' }, 'Select a row or block on the canvas to edit it.'),
  );
  return root;
}

export const ICON: Record<Block['type'], string> = { text: '📝', heading: '🔠', image: '🖼️', button: '🔘', divider: '➖', spacer: '↕️', html: '🧩' };

function blockFields(ctx: PanelContext, b: Block, set: (id: string, key: string, v: unknown) => void): Node[] {
  const id = b.id;
  const s = (key: string) => (v: unknown) => set(id, key, v);
  switch (b.type) {
    case 'text':
      return [
        section('Format', richToolbar(ctx, id)),
        section('Style', numberField('Font size', b.fontSize, 10, 48, s('fontSize')), numberField('Line height (×10)', Math.round(b.lineHeight * 10), 10, 30, (v) => set(id, 'lineHeight', v / 10)), colorField('Color', b.color, s('color')), alignField(b.align, s('align'))),
      ];
    case 'heading':
      return [
        section('Content', textField('Text', b.text, s('text')), selectField('Level', [['1', 'H1'], ['2', 'H2'], ['3', 'H3']], String(b.level) as '1', (v) => set(id, 'level', Number(v)))),
        section('Style', numberField('Font size', b.fontSize, 12, 64, s('fontSize')), colorField('Color', b.color, s('color')), alignField(b.align, s('align'))),
      ];
    case 'image':
      return [
        section('Image',
          textField('URL', b.src.startsWith('data:') ? '(uploaded image)' : b.src, (v) => set(id, 'src', v)),
          field('Upload', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', 'on:change': async (e: Event) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) set(id, 'src', await ctx.uploadImage(f));
            ctx.store.select(ctx.store.selection); // refresh panel
          } })),
          textField('Alt text', b.alt, s('alt')),
          textField('Link URL', b.href, s('href'))),
        section('Style', numberField('Width %', b.widthPercent, 5, 100, s('widthPercent')), alignField(b.align, s('align'))),
      ];
    case 'button':
      return [
        section('Content', textField('Label', b.text, s('text')), textField('Link URL', b.href, s('href'))),
        section('Style', colorField('Background', b.backgroundColor, s('backgroundColor')), colorField('Text color', b.color, s('color')),
          numberField('Font size', b.fontSize, 10, 32, s('fontSize')), numberField('Corner radius', b.borderRadius, 0, 40, s('borderRadius')),
          numberField('Inner padding Y', b.innerPaddingY, 0, 40, s('innerPaddingY')), numberField('Inner padding X', b.innerPaddingX, 0, 80, s('innerPaddingX')), alignField(b.align, s('align'))),
      ];
    case 'divider':
      return [section('Style', colorField('Color', b.color, s('color')), numberField('Thickness', b.thickness, 1, 10, s('thickness')))];
    case 'spacer':
      return [section('Style', numberField('Height', b.height, 4, 200, s('height')))];
    case 'html':
      return [section('Content', textField('HTML', b.html, s('html'), true), h('p', { class: 'mc-hint' }, '⚠️ Rendered as-is in the exported email. Use only trusted content.'))];
  }
}

function richToolbar(ctx: PanelContext, id: string): Node {
  const exec = (cmd: string, arg?: string) => {
    const el = ctx.getEditable(id);
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, arg);
    ctx.syncText(id);
  };
  const btn = (label: string, title: string, fn: () => void) =>
    h('button', { type: 'button', class: 'mc-mini', title, 'on:mousedown': (e: Event) => e.preventDefault(), 'on:click': fn }, label);
  return h('div', { class: 'mc-rich' },
    btn('B', 'Bold', () => exec('bold')),
    btn('I', 'Italic', () => exec('italic')),
    btn('U', 'Underline', () => exec('underline')),
    btn('• List', 'Bullet list', () => exec('insertUnorderedList')),
    btn('1. List', 'Numbered list', () => exec('insertOrderedList')),
    btn('🔗', 'Link', () => {
      const s = window.getSelection();
      const range = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const url = safeUrl(window.prompt('Link URL (https://…)') ?? '');
      if (!url || !range) return;
      const el = ctx.getEditable(id);
      el?.focus();
      s?.removeAllRanges();
      s?.addRange(range);
      exec('createLink', url);
    }),
    btn('Tx', 'Clear formatting', () => exec('removeFormat')),
  );
}
