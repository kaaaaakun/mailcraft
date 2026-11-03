import { createBlock, createDesign, createRow } from '../core/defaults';
import { duplicateBlock, duplicateRow, findBlock, insertBlock, insertRow, moveBlock, moveRow, removeBlock, removeRow, shiftBlock, shiftRow } from '../core/ops';
import { renderBlockContent, renderHtml, paddingCss } from '../core/render';
import { sanitizeRichText } from '../core/sanitize';
import { EditorStore } from '../core/store';
import type { Block, BlockType, Design, Row } from '../core/types';
import { h } from './dom';
import { ICON, LAYOUTS, renderPanel } from './panel';
import './styles.css';

export interface EditorOptions {
  design?: Design;
  /** Called after every change with the latest design JSON. */
  onChange?: (design: Design) => void;
  /** Return a hosted URL for an uploaded image. Default: embed as a base64 data URL. */
  imageUploader?: (file: File) => Promise<string>;
}

export interface EditorInstance {
  getDesign(): Design;
  loadDesign(design: Design): void;
  exportHtml(opts?: { title?: string }): string;
  undo(): void;
  redo(): void;
  destroy(): void;
}

type Payload =
  | { kind: 'new-block'; type: BlockType }
  | { kind: 'move-block'; id: string }
  | { kind: 'new-row'; ratios: number[] }
  | { kind: 'move-row'; id: string };

