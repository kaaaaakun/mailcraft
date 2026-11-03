import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor, defaultLayout } from '../src';
import { mergeLayout, resolveLayout } from '../src/editor/layout';

type RO = { cb: ResizeObserverCallback; targets: Element[]; disconnected: boolean };
let observers: RO[] = [];

function mockResizeObserver() {
  observers = [];
  vi.stubGlobal('ResizeObserver', class {
    o: RO;
    constructor(cb: ResizeObserverCallback) { this.o = { cb, targets: [], disconnected: false }; observers.push(this.o); }
    observe(t: Element) { this.o.targets.push(t); }
    unobserve() {}
    disconnect() { this.o.disconnected = true; }
  });
}
const resizeTo = (width: number) => observers.forEach((o) => o.cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));

describe('layout helpers', () => {
  it('merges valid partials and ignores invalid values', () => {
    const l = mergeLayout(defaultLayout, { mode: 'stacked', breakpoints: { compact: 1000 }, sidebars: { left: false }, leftWidth: 300 });
    expect(l).toMatchObject({ mode: 'stacked', breakpoints: { compact: 1000, stacked: 820 }, sidebars: { left: false, right: true }, leftWidth: 300 });
    const bad = mergeLayout(l, { mode: 'huge', breakpoints: { compact: -1, stacked: 'x' }, sidebars: { left: 'no', right: 0 }, leftWidth: NaN, rightWidth: Infinity });
    expect(bad).toEqual(l);
    expect(mergeLayout(l, null)).toEqual(l);
    expect(mergeLayout(l, 'str')).toEqual(l);
    expect(defaultLayout.mode).toBe('auto'); // base not mutated
  });
  it('clamps widths and rejects inverted breakpoints', () => {
    const l = mergeLayout(defaultLayout, { leftWidth: 10, rightWidth: 9999 });
    expect(l.leftWidth).toBe(160);
    expect(l.rightWidth).toBe(560);
    expect(mergeLayout(defaultLayout, { breakpoints: { compact: 500 } }).breakpoints).toEqual(defaultLayout.breakpoints);
  });
  it('resolves by width using the breakpoints, with forced modes winning', () => {
    const l = defaultLayout;
    expect([1400, 1100, 1099, 820, 819, 300].map((w) => resolveLayout(l, w))).toEqual(['wide', 'wide', 'compact', 'compact', 'stacked', 'stacked']);
    expect(resolveLayout(l, 0)).toBe('wide');
    expect(resolveLayout({ ...l, mode: 'stacked' }, 2000)).toBe('stacked');
    expect(resolveLayout({ ...l, mode: 'split' }, 100)).toBe('wide');
    expect(resolveLayout({ ...l, mode: 'compact' }, 100)).toBe('compact');
  });
});

