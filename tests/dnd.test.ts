import { beforeEach, describe, expect, it } from 'vitest';
import { createEditor, createSampleDesign, type EditorInstance } from '../src';

/** jsdom has no DragEvent / layout: build plain events. getBoundingClientRect() is all zeros, so clientY<0 means "before everything" and clientY>0 "after everything". */
function fire(el: Element, type: string, clientY = 0, extra: Record<string, unknown> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientY, dataTransfer: { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }, ...extra });
  el.dispatchEvent(e);
  return e;
}

describe('drag & drop', () => {
  let el: HTMLElement;
  let ed: EditorInstance;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });

  const tile = (type: string) => el.querySelector<HTMLElement>(`[data-block-type="${type}"]`)!;
  const rowTile = (layout: string) => { el.querySelector<HTMLElement>('[data-tab="rows"]')!.click(); return el.querySelector<HTMLElement>(`[data-row-layout="${layout}"]`)!; };
  const clean = () => {
    expect(el.querySelectorAll('.mc-indicator')).toHaveLength(0);
    expect(el.querySelector('.mc-dragging')).toBeNull();
  };

  it('a block released between rows (outside any column) becomes a new 1-column row at that position', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const before = ed.getDesign().rows.length;
    fire(tile('button'), 'dragstart');
    const over = fire(el.querySelectorAll('.mc-row')[1], 'dragover', 1); // on the row itself, not in a column
    expect(over.defaultPrevented).toBe(true);
    expect(el.querySelectorAll('.mc-indicator')).toHaveLength(1);
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    const d = ed.getDesign();
    expect(d.rows).toHaveLength(before + 1);
    expect(d.rows[6].columns).toHaveLength(1);
    expect(d.rows[6].columns[0].blocks[0].type).toBe('button');
    clean();
  });

  it('blocks and rows can be dropped on an empty canvas', () => {
    ed = createEditor(el);
    fire(tile('heading'), 'dragstart');
    fire(el.querySelector('.mc-canvas')!, 'dragover');
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    expect(ed.getDesign().rows).toHaveLength(1);
    fire(rowTile('1:1'), 'dragstart');
    fire(el.querySelector('.mc-canvas')!, 'dragover', 1);
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    const rows = ed.getDesign().rows;
    expect(rows).toHaveLength(2);
    expect(rows[1].columns).toHaveLength(2);
    clean();
  });

  it('a row tile dragged over a column still targets a row position (never a column)', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const col = el.querySelectorAll('.mc-col')[0];
    fire(rowTile('1:2'), 'dragstart');
    expect(fire(col, 'dragover', -1).defaultPrevented).toBe(true);
    fire(col, 'drop');
    const d = ed.getDesign();
    expect(d.rows).toHaveLength(7);
    expect(d.rows[0].ratios).toEqual([1, 2]);
    expect(d.rows[1].columns.flatMap((c) => c.blocks)).toHaveLength(1); // header row untouched
    clean();
  });

  it('a new block over a column is inserted into that column', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const col = el.querySelectorAll<HTMLElement>('.mc-col')[0];
    fire(tile('spacer'), 'dragstart');
    fire(col, 'dragover', -1);
    fire(col, 'drop');
    const d = ed.getDesign();
    expect(d.rows).toHaveLength(6);
    expect(d.rows[0].columns[0].blocks[0].type).toBe('spacer');
    clean();
  });

  it('moving a block into a gap creates a row and removes it from its old column', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const id = ed.getDesign().rows[1].columns[0].blocks[0].id;
    const handle = el.querySelector<HTMLElement>(`[data-id="${id}"] .mc-handle`)!;
    fire(handle, 'dragstart');
    fire(el.querySelectorAll('.mc-row')[4], 'dragover', 1);
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    const d = ed.getDesign();
    expect(d.rows).toHaveLength(7);
    expect(d.rows[1].columns[0].blocks.some((b) => b.id === id)).toBe(false);
    expect(d.rows[6].columns[0].blocks[0].id).toBe(id);
    clean();
  });

  it('moving a row reorders rows', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const first = ed.getDesign().rows[0].id;
    fire(el.querySelector<HTMLElement>('.mc-row .mc-handle')!, 'dragstart');
    fire(el.querySelector('.mc-canvas')!, 'dragover', 1);
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    const d = ed.getDesign();
    expect(d.rows).toHaveLength(6);
    expect(d.rows[5].id).toBe(first);
    clean();
  });

  it('a block dropped where nothing is droppable (panel, rows tab) changes nothing and leaves no indicator', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    const json = JSON.stringify(ed.getDesign());
    const t = tile('button');
    fire(t, 'dragstart');
    fire(el.querySelectorAll('.mc-col')[0], 'dragover', 1);   // indicator appears in the canvas...
    expect(el.querySelectorAll('.mc-indicator')).toHaveLength(1);
    fire(el.querySelector('.mc-canvas-wrap')!, 'dragleave', 0, { relatedTarget: el.querySelector('.mc-panel') }); // ...pointer leaves for the panel
    expect(el.querySelectorAll('.mc-indicator')).toHaveLength(0);
    expect(fire(el.querySelector('[data-tab="rows"]')!, 'dragover').defaultPrevented).toBe(false); // not a drop target
    fire(t, 'dragend');
    expect(JSON.stringify(ed.getDesign())).toBe(json);
    clean();
  });

  it('dragend cleans up a cancelled drag started over a column', () => {
    ed = createEditor(el, { design: createSampleDesign() });
    fire(el.querySelector<HTMLElement>('.mc-row .mc-handle')!, 'dragstart');
    expect(el.querySelector('.mc-dragging')).not.toBeNull();
    fire(el.querySelectorAll('.mc-col')[0], 'dragover', 1);
    fire(el.querySelector('.mc-row .mc-handle')!, 'dragend');
    clean();
    // a later stray drop does nothing
    fire(el.querySelector('.mc-canvas-wrap')!, 'drop');
    expect(ed.getDesign().rows).toHaveLength(6);
  });
});
