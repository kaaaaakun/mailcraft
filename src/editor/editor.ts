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
import { caretOffset, cleanRichHtml, normalizePasted, setCaretOffset } from './richtext.js';
import { formatBytes, resolveMaxBytes, validateImageFile, type UploadResult } from './upload.js';
import { cloneLayout, defaultLayout, mergeLayout, resolveLayout, type MailcraftLayout, type MailcraftLayoutInput, type ResolvedLayout } from './layout.js';
import { applyTheme, resolveTheme, type MailcraftTheme } from './theme.js';
import './styles.css';

export interface EditorOptions {
  design?: Design;
  /** Called after every change with the latest design JSON. */
  onChange?: (design: Design) => void;
  /** Return a hosted URL for an uploaded image. Default: embed as a base64 data URL. Errors/rejections are caught and shown inline. */
  imageUploader?: (file: File) => Promise<string>;
  /** Largest accepted image file in bytes (checked before `imageUploader` / FileReader run). Default 5 MB. Allowed types: PNG, JPEG, GIF, WebP. */
  maxImageBytes?: number;
  /** Editor chrome theme (not the email content). Partial values are merged over the light or dark preset. */
  theme?: Partial<MailcraftTheme>;
  /** UI language, e.g. "en" or "ja". Default: detected from `navigator.language`, falling back to "en". */
  locale?: string;
  /** Custom / override dictionaries per locale. Missing keys fall back to the built-in dictionary, then to English. */
  messages?: Record<string, Partial<Messages>>;
  /** Pane arrangement. Switches by the editor's container width by default (`mode: 'auto'`). Invalid values are ignored. */
  layout?: MailcraftLayoutInput;
  /** Called when the resolved arrangement changes (not for the initial one; read `getResolvedLayout()` for that). */
  onLayoutChange?: (mode: ResolvedLayout) => void;
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
  /** Merge a partial layout into the current one (like `setTheme`). Does not touch the design or the selection. */
  setLayout(layout: MailcraftLayoutInput): void;
  getLayout(): MailcraftLayout;
  /** The arrangement currently in effect (`data-layout` on the root). */
  getResolvedLayout(): ResolvedLayout;
  destroy(): void;
}

type Payload =
  | { kind: 'new-block'; type: BlockType }
  | { kind: 'move-block'; id: string }
  | { kind: 'new-row'; ratios: number[] }
  | { kind: 'move-row'; id: string };

