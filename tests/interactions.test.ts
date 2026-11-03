import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor, createSampleDesign, locales, type EditorInstance } from '../src';
import { en } from '../src/i18n/en';
import { cleanRichHtml, normalizePasted } from '../src/editor/richtext';
import { validateImageFile, DEFAULT_MAX_IMAGE_BYTES } from '../src/editor/upload';

const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const mousedown = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const file = (name: string, type: string, size = 10) => { const f = new File(['x'], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };

let host: HTMLElement;
let ed: EditorInstance;
const q = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
const qa = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(host.querySelectorAll<T>(sel));
const rootEl = () => q('.mc-root');
const insideRoot = () => !!document.activeElement && rootEl().contains(document.activeElement);
const blocks = () => ed.getDesign().rows.flatMap((r) => r.columns.flatMap((c) => c.blocks));
const mount = (opts: Parameters<typeof createEditor>[1] = {}) => { ed = createEditor(host, { locale: 'en', design: createSampleDesign(), ...opts }); };

beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { ed?.destroy(); host.remove(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('B1: keyboard shortcuts survive re-renders', () => {
  it('focus stays inside the editor after a floating-toolbar button re-renders the canvas', () => {
    mount();
    q('.mc-block').click();
    const n = blocks().length;
    qa('.mc-block.selected > .mc-chrome button').find((b) => b.title === 'Duplicate')!.focus();
    expect(insideRoot()).toBe(true);
    qa('.mc-block.selected > .mc-chrome button').find((b) => b.title === 'Duplicate')!.click();
    expect(blocks().length).toBe(n + 1);
    expect(insideRoot()).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.act).toBe('dup'); // the equivalent element, not just "somewhere"
    key(document.activeElement!, 'Delete');
    expect(blocks().length).toBe(n);
    key(document.activeElement!, 'z', { ctrlKey: true });
    expect(blocks().length).toBe(n + 1);
    key(document.activeElement!, 'z', { ctrlKey: true, shiftKey: true });
    expect(blocks().length).toBe(n);
    key(document.activeElement!, 'z', { ctrlKey: true });
    key(document.activeElement!, 'y', { ctrlKey: true });
    expect(blocks().length).toBe(n);
  });

  it('keeps focus in the panel after a row-layout button re-renders the panel', () => {
    mount();
    q('.mc-row').click();
    const btn = () => qa('.mc-layout').find((b) => !b.classList.contains('on'))!;
    const want = btn().dataset.layout;
    btn().focus();
    btn().click();
    expect(insideRoot()).toBe(true);
    expect(document.activeElement?.closest('.mc-panel')).not.toBeNull();
    expect(qa('.mc-layout.on')[0].dataset.layout).toBe(want);
    key(document.activeElement!, 'z', { ctrlKey: true });
    expect(qa('.mc-layout.on')[0].dataset.layout).not.toBe(want);
  });

  it('does not strand focus when the focused toolbar button gets disabled (undo of the last step)', () => {
    mount({ design: undefined });
    qa('[data-block-type="divider"]')[0].click();
    const undo = qa('.mc-tb-btn').find((b) => b.title.startsWith('Undo'))!;
    undo.focus();
    undo.click();
    expect(insideRoot()).toBe(true);
  });

  it('Button block click does not leave focus on the destroyed anchor', () => {
    mount();
    const blk = qa('.mc-block').find((b) => b.querySelector('.mc-block-content a'))!;
    const a = blk.querySelector('a')!;
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    a.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true); // the anchor never takes focus
    a.click();
    expect(insideRoot()).toBe(true);
    key(document.activeElement!, 'Delete');
    expect(qa('.mc-block').find((b) => b.dataset.id === blk.dataset.id)).toBeUndefined();
  });

  it('typing in a text block, Ctrl+Z, then redo keeps the caret in the text and redo working', () => {
    mount();
    qa('.mc-block').find((b) => b.querySelector('[data-editable]'))!.click();
    const editable = () => q('[contenteditable="true"]');
    const id = editable().dataset.editable!;
    const textOf = () => (blocks().find((b) => b.id === id) as { html: string }).html;
    const before = textOf();
    editable().focus();
    editable().insertAdjacentHTML('beforeend', '<b>ZZZ</b>');
    editable().dispatchEvent(new Event('input', { bubbles: true }));
    expect(textOf()).toContain('ZZZ');
    key(editable(), 'z', { ctrlKey: true });
    expect(textOf()).toBe(before);
    expect(insideRoot()).toBe(true);
    expect(document.activeElement).toBe(editable()); // re-rendered editable got focus back
    key(document.activeElement!, 'z', { ctrlKey: true, shiftKey: true });
    expect(textOf()).toContain('ZZZ');
    key(document.activeElement!, 'z', { ctrlKey: true });
    key(document.activeElement!, 'y', { ctrlKey: true });
    expect(textOf()).toContain('ZZZ');
  });

  it('Delete / Ctrl+Z in a text input keep native behaviour (no block deleted, no store undo)', () => {
    mount();
    q('.mc-block').click();
    const n = blocks().length;
    const input = q<HTMLInputElement>('.mc-panel input[type=text], .mc-panel textarea');
    input.focus();
    expect(key(input, 'Delete').defaultPrevented).toBe(false);
    expect(key(input, 'z', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(blocks().length).toBe(n);
  });

  it('with focus on <body>, shortcuts apply to the editor last interacted with; other editors on the page are not affected', () => {
    mount();
    const host2 = document.createElement('div');
    document.body.append(host2);
    const ed2 = createEditor(host2, { design: createSampleDesign(), locale: 'en' });
    try {
      const n1 = blocks().length;
      const n2 = () => ed2.getDesign().rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).length;
      const start2 = n2();
      q('.mc-block').click(); // select in editor 1 ...
      mousedown(q('.mc-block')); // ... and the last pointer interaction was there
      (document.activeElement as HTMLElement | null)?.blur();
      key(document.body, 'Delete');
      expect(blocks().length).toBe(n1 - 1);
      expect(n2()).toBe(start2);
      // now interact with editor 2: body-level keys go to editor 2 only
      host2.querySelector<HTMLElement>('.mc-block')!.click();
      mousedown(host2.querySelector('.mc-block')!);
      (document.activeElement as HTMLElement | null)?.blur();
      key(document.body, 'Delete');
      expect(n2()).toBe(start2 - 1);
      expect(blocks().length).toBe(n1 - 1);
      // a keydown from inside editor 1 never touches editor 2
      q('.mc-block').click();
      const before2 = n2();
      key(q('.mc-block.selected'), 'Delete');
      expect(n2()).toBe(before2);
    } finally { ed2.destroy(); host2.remove(); }
  });

  it('ignores keys when the page has never interacted with the editor and focus is on <body>', () => {
    mount();
    const n = blocks().length;
    key(document.body, 'z', { ctrlKey: true });
    key(document.body, 'Delete');
    expect(blocks().length).toBe(n);
  });
});

describe('B2: number fields', () => {
  const fieldNum = (label: string) => qa<HTMLElement>('.mc-field').find((f) => f.querySelector('.mc-field-label')!.textContent === label)!.querySelector<HTMLInputElement>('input[type=number]')!;
  const type = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const selectText = () => { qa('.mc-block').find((b) => b.querySelector('[data-editable]'))!.click(); };
  const sizeOf = () => (blocks().find((b) => b.type === 'text' && (document.querySelector('.mc-block.selected') as HTMLElement).dataset.id === b.id) as { fontSize: number }).fontSize;

  it('typing "24" does not get rewritten mid-typing and applies once valid', () => {
    mount(); selectText();
    const el = fieldNum('Font size');
    type(el, '2');
    expect(el.value).toBe('2'); // out of range (min 10): untouched, not applied
    expect(sizeOf()).not.toBe(2);
    type(el, '24');
    expect(el.value).toBe('24');
    expect(sizeOf()).toBe(24);
    const range = el.parentElement!.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(range.value).toBe('24');
  });

  it('clamps on change/blur, restores the last valid value when empty/invalid, commits on Enter', () => {
    mount(); selectText();
    let el = fieldNum('Font size');
    type(el, '99');
    expect(el.value).toBe('99'); // not rewritten while typing
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.value).toBe('48');
    expect(sizeOf()).toBe(48);
    type(el, '');
    el.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('48');
    type(el, '5');
    key(el, 'Enter');
    expect(el.value).toBe('10');
    expect(sizeOf()).toBe(10);
    el = fieldNum('Font size');
    type(el, '20');
    expect(sizeOf()).toBe(20);
  });

  it('Shift+Arrow steps by 10 and slider and number stay in sync', () => {
    mount(); selectText();
    const el = fieldNum('Font size');
    type(el, '20');
    key(el, 'ArrowUp', { shiftKey: true });
    expect(el.value).toBe('30');
    expect(sizeOf()).toBe(30);
    const range = el.parentElement!.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '16';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.value).toBe('16');
    expect(sizeOf()).toBe(16);
  });

  it('does not touch an out-of-range stored value just because the field was focused and blurred', () => {
    const d = createSampleDesign();
    const t = d.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'text')!;
    if (t.type === 'text') t.fontSize = 60;
    mount({ design: d }); selectText();
    const el = fieldNum('Font size');
    el.dispatchEvent(new Event('blur'));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.value).toBe('60');
    expect(sizeOf()).toBe(60);
  });

  it('line height is a decimal field (step 0.1, e.g. 1.6) in en and ja, with no "x10" label', () => {
    mount(); selectText();
    const lh = fieldNum('Line height');
    expect(lh.step).toBe('0.1');
    expect(Number(lh.value)).toBe(1.6);
    type(lh, '1.8');
    expect(lh.value).toBe('1.8');
    const b = blocks().find((x) => x.type === 'text' && x.id === (document.querySelector('.mc-block.selected') as HTMLElement).dataset.id) as { lineHeight: number };
    expect(b.lineHeight).toBe(1.8);
    expect(q('.mc-block.selected [data-editable]').style.lineHeight).toBe('1.8');
    expect(en.fLineHeight).not.toMatch(/10|x10|×10/);
    expect(locales.ja.fLineHeight).not.toMatch(/10/);
  });

  it('content width: typing 640 is applied live and stays 640', () => {
    mount();
    const el = fieldNum('Content width');
    type(el, '6'); type(el, '64'); type(el, '640');
    expect(el.value).toBe('640');
    expect(ed.getDesign().body.contentWidth).toBe(640);
  });
});

