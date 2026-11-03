import { createBlock, createDesign, createRow } from '../core/defaults.js';
import { duplicateBlock, duplicateRow, findBlock, insertBlock, insertRow, moveBlock, moveRow, removeBlock, removeRow, shiftBlock, shiftRow } from '../core/ops.js';
import { renderBlockContent, renderHtml, paddingCss } from '../core/render.js';
import { sanitizeRichText } from '../core/sanitize.js';
import { EditorStore } from '../core/store.js';
import type { Block, BlockType, Design, Row } from '../core/types.js';
import { h } from './dom.js';
import { createI18n, type I18n, type MessageKey, type Messages } from '../i18n/index.js';
import { icon, type IconName } from './icons.js';
import { BLOCK_ICON, BLOCK_LABEL, LAYOUTS, layoutPreview, renderPanel } from './panel.js';
import { applyTheme, resolveTheme, type MailcraftTheme } from './theme.js';
import './styles.css';

export interface EditorOptions {
  design?: Design;
  /** Called after every change with the latest design JSON. */
  onChange?: (design: Design) => void;
  /** Return a hosted URL for an uploaded image. Default: embed as a base64 data URL. */
  imageUploader?: (file: File) => Promise<string>;
  /** Editor chrome theme (not the email content). Partial values are merged over the light or dark preset. */
  theme?: Partial<MailcraftTheme>;
  /** UI language, e.g. "en" or "ja". Default: detected from `navigator.language`, falling back to "en". */
  locale?: string;
  /** Custom / override dictionaries per locale. Missing keys fall back to the built-in dictionary, then to English. */
  messages?: Record<string, Partial<Messages>>;
}

export interface EditorInstance {
  getDesign(): Design;
  loadDesign(design: Design): void;
  exportHtml(opts?: { title?: string }): string;
  undo(): void;
  redo(): void;
  /** Merge a partial theme into the current one and re-apply it. Does not touch the design. */
  setTheme(theme: Partial<MailcraftTheme>): void;
  getTheme(): MailcraftTheme;
  /** Switch the UI language and re-render. */
  setLocale(locale: string): void;
  getLocale(): string;
  destroy(): void;
}

type Payload =
  | { kind: 'new-block'; type: BlockType }
  | { kind: 'move-block'; id: string }
  | { kind: 'new-row'; ratios: number[] }
  | { kind: 'move-row'; id: string };

/** `block-row`: a block dropped between rows / outside any column becomes a new 1-column row. */
type DropTarget = { type: 'col'; colId: string; index: number } | { type: 'row'; index: number } | { type: 'block-row'; index: number };

type Tab = 'content' | 'rows';

const BLOCK_TYPES: BlockType[] = ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'html'];

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