describe('layout option on createEditor', () => {
  let el: HTMLElement;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });
  afterEach(() => { vi.unstubAllGlobals(); el.remove(); });
  const root = () => el.querySelector<HTMLElement>('.mc-root')!;

  it('works without ResizeObserver (jsdom): wide by default, forced modes still apply', () => {
    const ed = createEditor(el);
    expect(root().dataset.layout).toBe('wide');
    expect(ed.getLayout()).toEqual(defaultLayout);
    ed.setLayout({ mode: 'stacked' });
    expect(root().dataset.layout).toBe('stacked');
    expect(ed.getResolvedLayout()).toBe('stacked');
    ed.destroy();
  });

  it('switches by observed container width and notifies once per change', () => {
    mockResizeObserver();
    const seen: string[] = [];
    const ed = createEditor(el, { onLayoutChange: (m) => seen.push(m) });
    expect(observers[0].targets[0]).toBe(root());
    resizeTo(1400); expect(root().dataset.layout).toBe('wide');
    resizeTo(900); expect(root().dataset.layout).toBe('compact');
    resizeTo(950); expect(root().dataset.layout).toBe('compact');
    resizeTo(500); expect(root().dataset.layout).toBe('stacked');
    resizeTo(1200); expect(root().dataset.layout).toBe('wide');
    expect(seen).toEqual(['compact', 'stacked', 'wide']);
    ed.destroy();
    expect(observers[0].disconnected).toBe(true);
  });

  it('custom breakpoints, forced mode and accumulation of partials', () => {
    mockResizeObserver();
    const ed = createEditor(el, { layout: { breakpoints: { compact: 1500, stacked: 1000 } } });
    resizeTo(1200); expect(root().dataset.layout).toBe('compact');
    ed.setLayout({ leftWidth: 300 });
    ed.setLayout({ sidebars: { right: false } });
    ed.setLayout({ mode: 'split' });
    expect(root().dataset.layout).toBe('wide'); // forced even though 1200 < 1500
    expect(ed.getLayout()).toMatchObject({ mode: 'split', leftWidth: 300, breakpoints: { compact: 1500, stacked: 1000 }, sidebars: { left: true, right: false } });
    ed.setLayout({ mode: 'auto' });
    expect(root().dataset.layout).toBe('compact');
    const copy = ed.getLayout(); copy.sidebars.left = false;
    expect(ed.getLayout().sidebars.left).toBe(true); // getLayout returns a copy
  });

  it('ignores invalid options instead of throwing', () => {
    const ed = createEditor(el, { layout: { mode: 'weird', leftWidth: 'wide', sidebars: null } as never });
    expect(ed.getLayout()).toEqual(defaultLayout);
    expect(() => ed.setLayout(undefined as never)).not.toThrow();
    expect(() => ed.setLayout({ breakpoints: { compact: NaN } })).not.toThrow();
  });

  it('writes pane widths as CSS variables (clamped)', () => {
    const ed = createEditor(el, { layout: { leftWidth: 300, rightWidth: 5000 } });
    expect(root().style.getPropertyValue('--mc-left-w')).toBe('300px');
    expect(root().style.getPropertyValue('--mc-right-w')).toBe('560px');
    ed.setLayout({ rightWidth: 350 });
    expect(root().style.getPropertyValue('--mc-right-w')).toBe('350px');
  });

  it('hides the sidebars on demand and brings them back, without re-rendering them', () => {
    const ed = createEditor(el);
    const left = el.querySelector<HTMLElement>('.mc-sidebar')!;
    const right = el.querySelector<HTMLElement>('.mc-panel')!;
    const tile = left.querySelector('[data-block-type="text"]');
    expect(left.hidden || right.hidden).toBe(false);
    ed.setLayout({ sidebars: { left: false } });
    expect(left.hidden).toBe(true); expect(right.hidden).toBe(false);
    ed.setLayout({ sidebars: { right: false } });
    expect(right.hidden).toBe(true);
    ed.setLayout({ sidebars: { left: true, right: true } });
    expect(left.hidden || right.hidden).toBe(false);
    expect(left.querySelector('[data-block-type="text"]')).toBe(tile);
  });

  it('click-to-add keeps working in every forced mode', () => {
    const ed = createEditor(el);
    for (const mode of ['split', 'compact', 'stacked'] as const) {
      ed.setLayout({ mode });
      el.querySelector<HTMLElement>('[data-block-type="divider"]')!.click();
    }
    expect(ed.getDesign().rows.flatMap((r) => r.columns[0].blocks)).toHaveLength(3);
  });

  it('layout change does not touch the design or the selection', () => {
    mockResizeObserver();
    const ed = createEditor(el);
    el.querySelector<HTMLElement>('[data-block-type="button"]')!.click();
    const sel = el.querySelector('.mc-block.selected');
    const before = JSON.stringify(ed.getDesign());
    resizeTo(600);
    expect(el.querySelector('.mc-block.selected')).toBe(sel);
    expect(JSON.stringify(ed.getDesign())).toBe(before);
  });
});