/** `block-row`: a block dropped between rows / outside any column becomes a new 1-column row. */
type DropTarget = { type: 'col'; colId: string; index: number } | { type: 'row'; index: number } | { type: 'block-row'; index: number } | { type: 'noop' };

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
  let layout: MailcraftLayout = mergeLayout(defaultLayout, options.layout);
  let containerWidth = 0;
  let resolved: ResolvedLayout = 'wide';
  const collapsed = new Set<string>();
  const uploading = new Set<string>(); // image block ids with an upload in flight
  const maxImageBytes = resolveMaxBytes(options.maxImageBytes);
  let interacted = false; // was the last pointer/focus interaction inside this editor? (keyboard scope when nothing is focused)
  let focusOverride: string | null = null; // where focus should land after the next render
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let liveToggle = false;
  const t = (k: MessageKey, p?: Record<string, string | number>) => i18n.t(k, p);

  // ---------- skeleton ----------
  const indicator = h('div', { class: 'mc-indicator' });
  const canvas = h('div', { class: 'mc-canvas' });
  const page = h('div', { class: 'mc-page' }, canvas);
  const canvasWrap = h('div', { class: 'mc-canvas-wrap' }, page);
  const toolbar = h('div', { class: 'mc-toolbar' });
  const sidebar = h('aside', { class: 'mc-sidebar' });
  const panel = h('aside', { class: 'mc-panel' });
  const notices = h('div', { class: 'mc-notices' });
  const live = h('div', { class: 'mc-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const root = h('div', { class: 'mc-root', tabindex: '0' }, toolbar, h('div', { class: 'mc-main' }, sidebar, canvasWrap, panel), notices, live);
  container.replaceChildren(root);
  applyTheme(root, resolveTheme(userTheme));
  root.lang = i18n.locale;

  // ---------- layout (container-width driven; see docs/ARCHITECTURE.md) ----------
  function applyLayout(notify: boolean) {
    sidebar.hidden = !layout.sidebars.left;
    panel.hidden = !layout.sidebars.right;
    root.style.setProperty('--mc-left-w', `${layout.leftWidth}px`);
    root.style.setProperty('--mc-right-w', `${layout.rightWidth}px`);
    const next = resolveLayout(layout, containerWidth);
    root.dataset.layout = next;
    if (next !== resolved) { resolved = next; if (notify) options.onLayoutChange?.(next); }
  }
  const measure = () => { containerWidth = root.getBoundingClientRect().width || root.clientWidth || 0; };
  const onWindowResize = () => { measure(); applyLayout(true); schedulePlace(); };
  let resizeObserver: ResizeObserver | null = null;
  measure();
  applyLayout(false);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect?.width;
      containerWidth = typeof w === 'number' ? w : root.clientWidth;
      applyLayout(true);
      schedulePlace();
    });
    resizeObserver.observe(root);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize); // graceful fallback: viewport resize re-measures the container
  }

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
    const selectTab = (k: Tab) => { tab = k; renderSidebarEl(); sidebar.querySelector<HTMLElement>(`[data-tab="${k}"]`)?.focus(); };
    sidebar.replaceChildren(
      h('div', { class: 'mc-tabs', role: 'tablist', 'aria-orientation': 'horizontal' }, ...tabs.map(([k, ic, label], i) =>
        h('button', {
          type: 'button', role: 'tab', class: 'mc-tab' + (k === tab ? ' on' : ''), title: label, 'aria-selected': String(k === tab), tabindex: k === tab ? '0' : '-1', 'data-tab': k,
          'on:click': () => selectTab(k),
          // WAI-ARIA tabs: arrows move (and activate) the tab, Home/End jump
          'on:keydown': (e: KeyboardEvent) => {
            const n = tabs.length;
            const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
            if (to < 0) return;
            e.preventDefault();
            selectTab(tabs[to][0]);
          },
        }, icon(ic, 20), h('span', {}, label)))),
      h('div', { class: 'mc-panel-scroll', role: 'tabpanel', 'aria-label': tabs.find(([k]) => k === tab)![2] }, tab === 'content' ? renderContentTab() : renderRowsTab()));
  }

  /** Right panel: context. Nothing selected -> email-wide (Body) settings; a row/block -> its properties. */
  function renderPanelEl() {
    const ctx = { store, i18n, syncText, getEditable, collapsed, upload: uploadFile, announce };
    const view = store.selection.kind === 'body' ? 'body' : 'props';
    panel.dataset.view = view;
    panel.setAttribute('aria-label', t(view === 'body' ? 'panelBodyTitle' : 'tabProperties'));
    panel.replaceChildren(h('div', { class: 'mc-panel-scroll' }, renderPanel(ctx, view)));
  }

  const labels = () => ({ text: t('defaultText'), heading: t('defaultHeading'), button: t('defaultButton') });

  // ---------- announcements, notices ----------
  function announce(msg: string) {
    liveToggle = !liveToggle;
    live.textContent = msg + (liveToggle ? '' : '\u200b'); // a changed string is re-announced even when the text repeats
  }
  function showNotice(msgs: string[]) {
    clearTimeout(noticeTimer);
    const close = h('button', { type: 'button', class: 'mc-notice-x', title: t('dismiss'), 'aria-label': t('dismiss'), 'on:click': () => notices.replaceChildren() }, '×');
    notices.replaceChildren(h('div', { class: 'mc-notice', role: 'alert' }, icon('warn', 16), h('div', { class: 'mc-notice-msg' }, ...msgs.map((m) => h('p', {}, m))), close));
    noticeTimer = setTimeout(() => notices.replaceChildren(), 8000);
  }
  const itemName = (kind: 'block' | 'row', id: string): string => {
    if (kind === 'row') return t('rowName');
    const loc = findBlock(store.design, id);
    return loc ? t(BLOCK_LABEL[loc.block.type]) : t('rowName');
  };

  // ---------- focus management: a re-render must never strand keyboard focus outside the editor ----------
  const isEditing = (el: Element | null) => !!el?.closest?.('[contenteditable="true"]'); // (jsdom has no `isContentEditable`)
  const FOCUSABLE = 'button, input, select, textarea, summary, [tabindex]';
  const regions: [string, HTMLElement][] = [['toolbar', toolbar], ['sidebar', sidebar], ['panel', panel]];
  interface FocusSnap { el: HTMLElement; key: string | null; caret: number | null }
  const itemKey = (id: string) => `item:${id}`;

  function captureFocus(): FocusSnap | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === root || !root.contains(a)) return null;
    let key: string | null = null;
    let caret: number | null = null;
    const ed = a.closest<HTMLElement>('[data-editable]');
    if (ed && canvas.contains(ed) && isEditing(a)) { key = `ed:${ed.dataset.editable}`; caret = caretOffset(ed); }
    else if (canvas.contains(a)) {
      const item = a.closest<HTMLElement>('.mc-block, .mc-row');
      const act = a.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (item?.dataset.id) key = act && a !== item ? `act:${item.dataset.id}:${act}` : itemKey(item.dataset.id);
    } else {
      for (const [name, el] of regions) if (el.contains(a)) key = `r:${name}:${Array.from(el.querySelectorAll(FOCUSABLE)).indexOf(a)}`;
    }
    return { el: a, key, caret };
  }
  function resolveFocusKey(key: string): HTMLElement | null {
    const [kind, a, b] = key.split(':');
    const byId = (id: string) => canvas.querySelector<HTMLElement>(`:is(.mc-block, .mc-row)[data-id="${id}"]`);
    if (kind === 'item') return byId(a);
    if (kind === 'ed') { const e = getEditable(a); return e && isEditing(e) ? e : byId(canvas.querySelector(`[data-editable="${a}"]`)?.closest<HTMLElement>('.mc-block')?.dataset.id ?? a); }
    if (kind === 'act') return byId(a)?.querySelector<HTMLElement>(`:scope > .mc-chrome [data-act="${b}"]`) ?? byId(a);
    if (kind === 'r') {
      const el = regions.find(([n]) => n === a)?.[1];
      const list = el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
      return list.length ? list[Math.max(0, Math.min(Number(b), list.length - 1))] : null;
    }
    return null;
  }
  function restoreFocus(snap: FocusSnap | null) {
    const override = focusOverride;
    focusOverride = null;
    const key = override ?? snap?.key ?? null;
    if (!key) { if (snap && !snap.el.isConnected && !root.contains(document.activeElement)) root.focus({ preventScroll: true }); return; }
    if (!override && snap && snap.el.isConnected) return; // untouched by this render
    let el = resolveFocusKey(key);
    if (el) el.focus({ preventScroll: true });
    if (!el || document.activeElement !== el) { // target gone or not focusable (e.g. a now-disabled button): fall back to the roving tab stop, then the root
      el = canvas.querySelector<HTMLElement>('[tabindex="0"]');
      el?.focus({ preventScroll: true });
      if (!el || document.activeElement !== el) root.focus({ preventScroll: true });
      return;
    }
    if (snap?.caret != null && !override && key.startsWith('ed:')) setCaretOffset(el, snap.caret);
  }
  function withFocus(fn: () => void) {
    const snap = captureFocus();
    fn();
    restoreFocus(snap);
  }

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
    announce(t('annAdded', { name: t(BLOCK_LABEL[type]) }));
  }

  function addRowByClick(ratios: number[]) {
    const row = createRow(ratios);
    store.change((d) => insertRow(d, d.rows.length, row));
    store.select({ kind: 'row', id: row.id });
    announce(t('annAdded', { name: t('rowName') }));
  }

  function selectBlock(b: Block) {
    if (b.type === 'text') focusTextId = b.id;
    store.select({ kind: 'block', id: b.id });
  }

  /** The sibling (or parent row) that should receive focus when `id` disappears. */
  function neighborFocusKey(id: string): string | null {
    const el = canvas.querySelector<HTMLElement>(`:is(.mc-block, .mc-row)[data-id="${id}"]`);
    if (!el) return null;
    const isItem = (n: Element | null): n is HTMLElement => !!n && (n.classList.contains('mc-block') || n.classList.contains('mc-row'));
    const near = [el.nextElementSibling, el.previousElementSibling].find(isItem);
    const fallback = el.parentElement?.closest<HTMLElement>('.mc-row');
    const target = near ?? fallback;
    return target?.dataset.id ? itemKey(target.dataset.id) : null;
  }

  function deleteItem(kind: 'block' | 'row', id: string) {
    const name = itemName(kind, id);
    focusOverride = neighborFocusKey(id);
    if (kind === 'block') store.change((d) => { removeBlock(d, id); });
    else store.change((d) => removeRow(d, id));
    store.select({ kind: 'body' });
    announce(t('annDeleted', { name }));
  }
  function duplicateItem(kind: 'block' | 'row', id: string) {
    const name = itemName(kind, id);
    store.change((d) => { if (kind === 'block') duplicateBlock(d, id); else duplicateRow(d, id); });
    announce(t('annAdded', { name }));
  }
  function moveItem(kind: 'block' | 'row', id: string, delta: -1 | 1) {
    const name = itemName(kind, id);
    store.change((d) => { if (kind === 'block') shiftBlock(d, id, delta); else shiftRow(d, id, delta); });
    const loc = kind === 'block' ? findBlock(store.design, id) : null;
    const n = kind === 'block' ? (loc ? loc.index + 1 : 0) : store.design.rows.findIndex((r) => r.id === id) + 1;
    const total = kind === 'block' ? (loc ? loc.column.blocks.length : 0) : store.design.rows.length;
    announce(t('annMoved', { name, n, total }));
  }
  function selectParentRow(blockId: string) {
    const rowId = canvas.querySelector<HTMLElement>(`.mc-block[data-id="${blockId}"]`)?.closest<HTMLElement>('.mc-row')?.dataset.id;
    if (!rowId) return;
    focusOverride = itemKey(rowId);
    store.select({ kind: 'row', id: rowId });
    announce(t('annSelected', { name: t('rowName') }));
  }
  function deselect() {
    const s = store.selection;
    if (s.kind === 'body') return;
    focusOverride = itemKey(s.id);
    store.select({ kind: 'body' });
  }

  function clearDrag() {
    drag = null;
    dropTarget = null;
    indicator.remove();
    canvas.classList.remove('mc-dragging');
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  /** The thing being dragged: an internal payload, or (when nothing internal is active) files from the OS, which become image blocks. */
  const payloadOf = (e: DragEvent): Payload | null => drag ?? (hasFiles(e) ? { kind: 'new-block', type: 'image' } : null);

  function applyDrop(p: Payload | null, target: DropTarget | null, files: File[] = []) {
    clearDrag();
    if (!p || !target || target.type === 'noop') return;
    if (target.type === 'col' && (p.kind === 'new-block' || p.kind === 'move-block')) {
      if (p.kind === 'new-block') {
        const blocks = newBlocks(p.type, files);
        store.change((d) => { blocks.forEach((b, i) => insertBlock(d, target.colId, target.index + i, b)); });
        selectBlock(blocks[blocks.length - 1]);
        announce(t('annAdded', { name: t(BLOCK_LABEL[blocks[0].type]) }));
        uploadInto(blocks, files);
      } else {
        const name = itemName('block', p.id);
        store.change((d) => { moveBlock(d, p.id, target.colId, target.index); });
        store.select({ kind: 'block', id: p.id });
        announce(t('annMoved', { name, ...positionOf(p.id) }));
      }
    } else if (target.type === 'block-row' && (p.kind === 'new-block' || p.kind === 'move-block')) {
      const row = createRow([1]);
      if (p.kind === 'new-block') {
        const blocks = newBlocks(p.type, files);
        row.columns[0].blocks.push(...blocks);
        store.change((d) => insertRow(d, target.index, row));
        selectBlock(blocks[blocks.length - 1]);
        announce(t('annAdded', { name: t(BLOCK_LABEL[blocks[0].type]) }));
        uploadInto(blocks, files);
      } else {
        const name = itemName('block', p.id);
        store.change((d) => {
          const moved = removeBlock(d, p.id);
          if (!moved) return;
          row.columns[0].blocks.push(moved);
          insertRow(d, target.index, row);
        });
        store.select({ kind: 'block', id: p.id });
        announce(t('annMoved', { name, ...positionOf(p.id) }));
      }
    } else if (target.type === 'row' && (p.kind === 'new-row' || p.kind === 'move-row')) {
      if (p.kind === 'new-row') {
        const row = createRow(p.ratios);
        store.change((d) => insertRow(d, target.index, row));
        store.select({ kind: 'row', id: row.id });
        announce(t('annAdded', { name: t('rowName') }));
      } else {
        store.change((d) => moveRow(d, p.id, target.index));
        store.select({ kind: 'row', id: p.id });
        announce(t('annMoved', { name: t('rowName'), n: store.design.rows.findIndex((r) => r.id === p.id) + 1, total: store.design.rows.length }));
      }
    }
  }

  /** One fresh block, or one image block per dropped file. */
  const newBlocks = (type: BlockType, files: File[]): Block[] =>
    files.length ? files.map(() => createBlock('image', labels())) : [createBlock(type, labels())];

  /** Validate, upload (uploader errors / rejections are caught) and normalise to a result with a localized message. */
  async function uploadFile(file: File): Promise<UploadResult> {
    const params = { name: file.name, max: formatBytes(maxImageBytes) };
    const bad = validateImageFile(file, maxImageBytes);
    if (bad) return { ok: false, error: bad, message: t(bad, params) };
    try {
      const src = await (options.imageUploader ?? readAsDataUrl)(file);
      if (typeof src === 'string' && src) return { ok: true, src };
    } catch { /* fall through to the generic failure */ }
    return { ok: false, error: 'uploadErrFailed', message: t('uploadErrFailed', params) };
  }

  function uploadInto(blocks: Block[], files: File[]) {
    if (!files.length) return;
    blocks.forEach((b) => uploading.add(b.id));
    withFocus(renderCanvas);
    const errors: string[] = [];
    Promise.all(files.map(async (f, i) => {
      const res = await uploadFile(f);
      uploading.delete(blocks[i].id);
      if (res.ok) store.change((d) => {
        const loc = findBlock(d, blocks[i].id);
        if (loc && loc.block.type === 'image') { loc.block.src = res.src; loc.block.alt = f.name.replace(/\.[^.]+$/, ''); }
      });
      else errors.push(res.message);
    })).then(() => { if (errors.length) { withFocus(renderCanvas); showNotice(errors); } });
  }

  const positionOf = (id: string) => {
    const loc = findBlock(store.design, id);
    return { n: loc ? loc.index + 1 : 0, total: loc ? loc.column.blocks.length : 0 };
  };

  const indexByPointer = (parent: HTMLElement, selector: string, y: number) => {
    const items = Array.from(parent.querySelectorAll<HTMLElement>(`:scope > ${selector}`));
    const i = items.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { items, index: i < 0 ? items.length : i };
  };

  // ---------- canvas ----------
  function actionBtns(kind: 'block' | 'row', id: string) {
    const mk = (act: string, ic: IconName, title: string, fn: () => void) =>
      h('button', { type: 'button', title, 'aria-label': title, 'data-act': act, 'on:click': (e: Event) => { e.stopPropagation(); fn(); } }, icon(ic, 15));
    return [
      ...(kind === 'block' ? [mk('select-parent', 'rows', t('selectParentRow'), () => selectParentRow(id))] : []),
      mk('up', 'up', t('moveUp'), () => moveItem(kind, id, -1)),
      mk('down', 'down', t('moveDown'), () => moveItem(kind, id, 1)),
      mk('dup', 'copy', t('duplicate'), () => duplicateItem(kind, id)),
      mk('del', 'trash', t('delete'), () => deleteItem(kind, id)),
    ];
  }

  function handle(payload: Payload, dragImageOf: () => HTMLElement) {
    return h('span', {
      class: 'mc-handle', draggable: 'true', title: t('dragToMove'), role: 'button', 'aria-label': t('dragHandleLabel'), 'data-act': 'handle',
      'on:dragstart': (e: DragEvent) => { drag = payload; canvas.classList.add('mc-dragging'); e.dataTransfer?.setData('text/plain', 'move'); e.dataTransfer?.setDragImage(dragImageOf(), 0, 0); e.stopPropagation(); },
      'on:dragend': clearDrag,
    }, icon('grip', 16));
  }

  function renderBlock(b: Block): HTMLElement {
    const selected = store.selection.kind === 'block' && store.selection.id === b.id;
    const content = h('div', { class: 'mc-block-content' });
    const safe: Block = b.type === 'text' || b.type === 'html' ? { ...b, html: sanitizeRichText(b.html) } : b;
    if (b.type === 'image' && !b.src) {
      const pending = uploading.has(b.id);
      content.append(h('div', { class: 'mc-img-ph', ...(pending ? { 'aria-busy': 'true' } : {}) }, pending ? h('span', { class: 'mc-spin', 'aria-hidden': 'true' }) : icon('image', 28), h('span', {}, pending ? t('uploading') : t('imagePlaceholder'))));
    } else content.innerHTML = renderBlockContent(safe);
    // Links never navigate and never take part in keyboard navigation inside the canvas.
    content.querySelectorAll('a').forEach((a) => { a.tabIndex = -1; });

    if (b.type === 'text') {
      const editable = content.firstElementChild as HTMLElement;
      editable.dataset.editable = b.id;
      if (selected && !preview) {
        editable.setAttribute('contenteditable', 'true');
        editable.addEventListener('input', () => syncText(b.id));
        editable.addEventListener('paste', (e) => onPaste(e, editable));
        if (focusTextId === b.id) { focusTextId = null; queueMicrotask(() => editable.focus()); }
      }
    }
    const el: HTMLElement = h('div', {
      class: 'mc-block' + (selected ? ' selected' : ''), 'data-id': b.id, style: `padding:${paddingCss(b.padding)}`,
      tabindex: '-1', role: 'group', 'aria-label': t(BLOCK_LABEL[b.type]), ...(selected ? { 'aria-current': 'true' } : {}),
      'on:click': (e: Event) => {
        e.stopPropagation();
        if (preview || (store.selection.kind === 'block' && store.selection.id === b.id)) return;
        selectBlock(b);
      },
    },
      preview ? null : h('div', { class: 'mc-chrome' }, handle({ kind: 'move-block', id: b.id }, () => el), h('span', { class: 'mc-tag' }, t(BLOCK_LABEL[b.type])), ...actionBtns('block', b.id)),
      content);
    return el;
  }

  function renderRowEl(row: Row, index: number): HTMLElement {
    const selected = store.selection.kind === 'row' && store.selection.id === row.id;
    const cols = row.columns.map((col, i) => {
      const colEl = h('div', { class: 'mc-col', 'data-col': col.id, style: `flex:${row.ratios[i]} 1 0` },
        ...(col.blocks.length ? col.blocks.map(renderBlock) : [h('div', { class: 'mc-empty-col' }, icon('plus', 16), h('span', {}, t('dropBlockHere')))]));
      return colEl;
    });
    const el: HTMLElement = h('div', {
      class: 'mc-row' + (selected ? ' selected' : ''), 'data-id': row.id, tabindex: '-1', role: 'group', 'aria-label': `${t('rowName')} ${index + 1}`, ...(selected ? { 'aria-current': 'true' } : {}),
      'on:click': () => { if (!preview) store.select({ kind: 'row', id: row.id }); },
    },
      // A strip in the left margin selects the row even when its columns are filled edge to edge (row padding 0).
      preview ? null : h('div', { class: 'mc-row-gutter', title: t('selectRow'), 'aria-hidden': 'true' }),
      preview ? null : h('div', { class: 'mc-chrome mc-chrome-row' }, handle({ kind: 'move-row', id: row.id }, () => el), h('span', { class: 'mc-tag' }, t('rowName')), ...actionBtns('row', row.id)),
      h('div', { class: 'mc-row-inner' + (row.stackOnMobile ? ' stack' : ''), style: `background:${row.backgroundColor || 'transparent'};padding:${paddingCss(row.padding)}` }, ...cols));
    return el;
  }

  /** One tab stop for the whole canvas (the selected item, else the first); arrows move between items. */
  function applyRoving() {
    const items = Array.from(canvas.querySelectorAll<HTMLElement>('.mc-row, .mc-block'));
    if (preview) { items.forEach((i) => i.removeAttribute('tabindex')); return; }
    const stop = canvas.querySelector<HTMLElement>('.mc-block.selected, .mc-row.selected') ?? items[0];
    items.forEach((i) => { i.tabIndex = i === stop ? 0 : -1; });
  }

  /**
   * The floating toolbar sits above its block. When that would cover neighbouring content or be clipped by the scroll area,
   * try below the block, then inside its top corner (which only ever covers the block's own content).
   */
  function placeChrome() {
    const el = canvas.querySelector<HTMLElement>('.mc-block.selected, .mc-row.selected');
    const chrome = el?.querySelector<HTMLElement>(':scope > .mc-chrome');
    if (!el || !chrome || preview) return;
    chrome.classList.remove('mc-chrome-in', 'mc-chrome-below', 'mc-chrome-compact');
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return; // not laid out (hidden / jsdom)
    chrome.classList.toggle('mc-chrome-compact', r.width < 260); // narrow column: drop the label so the toolbar fits the block's width
    const others = Array.from(canvas.querySelectorAll<HTMLElement>('.mc-block')).filter((o) => o !== el && !el.contains(o)).map((o) => o.getBoundingClientRect()).filter((q) => q.width);
    const collides = () => {
      const c = chrome.getBoundingClientRect();
      const wrap = canvasWrap.getBoundingClientRect();
      if (c.top < wrap.top + 1 || c.bottom > wrap.bottom - 1) return true;
      return others.some((q) => c.left < q.right - 1 && c.right > q.left + 1 && c.top < q.bottom - 1 && c.bottom > q.top + 1);
    };
    if (!collides()) return;
    for (const cls of ['mc-chrome-below', 'mc-chrome-in']) {
      chrome.classList.remove('mc-chrome-in', 'mc-chrome-below');
      chrome.classList.add(cls);
      if (!collides()) return;
    }
    chrome.classList.remove('mc-chrome-below');
    chrome.classList.add('mc-chrome-in'); // nothing fits: cover the block's own corner rather than a neighbour
  }
  let placeRaf = 0;
  const schedulePlace = () => { if (!placeRaf) placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeChrome(); }); };
  canvasWrap.addEventListener('scroll', schedulePlace, { passive: true });

  function renderCanvas() {
    const d = store.design;
    page.style.background = d.body.backgroundColor;
    canvas.className = 'mc-canvas' + (device === 'mobile' ? ' mc-mobile' : '') + (preview ? ' mc-preview' : '');
    canvas.style.cssText = `width:${device === 'mobile' ? 375 : d.body.contentWidth}px;background:${d.body.contentBackgroundColor};font-family:${d.body.fontFamily}`;
    canvas.setAttribute('role', 'group');
    canvas.setAttribute('aria-label', t('canvasLabel'));
    canvas.replaceChildren(...(d.rows.length ? d.rows.map(renderRowEl) : [h('div', { class: 'mc-empty-canvas' }, h('span', { class: 'mc-empty-ico' }, icon('sparkle', 28)), h('strong', {}, t('emptyCanvasTitle')), h('span', {}, t('emptyCanvasHint')))]));
    root.classList.toggle('mc-previewing', preview);
    applyRoving();
    renderToolbar();
    placeChrome();
  }

  /** Work out the drop target under the pointer and move the indicator there. Returns false when nothing is droppable. */
  function updateDropTarget(e: DragEvent): boolean {
    const p = payloadOf(e);
    if (!p) return false;
    const isBlock = p.kind === 'new-block' || p.kind === 'move-block';
    // Released inside the dragged item's own box: a stable no-op (inserting the indicator must never re-target the drop).
    if (p.kind === 'move-block' || p.kind === 'move-row') {
      const own = canvas.querySelector<HTMLElement>(`${p.kind === 'move-block' ? '.mc-block' : '.mc-row'}[data-id="${p.id}"]`);
      if (own) {
        indicator.remove();
        const r = own.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) { dropTarget = { type: 'noop' }; return true; }
      }
    }
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
  // Leaving the workspace hides the indicator. WebKit never sets `relatedTarget` on drag events, so fall back to the pointer position
  // (some engines report 0,0 on dragleave; that is treated as "unknown" and left to the document-level dragover check below).
  canvasWrap.addEventListener('dragleave', (e) => {
    const to = e.relatedTarget as Node | null;
    const r = canvasWrap.getBoundingClientRect();
    const outside = to ? !canvasWrap.contains(to) : (e.clientX !== 0 || e.clientY !== 0) && (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom);
    if (outside) { dropTarget = null; indicator.remove(); }
  });
  // The drop target is recomputed from the drop event itself, so a release between two dragover ticks (or after a spurious
  // dragleave) still lands where the pointer is instead of silently doing nothing.
  canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const p = payloadOf(e);
    if (!p) return;
    let files: File[] = [];
    if (!drag) { // files from the OS: only valid images become blocks; the rest is reported
      const all = Array.from(e.dataTransfer?.files ?? []);
      const errors: string[] = [];
      files = all.filter((f) => {
        const bad = validateImageFile(f, maxImageBytes);
        if (bad) errors.push(t(bad, { name: f.name, max: formatBytes(maxImageBytes) }));
        return !bad;
      });
      if (errors.length) showNotice(errors);
      if (!files.length) { clearDrag(); return; }
    }
    updateDropTarget(e);
    applyDrop(p, dropTarget, files);
  });
  // While dragging, anything outside the workspace (sidebar, panel, toolbar) is not a drop target: hide the indicator there.
  // Runs on every dragover, so it also covers engines whose dragleave is unreliable.
  const onDocDragOver = (ev: DragEvent) => {
    if (drag && !canvasWrap.contains(ev.target as Node)) { dropTarget = null; indicator.remove(); }
  };
  document.addEventListener('dragover', onDocDragOver, true);
  // Files dropped on the editor chrome must never make the browser navigate away to the file.
  root.addEventListener('dragover', (e) => { if (hasFiles(e) && !drag) e.preventDefault(); });
  root.addEventListener('drop', (e) => { if (hasFiles(e) && !drag) e.preventDefault(); });
  // Whatever happens (cancelled drop, drop outside the canvas), never leave a stale indicator or drag state behind.
  const onDragEnd = () => clearDrag();
  document.addEventListener('dragend', onDragEnd, true);
  document.addEventListener('drop', onDragEnd);
  // Anchors must never navigate inside the editor (edit or preview, any button or modifier). Capture phase: the block click
  // handler stops propagation, so a bubbling listener on the canvas would never see the event.
  const noNavigate = (e: Event) => { if ((e.target as HTMLElement).closest?.('a')) e.preventDefault(); };
  canvas.addEventListener('click', noNavigate, true);
  canvas.addEventListener('auxclick', noNavigate, true);
  canvas.addEventListener('mousedown', (e) => {
    const a = (e.target as HTMLElement).closest?.('a');
    if (!a || a.closest('[contenteditable="true"]')) return; // links in text being edited keep normal caret behaviour
    e.preventDefault(); // no focus on the anchor (it is destroyed by the re-render), no middle-click autoscroll
    a.closest<HTMLElement>('.mc-block, .mc-row')?.focus({ preventScroll: true });
  }, true);
  canvasWrap.addEventListener('click', (e) => { if (e.target === canvasWrap || e.target === page || e.target === canvas) store.select({ kind: 'body' }); });

  // ---------- text sync ----------
  function getEditable(id: string) {
    return canvas.querySelector<HTMLElement>(`[data-editable="${id}"]`);
  }
  function syncText(id: string) {
    const el = getEditable(id);
    if (!el) return;
    const html = cleanRichHtml(sanitizeRichText(el.innerHTML));
    store.change((d) => { const loc = findBlock(d, id); if (loc && loc.block.type === 'text') loc.block.html = html; }, { render: 'none', coalesceKey: `text:${id}` });
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
  }

  /** Paste: never let raw clipboard HTML into the live DOM (iframes etc. would run until the next render). */
  function onPaste(e: ClipboardEvent, editable: HTMLElement) {
    e.preventDefault();
    const cd = e.clipboardData;
    const rawHtml = cd?.getData('text/html') ?? '';
    const text = cd?.getData('text/plain') ?? '';
    let html: string;
    if (rawHtml) {
      const tpl = document.createElement('template');
      tpl.innerHTML = sanitizeRichText(rawHtml);
      normalizePasted(tpl.content);
      html = tpl.innerHTML;
    } else {
      html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
    }
    if (!html) return;
    editable.focus();
    if (typeof document.execCommand === 'function' && document.execCommand('insertHTML', false, html)) return; // fires `input` itself
    const sel = window.getSelection();
    const range = sel && sel.rangeCount && editable.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null;
    const frag = document.createElement('template');
    frag.innerHTML = html;
    const r = range ?? (() => { const x = document.createRange(); x.selectNodeContents(editable); x.collapse(false); return x; })();
    r.deleteContents();
    const last = frag.content.lastChild;
    r.insertNode(frag.content);
    if (last && sel) { const after = document.createRange(); after.setStartAfter(last); after.collapse(true); sel.removeAllRanges(); sel.addRange(after); }
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderAll() {
    withFocus(() => {
      renderCanvas();
      renderSidebarEl();
      renderPanelEl();
    });
  }

  const unsubscribe = store.subscribe((scope) => {
    withFocus(() => {
      if (scope === 'all') {
        // The palette (left) is selection-independent and is left untouched so a finished drag never replaces its own source tile.
        renderCanvas();
        renderPanelEl();
      }
      else if (scope === 'canvas') renderCanvas();
    });
    options.onChange?.(structuredClone(store.design));
  });

  // ---------- keyboard ----------
  // Handled on the document, but only for events from this editor: focus inside it, or (focus on <body>, e.g. after the focused
  // element was removed) when the last pointer / focus interaction happened inside it. Several editors on one page never interfere.
  const onDocInteract = (e: Event) => { interacted = root.contains(e.target as Node); };
  document.addEventListener('mousedown', onDocInteract, true);
  document.addEventListener('focusin', onDocInteract, true);

  const isItemEl = (el: Element | null): el is HTMLElement => !!el && (el.classList.contains('mc-block') || el.classList.contains('mc-row'));
  const kindOf = (el: HTMLElement): 'block' | 'row' => (el.classList.contains('mc-row') ? 'row' : 'block');
  const TEXT_INPUT = 'textarea, input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button]):not([type=file])';
  const selectItem = (kind: 'block' | 'row', id: string) => store.select(kind === 'row' ? { kind: 'row', id } : { kind: 'block', id });
  const isSelected = (id: string) => store.selection.kind !== 'body' && store.selection.id === id;

  const onDocKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const target = e.target as HTMLElement | null;
    const inside = !!target && root.contains(target);
    const stray = !target || target === document.body || target === document.documentElement;
    if (!inside && !(stray && interacted)) return;
    const el = inside ? target : null;
    const key = e.key;
    const mod = e.ctrlKey || e.metaKey;
    const isTextInput = !!el?.matches(TEXT_INPUT); // these have their own native undo / caret keys
    const isField = !!el?.matches('input, textarea, select');
    const editing = isEditing(el);
    const item = isItemEl(el) ? el : null; // an editor block / row itself has focus
    const sel = store.selection;
    const cur: { kind: 'block' | 'row'; id: string } | null = item ? { kind: kindOf(item), id: item.dataset.id! } : sel.kind === 'body' ? null : { kind: sel.kind, id: sel.id };

    if (mod && !e.altKey && key.toLowerCase() === 'z') {
      if (isTextInput) return;
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
    } else if (mod && !e.altKey && key.toLowerCase() === 'y') {
      if (isTextInput) return;
      e.preventDefault();
      store.redo();
    } else if (key === 'Escape' && !mod) {
      if (sel.kind === 'body') return;
      e.preventDefault();
      deselect();
    } else if (!mod && !e.altKey && !isField && !editing && (key === 'Delete' || key === 'Backspace')) {
      if (!cur) return;
      e.preventDefault();
      deleteItem(cur.kind, cur.id);
    } else if (e.altKey && !mod && !e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown') && !isField && cur) {
      e.preventDefault();
      if (!isSelected(cur.id)) selectItem(cur.kind, cur.id);
      focusOverride = itemKey(cur.id);
      moveItem(cur.kind, cur.id, key === 'ArrowUp' ? -1 : 1);
    } else if (item && !mod && !e.altKey) {
      const list = Array.from(canvas.querySelectorAll<HTMLElement>('.mc-row, .mc-block'));
      const i = list.indexOf(item);
      const go = (to: HTMLElement | undefined) => {
        if (!to?.dataset.id) return;
        e.preventDefault();
        focusOverride = itemKey(to.dataset.id);
        selectItem(kindOf(to), to.dataset.id);
        announce(t('annSelected', { name: itemName(kindOf(to), to.dataset.id) }));
      };
      if (key === 'ArrowUp' && e.shiftKey && kindOf(item) === 'block') { e.preventDefault(); selectParentRow(item.dataset.id!); }
      else if (e.shiftKey) return;
      else if (key === 'ArrowDown' || key === 'ArrowRight') go(list[i + 1]);
      else if (key === 'ArrowUp' || key === 'ArrowLeft') go(list[i - 1]);
      else if (key === 'Home') go(list[0]);
      else if (key === 'End') go(list[list.length - 1]);
      else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const ed = getEditable(item.dataset.id!);
        if (isSelected(item.dataset.id!) && ed && isEditing(ed)) { ed.focus(); setCaretOffset(ed, Number.MAX_SAFE_INTEGER); }
        else if (!isSelected(item.dataset.id!)) go(item);
      }
    }
  };
  document.addEventListener('keydown', onDocKeydown);

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
    setLayout: (patch) => { layout = mergeLayout(layout, patch); applyLayout(true); },
    getLayout: () => cloneLayout(layout),
    getResolvedLayout: () => resolved,
    destroy: () => { unsubscribe(); clearTimeout(noticeTimer); cancelAnimationFrame(placeRaf); document.removeEventListener('keydown', onDocKeydown); document.removeEventListener('mousedown', onDocInteract, true); document.removeEventListener('focusin', onDocInteract, true); resizeObserver?.disconnect(); window.removeEventListener('resize', onWindowResize); document.removeEventListener('dragend', onDragEnd, true); document.removeEventListener('drop', onDragEnd); document.removeEventListener('dragover', onDocDragOver, true); container.replaceChildren(); },
  };
}