describe('B3: links never navigate in the canvas', () => {
  const click = (a: Element, init: MouseEventInit = {}, type = 'click') => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    a.dispatchEvent(e);
    return e;
  };

  it('prevents default on click / middle-click / ctrl-click, in edit mode', () => {
    mount();
    const a = () => q('.mc-block-content a'); // the canvas is re-rendered by the selection each time
    expect(click(a()).defaultPrevented).toBe(true);
    expect(click(a(), { button: 1 }, 'auxclick').defaultPrevented).toBe(true);
    expect(click(a(), { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(click(a(), { metaKey: true }).defaultPrevented).toBe(true);
  });

  it('prevents default in preview mode too', () => {
    mount();
    qa('.mc-tb-text')[0].click();
    expect(rootEl().classList.contains('mc-previewing')).toBe(true);
    const a = q('.mc-block-content a'); // preview mode never selects, so the canvas is not re-rendered
    expect(click(a).defaultPrevented).toBe(true);
    expect(click(a, { button: 1 }, 'auxclick').defaultPrevented).toBe(true);
  });

  it('works for links inside rich text and for nested elements of the link', () => {
    const d = createSampleDesign();
    const t = d.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'text')!;
    if (t.type === 'text') t.html = '<p>see <a href="https://example.com"><b>this</b></a></p>';
    mount({ design: d });
    const inner = q('[data-editable] a b');
    expect(click(inner).defaultPrevented).toBe(true);
  });

  it('anchors in the canvas are not in the tab order and never leak tabindex into the stored HTML', () => {
    const d = createSampleDesign();
    const t = d.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'text')!;
    if (t.type === 'text') t.html = '<p style="margin:0">see <a href="https://example.com">link</a></p>';
    mount({ design: d });
    expect(qa<HTMLAnchorElement>('.mc-canvas a').every((a) => a.tabIndex === -1)).toBe(true);
    const blk = qa('.mc-block').find((b) => b.querySelector('[data-editable] a'))!;
    blk.click();
    const editable = q('[contenteditable="true"]');
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    const stored = (ed.getDesign().rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.id === editable.dataset.editable) as { html: string }).html;
    expect(stored).toContain('href="https://example.com"');
    expect(stored).not.toContain('tabindex');
  });

  it('a mousedown on a link outside text editing does not give the anchor focus', () => {
    mount();
    const a = q('.mc-block-content a');
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('B6 / Escape / keyboard navigation', () => {
  it('the block toolbar has "Select parent row" (and the row gutter selects the row)', () => {
    mount();
    const blk = qa('.mc-block')[3];
    blk.click();
    const parent = q('.mc-block.selected > .mc-chrome [data-act="select-parent"]');
    expect(parent.title).toBe(en.selectParentRow);
    parent.click();
    expect(q('.mc-panel').dataset.view).toBe('props');
    const sel = q('.mc-row.selected');
    expect(sel.contains(blk) || sel.dataset.id === blk.closest<HTMLElement>('.mc-row')!.dataset.id).toBe(true);
    expect(insideRoot()).toBe(true);
    // gutter
    q('.mc-canvas-wrap').click();
    const gutter = qa('.mc-row')[2].querySelector<HTMLElement>(':scope > .mc-row-gutter')!;
    expect(gutter.title).toBe(en.selectRow);
    gutter.click();
    expect(q('.mc-row.selected').dataset.id).toBe(qa('.mc-row')[2].dataset.id);
  });

  it('Shift+ArrowUp on a focused block selects its parent row', () => {
    mount();
    const blk = qa('.mc-block')[3];
    blk.focus();
    key(blk, 'ArrowUp', { shiftKey: true });
    expect(q('.mc-row.selected')).not.toBeNull();
    expect(document.activeElement).toBe(q('.mc-row.selected'));
  });

  it('Escape deselects (panel returns to Body) from a block, a row and from inside the panel', () => {
    mount();
    q('.mc-block').click();
    expect(q('.mc-panel').dataset.view).toBe('props');
    key(q('.mc-block.selected'), 'Escape');
    expect(q('.mc-panel').dataset.view).toBe('body');
    q('.mc-row').click();
    key(q('.mc-row.selected'), 'Escape');
    expect(q('.mc-panel').dataset.view).toBe('body');
    q('.mc-block').click();
    key(q('.mc-panel input'), 'Escape');
    expect(q('.mc-panel').dataset.view).toBe('body');
    expect(insideRoot()).toBe(true);
  });

  it('roving tabindex: exactly one tab stop on the canvas, items are labelled, tabs follow the selection', () => {
    mount();
    expect(qa('.mc-canvas [tabindex="0"]')).toHaveLength(1);
    expect(qa('.mc-row').every((r) => r.tabIndex !== undefined && r.getAttribute('aria-label'))).toBe(true);
    qa('.mc-block')[2].click();
    expect(qa('.mc-canvas [tabindex="0"]')).toHaveLength(1);
    expect(qa('.mc-canvas [tabindex="0"]')[0].classList.contains('selected')).toBe(true);
  });

  it('Enter/Space select the focused item and arrows move the selection; focus follows', () => {
    mount();
    const first = q('.mc-canvas [tabindex="0"]');
    first.focus();
    key(first, 'Enter');
    expect(q('.mc-row.selected, .mc-block.selected').dataset.id).toBe(first.dataset.id);
    key(document.activeElement!, 'ArrowDown');
    const second = q('.mc-row.selected, .mc-block.selected');
    expect(second.dataset.id).not.toBe(first.dataset.id);
    expect(document.activeElement).toBe(second);
    key(document.activeElement!, 'ArrowUp');
    expect(q('.mc-row.selected, .mc-block.selected').dataset.id).toBe(first.dataset.id);
    key(document.activeElement!, ' ');
    key(document.activeElement!, 'End');
    expect(document.activeElement).toBe(qa('.mc-row, .mc-block').pop());
  });

  it('Alt+ArrowUp/Down moves the focused block within its column and Delete deletes it; the live region announces both', () => {
    mount();
    const blk = qa('.mc-block')[1]; // 2nd block of the hero column
    const id = blk.dataset.id!;
    blk.focus();
    const idx = () => qa('.mc-block').findIndex((b) => b.dataset.id === id);
    const i0 = idx();
    key(blk, 'ArrowDown', { altKey: true });
    expect(idx()).toBe(i0 + 1);
    expect(q('.mc-live').textContent).toMatch(/moved/i);
    key(document.activeElement!, 'ArrowUp', { altKey: true });
    expect(idx()).toBe(i0);
    expect(document.activeElement).toBe(qa('.mc-block')[i0]);
    key(document.activeElement!, 'Delete');
    expect(qa('.mc-block').some((b) => b.dataset.id === id)).toBe(false);
    expect(q('.mc-live').textContent).toMatch(/deleted/i);
    expect(insideRoot()).toBe(true);
  });

  it('aria-live announces additions (en + ja)', () => {
    mount({ design: undefined });
    qa('[data-block-type="button"]')[0].click();
    expect(q('.mc-live').textContent).toContain('Button added');
    ed.setLocale('ja');
    qa('[data-block-type="divider"]')[0].click();
    expect(q('.mc-live').textContent).toContain('区切り線を追加しました');
    expect(q('.mc-live').getAttribute('aria-live')).toBe('polite');
  });

  it('drag handle has role=button and a localized aria-label', () => {
    mount();
    qa('.mc-block')[0].click();
    const h = q('.mc-block.selected .mc-handle');
    expect(h.getAttribute('role')).toBe('button');
    expect(h.getAttribute('aria-label')).toBe(en.dragHandleLabel);
    ed.setLocale('ja');
    expect(q('.mc-handle').getAttribute('aria-label')).toBe(locales.ja.dragHandleLabel);
  });

  it('sidebar tabs follow the WAI-ARIA tabs pattern (roving tabindex, arrows, Home/End)', () => {
    mount();
    const tabs = () => qa('[role=tab]');
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    tabs()[0].focus();
    key(tabs()[0], 'ArrowRight');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0]);
    key(tabs()[1], 'ArrowRight'); // wraps
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    key(tabs()[0], 'End');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    key(tabs()[1], 'Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(q('[role=tabpanel]')).not.toBeNull();
  });
});

describe('floating toolbar placement', () => {
  const rect = (l: number, t: number, w: number, h: number) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON() {} }) as DOMRect;

  /** jsdom has no layout: fake one. Block 1 sits right under block 0, so a 28px toolbar above it would cover block 0. */
  const fakeLayout = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    if (el.classList.contains('mc-canvas-wrap')) return rect(0, 0, 1000, 800);
    if (el.classList.contains('mc-chrome')) return rect(300, el.classList.contains('mc-chrome-below') ? 300 : el.classList.contains('mc-chrome-in') ? 200 : 172, 200, 28);
    if (el.classList.contains('mc-block')) {
      const i = Array.from(document.querySelectorAll('.mc-block')).indexOf(el);
      return i === 0 ? rect(100, 100, 400, 98) : i === 1 ? rect(100, 200, 400, 100) : rect(100, 5000 + i * 100, 400, 90);
    }
    return rect(0, 0, 0, 0);
  });

  it('keeps the toolbar above when nothing is in the way', () => {
    mount();
    fakeLayout();
    qa('.mc-block')[0].click();
    expect(q('.mc-block.selected > .mc-chrome').classList.contains('mc-chrome-below')).toBe(false);
    expect(q('.mc-block.selected > .mc-chrome').classList.contains('mc-chrome-in')).toBe(false);
  });

  it('flips below the block when the position above would cover the block above it', () => {
    mount();
    fakeLayout();
    qa('.mc-block')[1].click();
    expect(q('.mc-block.selected > .mc-chrome').classList.contains('mc-chrome-below')).toBe(true);
  });

  it('flips inside the block when below is blocked as well', () => {
    mount();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const el = this as HTMLElement;
      if (el.classList.contains('mc-canvas-wrap')) return rect(0, 0, 1000, 800);
      if (el.classList.contains('mc-chrome')) return rect(300, el.classList.contains('mc-chrome-below') ? 300 : el.classList.contains('mc-chrome-in') ? 200 : 172, 200, 28);
      if (el.classList.contains('mc-block')) {
        const i = Array.from(document.querySelectorAll('.mc-block')).indexOf(el);
        return i === 0 ? rect(100, 100, 400, 98) : i === 1 ? rect(100, 200, 400, 100) : i === 2 ? rect(100, 300, 400, 90) : rect(100, 5000 + i * 100, 400, 90);
      }
      return rect(0, 0, 0, 0);
    });
    qa('.mc-block')[1].click();
    expect(q('.mc-block.selected > .mc-chrome').classList.contains('mc-chrome-in')).toBe(true);
  });

  it('flips when the toolbar would be clipped by the top of the scroll area', () => {
    mount();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const el = this as HTMLElement;
      if (el.classList.contains('mc-canvas-wrap')) return rect(0, 180, 1000, 600); // block 0's toolbar (top 72) is above the visible area
      if (el.classList.contains('mc-chrome')) return rect(300, el.classList.contains('mc-chrome-below') ? 300 : el.classList.contains('mc-chrome-in') ? 200 : 172, 200, 28);
      if (el.classList.contains('mc-block')) return Array.from(document.querySelectorAll('.mc-block')).indexOf(el) === 0 ? rect(100, 200, 400, 100) : rect(100, 5000, 400, 90);
      return rect(0, 0, 0, 0);
    });
    qa('.mc-block')[0].click();
    expect(q('.mc-block.selected > .mc-chrome').classList.contains('mc-chrome-below')).toBe(true);
  });
});