type DropTarget = { type: 'col'; colId: string; index: number } | { type: 'row'; index: number } | { type: 'first-row' };

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

  // ---------- skeleton ----------
  const indicator = h('div', { class: 'mc-indicator' });
  const canvas = h('div', { class: 'mc-canvas' });
  const canvasWrap = h('div', { class: 'mc-canvas-wrap' }, canvas);
  const panel = h('aside', { class: 'mc-panel' });
  const undoBtn = h('button', { type: 'button', title: 'Undo (Ctrl+Z)', 'on:click': () => store.undo() }, '↶');
  const redoBtn = h('button', { type: 'button', title: 'Redo (Ctrl+Shift+Z)', 'on:click': () => store.redo() }, '↷');
  const deviceBtns = {
    desktop: h('button', { type: 'button', title: 'Desktop', 'on:click': () => { device = 'desktop'; renderAll(); } }, '🖥️'),
    mobile: h('button', { type: 'button', title: 'Mobile', 'on:click': () => { device = 'mobile'; renderAll(); } }, '📱'),
  };
  const previewBtn = h('button', { type: 'button', title: 'Preview', 'on:click': () => { preview = !preview; renderAll(); } }, '👁️ Preview');
  const toolbar = h('div', { class: 'mc-toolbar' }, undoBtn, redoBtn, h('span', { class: 'mc-sep' }), deviceBtns.desktop, deviceBtns.mobile, h('span', { class: 'mc-sep' }), previewBtn);

  const sidebar = h('aside', { class: 'mc-sidebar' },
    h('h4', {}, 'Blocks'),
    h('div', { class: 'mc-palette' }, ...BLOCK_TYPES.map((t) => paletteItem(`${ICON[t]} ${t}`, { kind: 'new-block', type: t }, () => addBlockByClick(t)))),
    h('h4', {}, 'Rows'),
    h('div', { class: 'mc-palette' }, ...LAYOUTS.map((l) =>
      paletteItem(`▤ ${l.label}`, { kind: 'new-row', ratios: l.ratios }, () => addRowByClick(l.ratios)))),
  );

  const root = h('div', { class: 'mc-root', tabindex: '0' }, toolbar, h('div', { class: 'mc-main' }, sidebar, canvasWrap, panel));
  container.replaceChildren(root);

  function paletteItem(label: string, payload: Payload, onClick: () => void) {
    return h('div', {
      class: 'mc-item', draggable: 'true', 'on:click': onClick,
      'on:dragstart': (e: DragEvent) => { drag = payload; e.dataTransfer?.setData('text/plain', label); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'; },
      'on:dragend': clearDrag,
    }, label);
  }

  // ---------- actions ----------
  function addBlockByClick(type: BlockType) {
    const block = createBlock(type);
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
        const b = createBlock(p.type);
        store.change((d) => { insertBlock(d, t.colId, t.index, b); });
        selectBlock(b);
      } else {
        store.change((d) => { moveBlock(d, p.id, t.colId, t.index); });
        store.select({ kind: 'block', id: p.id });
      }
    } else if (t.type === 'first-row' && p.kind === 'new-block') {
      const row = createRow([1]);
      const b = createBlock(p.type);
      row.columns[0].blocks.push(b);
      store.change((d) => insertRow(d, 0, row));
      selectBlock(b);
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
    const mk = (l: string, title: string, fn: () => void) => h('button', { type: 'button', title, 'on:click': (e: Event) => { e.stopPropagation(); fn(); } }, l);
    return [mk('↑', 'Move up', onUp), mk('↓', 'Move down', onDown), mk('⧉', 'Duplicate', onDup), mk('🗑', 'Delete', onDel)];
  }

  function handle(payload: Payload, dragImageOf: () => HTMLElement) {
    return h('span', {
      class: 'mc-handle', draggable: 'true', title: 'Drag to move',
      'on:dragstart': (e: DragEvent) => { drag = payload; canvas.classList.add('mc-dragging'); e.dataTransfer?.setData('text/plain', 'move'); e.dataTransfer?.setDragImage(dragImageOf(), 0, 0); e.stopPropagation(); },
      'on:dragend': clearDrag,
    }, '⠿');
  }

  function renderBlock(b: Block): HTMLElement {
    const selected = store.selection.kind === 'block' && store.selection.id === b.id;
    const content = h('div', { class: 'mc-block-content' });
    const safe: Block = b.type === 'text' || b.type === 'html' ? { ...b, html: sanitizeRichText(b.html) } : b;
    if (b.type === 'image' && !b.src) content.append(h('div', { class: 'mc-img-ph' }, '🖼️ Select an image in the panel →'));
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
      preview ? null : h('div', { class: 'mc-chrome' }, handle({ kind: 'move-block', id: b.id }, () => el), ...actionBtns(
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
        ...(col.blocks.length ? col.blocks.map(renderBlock) : [h('div', { class: 'mc-empty-col' }, 'Drop a block here')]));
      colEl.addEventListener('dragover', (e) => {
        if (!drag || (drag.kind !== 'new-block' && drag.kind !== 'move-block')) return;
        e.preventDefault(); e.stopPropagation();
        const { items, index } = indexByPointer(colEl, '.mc-block', (e as DragEvent).clientY);
        dropTarget = { type: 'col', colId: col.id, index };
        colEl.insertBefore(indicator, items[index] ?? null);
      });
      colEl.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); applyDrop(); });
      return colEl;
    });
    const el: HTMLElement = h('div', { class: 'mc-row' + (selected ? ' selected' : ''), 'data-id': row.id, 'on:click': () => { if (!preview) store.select({ kind: 'row', id: row.id }); } },
      preview ? null : h('div', { class: 'mc-chrome mc-chrome-row' }, handle({ kind: 'move-row', id: row.id }, () => el), h('span', { class: 'mc-tag' }, 'Row'), ...actionBtns(
        () => store.change((d) => shiftRow(d, row.id, -1)), () => store.change((d) => shiftRow(d, row.id, 1)),
        () => store.change((d) => { duplicateRow(d, row.id); }),
        () => { store.change((d) => removeRow(d, row.id)); store.select({ kind: 'body' }); })),
      h('div', { class: 'mc-row-inner' + (row.stackOnMobile ? ' stack' : ''), style: `background:${row.backgroundColor || 'transparent'};padding:${paddingCss(row.padding)}` }, ...cols));
    return el;
  }

  function renderCanvas() {
    const d = store.design;
    canvasWrap.style.background = d.body.backgroundColor;
    canvas.className = 'mc-canvas' + (device === 'mobile' ? ' mc-mobile' : '') + (preview ? ' mc-preview' : '');
    canvas.style.cssText = `width:${device === 'mobile' ? 375 : d.body.contentWidth}px;background:${d.body.contentBackgroundColor};font-family:${d.body.fontFamily}`;
    canvas.replaceChildren(...(d.rows.length ? d.rows.map(renderRowEl) : [h('div', { class: 'mc-empty-canvas' }, '✨ Drag a block or a row here to get started')]));
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    deviceBtns.desktop.classList.toggle('on', device === 'desktop');
    deviceBtns.mobile.classList.toggle('on', device === 'mobile');
    previewBtn.classList.toggle('on', preview);
    root.classList.toggle('mc-previewing', preview);
  }

  canvas.addEventListener('dragover', (e) => {
    if (!drag) return;
    if (drag.kind === 'new-row' || drag.kind === 'move-row') {
      e.preventDefault();
      const { items, index } = indexByPointer(canvas, '.mc-row', e.clientY);
      dropTarget = { type: 'row', index };
      canvas.insertBefore(indicator, items[index] ?? null);
    } else if (!store.design.rows.length) {
      e.preventDefault();
      dropTarget = { type: 'first-row' };
    }
  });
  canvas.addEventListener('drop', (e) => { e.preventDefault(); applyDrop(); });
  canvas.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault(); });
  canvasWrap.addEventListener('click', (e) => { if (e.target === canvasWrap || e.target === canvas) store.select({ kind: 'body' }); });

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

  // ---------- panel ----------
  function renderPanelEl() {
    panel.replaceChildren(renderPanel({
      store, syncText, getEditable,
      uploadImage: options.imageUploader ?? readAsDataUrl,
    }));
  }

  function renderAll() {
    renderCanvas();
    renderPanelEl();
  }

  const unsubscribe = store.subscribe((scope) => {
    if (scope === 'all') renderAll();
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
    destroy: () => { unsubscribe(); container.replaceChildren(); },
  };
}