export function createEditor(container: HTMLElement, options: EditorOptions = {}): EditorInstance {
  const store = new EditorStore(options.design ?? createDesign());
  let device: 'desktop' | 'mobile' = 'desktop';
  let preview = false;
  let drag: Payload | null = null;
  let dropTarget: DropTarget | null = null;
  let focusTextId: string | null = null;
  let tab: Tab = 'content';
  let i18n: I18n = createI18n(options.locale, options.messages);
  let userTheme: Partial<MailcraftTheme> = { ...(options.theme ?? {}) };
  const collapsed = new Set<string>();
  const t = (k: MessageKey, p?: Record<string, string | number>) => i18n.t(k, p);

  // ---------- skeleton ----------
  const indicator = h('div', { class: 'mc-indicator' });
  const canvas = h('div', { class: 'mc-canvas' });
  const page = h('div', { class: 'mc-page' }, canvas);
  const canvasWrap = h('div', { class: 'mc-canvas-wrap' }, page);
  const toolbar = h('div', { class: 'mc-toolbar' });
  const sidebar = h('aside', { class: 'mc-sidebar' });
  const panel = h('aside', { class: 'mc-panel' });
  const root = h('div', { class: 'mc-root', tabindex: '0' }, toolbar, h('div', { class: 'mc-main' }, sidebar, canvasWrap, panel));
  container.replaceChildren(root);
  applyTheme(root, resolveTheme(userTheme));
  root.lang = i18n.locale;

  let undoBtn: HTMLButtonElement;
  let redoBtn: HTMLButtonElement;

  function tbBtn(ic: IconName, title: string, onClick: () => void, label?: string) {
    return h('button', { type: 'button', class: 'mc-tb-btn' + (label ? ' mc-tb-text' : ''), title, 'aria-label': title, 'on:click': onClick }, icon(ic, 18), label ? h('span', {}, label) : null);
  }

  function renderToolbar() {
    undoBtn = tbBtn('undo', `${t('undo')} (Ctrl+Z)`, () => store.undo());
    redoBtn = tbBtn('redo', `${t('redo')} (Ctrl+Shift+Z)`, () => store.redo());
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    const dev = (d: 'desktop' | 'mobile') => {
      const b = tbBtn(d, t(d), () => { device = d; renderAll(); });
      b.classList.toggle('on', device === d);
      return b;
    };
    const previewBtn = tbBtn('eye', t(preview ? 'exitPreview' : 'preview'), () => { preview = !preview; renderAll(); }, t(preview ? 'exitPreview' : 'preview'));
    previewBtn.classList.toggle('on', preview);
    toolbar.replaceChildren(
      h('div', { class: 'mc-tb-group' }, undoBtn, redoBtn),
      h('div', { class: 'mc-tb-group mc-seg-tb' }, dev('desktop'), dev('mobile')),
      h('div', { class: 'mc-tb-group' }, previewBtn),
    );
  }

  function paletteItem(ic: Node, label: string, attrs: Record<string, string>, payload: Payload, onClick: () => void, title = label) {
    return h('div', {
      class: 'mc-item', draggable: 'true', role: 'button', tabindex: '0', title, ...attrs, 'on:click': onClick,
      'on:keydown': (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
      'on:dragstart': (e: DragEvent) => { drag = payload; e.dataTransfer?.setData('text/plain', label); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'; },
      'on:dragend': clearDrag,
    }, ic, h('span', { class: 'mc-item-label' }, label));
  }

  function renderContentTab() {
    return h('div', { class: 'mc-panel-inner' },
      h('p', { class: 'mc-hint' }, t('paletteContentHint')),
      h('div', { class: 'mc-palette' }, ...BLOCK_TYPES.map((bt) =>
        paletteItem(icon(BLOCK_ICON[bt], 26), t(BLOCK_LABEL[bt]), { 'data-block-type': bt }, { kind: 'new-block', type: bt }, () => addBlockByClick(bt)))));
  }

  function renderRowsTab() {
    return h('div', { class: 'mc-panel-inner' },
      h('p', { class: 'mc-hint' }, t('paletteRowsHint')),
      h('div', { class: 'mc-palette mc-palette-rows' }, ...LAYOUTS.map((l) =>
        paletteItem(layoutPreview(l.ratios), l.ratios.join(' : '), { 'data-row-layout': l.ratios.join(':') }, { kind: 'new-row', ratios: l.ratios }, () => addRowByClick(l.ratios), l.ratios.length === 1 ? t('columnCount1') : t('columnsCount', { n: l.ratios.length })))));
  }

  /** Left sidebar: the "add" tools (content tiles / row layouts). Independent of the selection. */
  function renderSidebarEl() {
    sidebar.setAttribute('aria-label', t('sidebarLabel'));
    const tabs: [Tab, IconName, string][] = [['content', 'sparkle', t('tabContent')], ['rows', 'rows', t('tabRows')]];
    sidebar.replaceChildren(
      h('div', { class: 'mc-tabs', role: 'tablist' }, ...tabs.map(([k, ic, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'mc-tab' + (k === tab ? ' on' : ''), 'aria-selected': String(k === tab), 'data-tab': k, 'on:click': () => { tab = k; renderSidebarEl(); } }, icon(ic, 20), h('span', {}, label)))),
      h('div', { class: 'mc-panel-scroll' }, tab === 'content' ? renderContentTab() : renderRowsTab()));
  }

  /** Right panel: context. Nothing selected -> email-wide (Body) settings; a row/block -> its properties. */
  function renderPanelEl() {
    const ctx = { store, i18n, syncText, getEditable, collapsed, uploadImage: options.imageUploader ?? readAsDataUrl };
    const view = store.selection.kind === 'body' ? 'body' : 'props';
    panel.dataset.view = view;
    panel.setAttribute('aria-label', t(view === 'body' ? 'panelBodyTitle' : 'tabProperties'));
    panel.replaceChildren(h('div', { class: 'mc-panel-scroll' }, renderPanel(ctx, view)));
  }

  const labels = () => ({ text: t('defaultText'), heading: t('defaultHeading'), button: t('defaultButton') });

  // ---------- actions ----------
  function addBlockByClick(type: BlockType) {
    const block = createBlock(type, labels());
    store.change((d) => {
      const s = store.selection;
      if (s.kind === 'block') {
        const loc = findBlock(d, s.id);
        if (loc) { loc.column.blocks.splice(loc.index + 1, 0, block); return; }
      }
      if (s.kind === 'row') {
        const r = d.rows.find((x) => x.id === s.id);
        if (r) { r.columns[0].blocks.push(block); return; }
      }
      if (!d.rows.length) d.rows.push(createRow([1]));
      d.rows[d.rows.length - 1].columns[0].blocks.push(block);
    });
    selectBlock(block);
  }

  function addRowByClick(ratios: number[]) {
    const row = createRow(ratios);
    store.change((d) => insertRow(d, d.rows.length, row));
    store.select({ kind: 'row', id: row.id });
  }

  function selectBlock(b: Block) {
    if (b.type === 'text') focusTextId = b.id;
    store.select({ kind: 'block', id: b.id });
  }

  function deleteSelected() {
    const s = store.selection;
    if (s.kind === 'block') store.change((d) => { removeBlock(d, s.id); });
    else if (s.kind === 'row') store.change((d) => removeRow(d, s.id));
    else return;
    store.select({ kind: 'body' });
  }

  function clearDrag() {
    drag = null;
    dropTarget = null;
    indicator.remove();
    canvas.classList.remove('mc-dragging');
  }

  function applyDrop() {
    const p = drag, t = dropTarget;
    clearDrag();
    if (!p || !t) return;
    if (t.type === 'col' && (p.kind === 'new-block' || p.kind === 'move-block')) {
      if (p.kind === 'new-block') {
        const b = createBlock(p.type, labels());
        store.change((d) => { insertBlock(d, t.colId, t.index, b); });
        selectBlock(b);
      } else {
        store.change((d) => { moveBlock(d, p.id, t.colId, t.index); });
        store.select({ kind: 'block', id: p.id });
      }
    } else if (t.type === 'block-row' && (p.kind === 'new-block' || p.kind === 'move-block')) {
      const row = createRow([1]);
      if (p.kind === 'new-block') {
        const b = createBlock(p.type, labels());
        row.columns[0].blocks.push(b);
        store.change((d) => insertRow(d, t.index, row));
        selectBlock(b);
      } else {
        store.change((d) => {
          const moved = removeBlock(d, p.id);
          if (!moved) return;
          row.columns[0].blocks.push(moved);
          insertRow(d, t.index, row);
        });
        store.select({ kind: 'block', id: p.id });
      }
    } else if (t.type === 'row' && (p.kind === 'new-row' || p.kind === 'move-row')) {
      if (p.kind === 'new-row') {
        const row = createRow(p.ratios);
        store.change((d) => insertRow(d, t.index, row));
        store.select({ kind: 'row', id: row.id });
      } else {
        store.change((d) => moveRow(d, p.id, t.index));
        store.select({ kind: 'row', id: p.id });
      }
    }
  }

  const indexByPointer = (parent: HTMLElement, selector: string, y: number) => {
    const items = Array.from(parent.querySelectorAll<HTMLElement>(`:scope > ${selector}`));
    const i = items.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { items, index: i < 0 ? items.length : i };
  };

  // ---------- canvas ----------
  function actionBtns(onUp: () => void, onDown: () => void, onDup: () => void, onDel: () => void) {
    const mk = (ic: IconName, title: string, fn: () => void) =>
      h('button', { type: 'button', title, 'aria-label': title, 'on:click': (e: Event) => { e.stopPropagation(); fn(); } }, icon(ic, 15));
    return [mk('up', t('moveUp'), onUp), mk('down', t('moveDown'), onDown), mk('copy', t('duplicate'), onDup), mk('trash', t('delete'), onDel)];
  }

  function handle(payload: Payload, dragImageOf: () => HTMLElement) {
    return h('span', {
      class: 'mc-handle', draggable: 'true', title: t('dragToMove'),
      'on:dragstart': (e: DragEvent) => { drag = payload; canvas.classList.add('mc-dragging'); e.dataTransfer?.setData('text/plain', 'move'); e.dataTransfer?.setDragImage(dragImageOf(), 0, 0); e.stopPropagation(); },
      'on:dragend': clearDrag,
    }, icon('grip', 16));
  }

  function renderBlock(b: Block): HTMLElement {
    const selected = store.selection.kind === 'block' && store.selection.id === b.id;
    const content = h('div', { class: 'mc-block-content' });
    const safe: Block = b.type === 'text' || b.type === 'html' ? { ...b, html: sanitizeRichText(b.html) } : b;
    if (b.type === 'image' && !b.src) content.append(h('div', { class: 'mc-img-ph' }, icon('image', 28), h('span', {}, t('imagePlaceholder'))));
    else content.innerHTML = renderBlockContent(safe);

    if (b.type === 'text') {
      const editable = content.firstElementChild as HTMLElement;
      editable.dataset.editable = b.id;
      if (selected && !preview) {
        editable.setAttribute('contenteditable', 'true');
        editable.addEventListener('input', () => syncText(b.id));
        if (focusTextId === b.id) { focusTextId = null; queueMicrotask(() => editable.focus()); }
      }
    }
    const el: HTMLElement = h('div', { class: 'mc-block' + (selected ? ' selected' : ''), 'data-id': b.id, style: `padding:${paddingCss(b.padding)}`, 'on:click': (e: Event) => {
      e.stopPropagation();
      if (preview || (store.selection.kind === 'block' && store.selection.id === b.id)) return;
      selectBlock(b);
    } },
      preview ? null : h('div', { class: 'mc-chrome' }, handle({ kind: 'move-block', id: b.id }, () => el), h('span', { class: 'mc-tag' }, t(BLOCK_LABEL[b.type])), ...actionBtns(
        () => store.change((d) => shiftBlock(d, b.id, -1)), () => store.change((d) => shiftBlock(d, b.id, 1)),
        () => store.change((d) => { duplicateBlock(d, b.id); }), deleteSelectedOrThis(b.id))),
      content);
    return el;
  }

  function deleteSelectedOrThis(id: string) {
    return () => { store.change((d) => { removeBlock(d, id); }); store.select({ kind: 'body' }); };
  }

  function renderRowEl(row: Row): HTMLElement {
    const selected = store.selection.kind === 'row' && store.selection.id === row.id;
    const cols = row.columns.map((col, i) => {
      const colEl = h('div', { class: 'mc-col', 'data-col': col.id, style: `flex:${row.ratios[i]} 1 0` },
        ...(col.blocks.length ? col.blocks.map(renderBlock) : [h('div', { class: 'mc-empty-col' }, icon('plus', 16), h('span', {}, t('dropBlockHere')))]));
      return colEl;
    });
    const el: HTMLElement = h('div', { class: 'mc-row' + (selected ? ' selected' : ''), 'data-id': row.id, 'on:click': () => { if (!preview) store.select({ kind: 'row', id: row.id }); } },
      preview ? null : h('div', { class: 'mc-chrome mc-chrome-row' }, handle({ kind: 'move-row', id: row.id }, () => el), h('span', { class: 'mc-tag' }, t('rowName')), ...actionBtns(
        () => store.change((d) => shiftRow(d, row.id, -1)), () => store.change((d) => shiftRow(d, row.id, 1)),
        () => store.change((d) => { duplicateRow(d, row.id); }),
        () => { store.change((d) => removeRow(d, row.id)); store.select({ kind: 'body' }); })),
      h('div', { class: 'mc-row-inner' + (row.stackOnMobile ? ' stack' : ''), style: `background:${row.backgroundColor || 'transparent'};padding:${paddingCss(row.padding)}` }, ...cols));
    return el;
  }

  function renderCanvas() {
    const d = store.design;
    page.style.background = d.body.backgroundColor;
    canvas.className = 'mc-canvas' + (device === 'mobile' ? ' mc-mobile' : '') + (preview ? ' mc-preview' : '');
    canvas.style.cssText = `width:${device === 'mobile' ? 375 : d.body.contentWidth}px;background:${d.body.contentBackgroundColor};font-family:${d.body.fontFamily}`;
    canvas.replaceChildren(...(d.rows.length ? d.rows.map(renderRowEl) : [h('div', { class: 'mc-empty-canvas' }, h('span', { class: 'mc-empty-ico' }, icon('sparkle', 28)), h('strong', {}, t('emptyCanvasTitle')), h('span', {}, t('emptyCanvasHint')))]));
    root.classList.toggle('mc-previewing', preview);
    renderToolbar();
  }

  /** Work out the drop target under the pointer and move the indicator there. Returns false when nothing is droppable. */
  function updateDropTarget(e: DragEvent): boolean {
    if (!drag) return false;
    const isBlock = drag.kind === 'new-block' || drag.kind === 'move-block';
    const colEl = isBlock ? (e.target as HTMLElement).closest?.<HTMLElement>('.mc-col') : null;
    if (colEl && canvas.contains(colEl) && colEl.dataset.col) {
      const { items, index } = indexByPointer(colEl, '.mc-block', e.clientY);
      dropTarget = { type: 'col', colId: colEl.dataset.col, index };
      colEl.insertBefore(indicator, items[index] ?? null);
      return true;
    }
    // Row level: row tiles / moved rows, or a block released outside every column (-> new 1-column row).
    const { items, index } = indexByPointer(canvas, '.mc-row', e.clientY);
    dropTarget = isBlock ? { type: 'block-row', index } : { type: 'row', index };
    canvas.insertBefore(indicator, items[index] ?? null);
    return true;
  }
  canvasWrap.addEventListener('dragover', (e) => {
    if (updateDropTarget(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = drag?.kind.startsWith('move') ? 'move' : 'copy'; }
  });
  canvasWrap.addEventListener('dragleave', (e) => {
    const to = e.relatedTarget as Node | null;
    if (!to || !canvasWrap.contains(to)) { dropTarget = null; indicator.remove(); }
  });
  canvasWrap.addEventListener('drop', (e) => { e.preventDefault(); applyDrop(); });
  // Whatever happens (cancelled drop, drop outside the canvas), never leave a stale indicator or drag state behind.
  const onDragEnd = () => clearDrag();
  document.addEventListener('dragend', onDragEnd, true);
  document.addEventListener('drop', onDragEnd);
  canvas.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault(); });
  canvasWrap.addEventListener('click', (e) => { if (e.target === canvasWrap || e.target === page || e.target === canvas) store.select({ kind: 'body' }); });

  // ---------- text sync ----------
  function getEditable(id: string) {
    return canvas.querySelector<HTMLElement>(`[data-editable="${id}"]`);
  }
  function syncText(id: string) {
    const el = getEditable(id);
    if (!el) return;
    const html = sanitizeRichText(el.innerHTML);
    store.change((d) => { const loc = findBlock(d, id); if (loc && loc.block.type === 'text') loc.block.html = html; }, { render: 'none', coalesceKey: `text:${id}` });
    undoBtn.disabled = !store.canUndo;
  }

  function renderAll() {
    renderCanvas();
    renderSidebarEl();
    renderPanelEl();
  }

  const unsubscribe = store.subscribe((scope) => {
    if (scope === 'all') {
      // The palette (left) is selection-independent and is left untouched so a finished drag never replaces its own source tile.
      renderCanvas();
      renderPanelEl();
    }
    else if (scope === 'canvas') renderCanvas();
    options.onChange?.(structuredClone(store.design));
  });

  // ---------- keyboard ----------
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t.matches('input, textarea, select') || t.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (typing && t.isContentEditable === false) return; // let native inputs undo themselves
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
    else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); }
  });

  renderAll();

  return {
    getDesign: () => structuredClone(store.design),
    loadDesign: (d) => store.replace(d),
    exportHtml: (opts) => renderHtml(store.design, opts),
    undo: () => store.undo(),
    redo: () => store.redo(),
    setTheme: (patch) => {
      userTheme = { ...userTheme, ...patch };
      applyTheme(root, resolveTheme(userTheme));
    },
    getTheme: () => resolveTheme(userTheme),
    setLocale: (code) => {
      i18n = createI18n(code, options.messages);
      root.lang = i18n.locale;
      renderAll();
    },
    getLocale: () => i18n.locale,
    destroy: () => { unsubscribe(); document.removeEventListener('dragend', onDragEnd, true); document.removeEventListener('drop', onDragEnd); container.replaceChildren(); },
  };
}