describe('B5: image upload validation', () => {
  const uploadInput = () => q<HTMLInputElement>('.mc-panel input[type=file]');
  const choose = async (input: HTMLInputElement, f: File) => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(); await tick();
  };
  const selectImage = () => { qa('[data-block-type="image"]')[0].click(); };
  const imageSrc = () => (blocks().find((b) => b.type === 'image') as { src: string }).src;

  it('validateImageFile: type allow-list (png/jpeg/gif/webp), extension fallback, size', () => {
    expect(validateImageFile(file('a.png', 'image/png'), 100)).toBeNull();
    expect(validateImageFile(file('a.jpg', 'image/jpeg'), 100)).toBeNull();
    expect(validateImageFile(file('a.gif', 'image/gif'), 100)).toBeNull();
    expect(validateImageFile(file('a.webp', 'image/webp'), 100)).toBeNull();
    expect(validateImageFile(file('a.txt', 'text/plain'), 100)).toBe('uploadErrType');
    expect(validateImageFile(file('a.svg', 'image/svg+xml'), 100)).toBe('uploadErrType');
    expect(validateImageFile(file('a.png', ''), 100)).toBeNull(); // empty MIME: trust the extension
    expect(validateImageFile(file('a.exe', ''), 100)).toBe('uploadErrType');
    expect(validateImageFile(file('a.png', 'image/png', 101), 100)).toBe('uploadErrSize');
    expect(DEFAULT_MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('rejects a non-image without calling the uploader and shows an inline localized error', async () => {
    const imageUploader = vi.fn(async () => 'https://cdn/x.png');
    mount({ design: undefined, imageUploader });
    selectImage();
    await choose(uploadInput(), file('note.txt', 'text/plain'));
    expect(imageUploader).not.toHaveBeenCalled();
    expect(q('.mc-panel .mc-upload-error').textContent).toContain('note.txt');
    expect(q('.mc-panel .mc-upload-error').getAttribute('role')).toBe('alert');
    expect(imageSrc()).toBe('');
  });

  it('rejects oversize files (default 5 MB, configurable via maxImageBytes) before the uploader runs', async () => {
    const imageUploader = vi.fn(async () => 'https://cdn/x.png');
    mount({ design: undefined, imageUploader });
    selectImage();
    await choose(uploadInput(), file('big.png', 'image/png', 5 * 1024 * 1024 + 1));
    expect(imageUploader).not.toHaveBeenCalled();
    expect(q('.mc-panel .mc-upload-error').textContent).toContain('5 MB');
    ed.destroy();
    mount({ design: undefined, imageUploader, maxImageBytes: 1000 });
    selectImage();
    await choose(uploadInput(), file('mid.png', 'image/png', 2000));
    expect(imageUploader).not.toHaveBeenCalled();
    expect(q('.mc-panel .mc-upload-error').textContent).toMatch(/1000 B|1 KB/);
    await choose(uploadInput(), file('ok.png', 'image/png', 900));
    expect(imageUploader).toHaveBeenCalledTimes(1);
    expect(imageSrc()).toBe('https://cdn/x.png');
  });

  it('shows a pending state while uploading and applies the returned URL', async () => {
    let resolve!: (u: string) => void;
    mount({ design: undefined, imageUploader: () => new Promise<string>((r) => { resolve = r; }) });
    selectImage();
    const input = uploadInput();
    const p = choose(input, file('a.png', 'image/png'));
    await tick();
    expect(input.disabled).toBe(true);
    expect(q('.mc-upload-status').hidden).toBe(false);
    resolve('https://cdn/a.png');
    await p;
    expect(imageSrc()).toBe('https://cdn/a.png');
    expect(qa('.mc-upload-error')).toHaveLength(0);
  });

  it('catches uploader rejections and synchronous throws and shows an error', async () => {
    mount({ design: undefined, imageUploader: () => Promise.reject(new Error('boom')) });
    selectImage();
    await choose(uploadInput(), file('a.png', 'image/png'));
    expect(q('.mc-panel .mc-upload-error').textContent).toContain('a.png');
    expect(uploadInput().disabled).toBe(false); // back to idle, can retry
    expect(imageSrc()).toBe('');
    ed.destroy();
    mount({ design: undefined, imageUploader: (() => { throw new Error('sync'); }) as never });
    selectImage();
    await choose(uploadInput(), file('b.png', 'image/png'));
    expect(q('.mc-panel .mc-upload-error')).not.toBeNull();
  });

  it('OS file drop: non-images / oversize files create no block and show a notice; valid images become blocks with a pending state', async () => {
    let resolve!: (u: string) => void;
    const imageUploader = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    mount({ design: undefined, imageUploader });
    qa('[data-block-type="text"]')[0].click();
    const wrap = q('.mc-canvas-wrap');
    const drop = (files: File[]) => {
      const dt = { types: ['Files'], files, setData() {}, dropEffect: '', effectAllowed: '' };
      for (const type of ['dragover', 'drop']) { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { dataTransfer: dt, clientY: 1, clientX: 1 }); (q('.mc-col') ?? wrap).dispatchEvent(e); }
    };
    const n = blocks().length;
    drop([file('a.txt', 'text/plain')]);
    expect(blocks().length).toBe(n);
    expect(q('.mc-notice').textContent).toContain('a.txt');
    expect(imageUploader).not.toHaveBeenCalled();
    drop([file('huge.png', 'image/png', 6 * 1024 * 1024), file('ok.png', 'image/png')]);
    expect(blocks().length).toBe(n + 1); // only the valid one
    expect(q('.mc-notice').textContent).toContain('huge.png');
    expect(imageUploader).toHaveBeenCalledTimes(1);
    expect(q('.mc-img-ph[aria-busy="true"] .mc-spin')).not.toBeNull(); // pending state on the placeholder
    resolve('https://cdn/ok.png');
    await tick(); await tick();
    expect(q('.mc-img-ph[aria-busy="true"]', )).toBeNull();
    expect(blocks().some((b) => b.type === 'image' && b.src === 'https://cdn/ok.png')).toBe(true);
  });

  it('OS file drop: an uploader failure keeps the placeholder, ends the pending state and reports the error', async () => {
    mount({ design: undefined, imageUploader: () => Promise.reject(new Error('nope')) });
    qa('[data-block-type="text"]')[0].click();
    const dt = { types: ['Files'], files: [file('x.png', 'image/png')], setData() {} };
    for (const type of ['dragover', 'drop']) { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { dataTransfer: dt, clientY: 1 }); q('.mc-col').dispatchEvent(e); }
    await tick(); await tick(); await tick();
    expect(qa('.mc-img-ph[aria-busy="true"]')).toHaveLength(0);
    expect(q('.mc-notice').textContent).toContain('x.png');
  });

  it('error / status messages exist in ja too', () => {
    for (const k of ['uploadErrType', 'uploadErrSize', 'uploadErrFailed', 'uploading', 'dismiss'] as const) expect(locales.ja[k]).not.toBe(en[k]);
  });
});

describe('DnD: releasing inside the dragged block\'s own box is a stable no-op', () => {
  it('no indicator, no change, even right at the top edge', () => {
    mount();
    const fire = (el: Element, type: string, clientX: number, clientY: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { clientX, clientY, dataTransfer: { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' } });
      el.dispatchEvent(e);
      return e;
    };
    const blk = qa('.mc-block')[0];
    blk.click();
    const rect = { left: 10, top: 100, right: 110, bottom: 160, width: 100, height: 60, x: 10, y: 100, toJSON() {} } as DOMRect;
    vi.spyOn(q('.mc-block.selected'), 'getBoundingClientRect').mockReturnValue(rect);
    const before = JSON.stringify(ed.getDesign());
    fire(q('.mc-block.selected .mc-handle'), 'dragstart', 0, 0);
    const over = fire(q('.mc-block.selected'), 'dragover', 50, 101); // 1px inside the top edge
    expect(over.defaultPrevented).toBe(true);
    expect(qa('.mc-indicator')).toHaveLength(0);
    fire(q('.mc-canvas-wrap'), 'drop', 50, 101);
    expect(JSON.stringify(ed.getDesign())).toBe(before);
    expect(qa('.mc-indicator')).toHaveLength(0);
    expect(qa('.mc-dragging')).toHaveLength(0);
  });
});

describe('B9: rich text paste and cleanup', () => {
  const paste = (editable: HTMLElement, data: Record<string, string>) => {
    const e = new Event('paste', { bubbles: true, cancelable: true });
    Object.assign(e, { clipboardData: { getData: (t: string) => data[t] ?? '' } });
    editable.dispatchEvent(e);
    return e;
  };
  const openText = () => {
    qa('.mc-block').find((b) => b.querySelector('[data-editable]'))!.click();
    const el = q('[contenteditable="true"]');
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(r);
    return el;
  };
  const storedHtml = (el: HTMLElement) => (blocks().find((b) => b.id === el.dataset.editable) as { html: string }).html;

  it('sanitises pasted HTML (no iframe / script / on*), normalises paragraphs and syncs to the design', () => {
    mount();
    const el = openText();
    const e = paste(el, { 'text/html': '<!--StartFragment--><p class="MsoNormal" style="font-size:40px">pasted</p><iframe src="https://evil.example"></iframe><script>x()</script><p onclick="x()">second <b>bold</b></p>', 'text/plain': 'pasted second bold' });
    expect(e.defaultPrevented).toBe(true);
    expect(el.querySelector('iframe, script')).toBeNull();
    expect(el.innerHTML).not.toContain('onclick');
    expect(el.innerHTML).not.toContain('MsoNormal');
    expect(el.textContent).toContain('pasted');
    const pasted = Array.from(el.querySelectorAll('p')).filter((p) => /pasted|second/.test(p.textContent ?? ''));
    expect(pasted.length).toBeGreaterThan(0);
    expect(pasted.every((p) => p.style.margin === '0px' || p.getAttribute('style') === 'margin:0')).toBe(true);
    expect(el.innerHTML).not.toContain('font-size:40px');
    expect(storedHtml(el)).toContain('second');
    expect(storedHtml(el)).not.toContain('iframe');
  });

  it('plain text is inserted escaped, with line breaks', () => {
    mount();
    const el = openText();
    paste(el, { 'text/plain': 'a <b>x</b>\nline2' });
    expect(el.innerHTML).toContain('a &lt;b&gt;x&lt;/b&gt;<br>line2');
    expect(el.querySelector('b')).toBeNull();
  });

  it('cleanRichHtml removes stray empty paragraphs and empty style attributes but keeps intentional blank lines', () => {
    const out = cleanRichHtml('<p style="margin:0"></p><ul><li style="">one</li></ul><p></p><p style="margin:0"><br></p><span style=" ">x</span><a href="https://e.com" tabindex="-1">l</a>');
    expect(out).toBe('<ul><li>one</li></ul><p style="margin:0"><br></p><span>x</span><a href="https://e.com">l</a>');
  });

  it('normalizePasted drops comments/style/class/id and gives paragraphs margin:0', () => {
    const t = document.createElement('template');
    t.innerHTML = '<!--c--><p class="a" id="i" style="color:red">x</p><div style="margin:9px">y</div>';
    normalizePasted(t.content);
    expect(t.innerHTML).toBe('<p style="margin:0">x</p><div>y</div>');
  });

  it('typing then syncing never stores empty style="" or stray empty <p>', () => {
    mount();
    const el = openText();
    el.innerHTML = '<p style="margin:0"></p><ul><li style="">item</li></ul><p></p>';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(storedHtml(el)).toBe('<ul><li>item</li></ul>');
  });
});
