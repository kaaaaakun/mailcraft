import { describe, expect, it } from 'vitest';
import { createBlock, createDesign, createRow, createSampleDesign } from '../src/core/defaults';
import { duplicateBlock, findBlock, insertBlock, moveBlock, moveRow, setRowLayout } from '../src/core/ops';
import { renderHtml, safeUrl } from '../src/core/render';
import { EditorStore } from '../src/core/store';

describe('renderHtml', () => {
  it('produces a table-based document with inline styles', () => {
    const html = renderHtml(createSampleDesign(), { title: 'T' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>T</title>');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('Welcome to Mailcraft');
    expect(html).toContain('width="50%"'); // 1:1 row
  });

  it('computes column widths from ratios', () => {
    const d = createDesign();
    d.rows.push(createRow([1, 2]));
    const html = renderHtml(d);
    expect(html).toContain('width="33.33%"');
    expect(html).toContain('width="66.67%"');
  });

  it('escapes user text and blocks unsafe URLs', () => {
    const d = createDesign();
    const row = createRow([1]);
    const btn = createBlock('button');
    if (btn.type === 'button') { btn.text = '<script>alert(1)</script>'; btn.href = 'javascript:alert(1)'; }
    row.columns[0].blocks.push(btn);
    d.rows.push(row);
    const html = renderHtml(d);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
  });

  it('rejects non-image data URLs and omits empty images', () => {
    const d = createDesign();
    const row = createRow([1]);
    const img = createBlock('image');
    if (img.type === 'image') img.src = 'data:text/html;base64,PHNjcmlwdD4=';
    row.columns[0].blocks.push(img);
    d.rows.push(row);
    expect(renderHtml(d)).not.toContain('<img');
  });

  it('adds a hidden preheader only when set', () => {
    const d = createDesign();
    expect(renderHtml(d)).not.toContain('display:none');
    d.body.preheader = 'Hi';
    expect(renderHtml(d)).toContain('display:none');
  });

  it('safeUrl allows merge tags and mailto', () => {
    expect(safeUrl('{{unsubscribe_url}}')).toBe('{{unsubscribe_url}}');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('  JavaScript:1')).toBe('');
  });
});

describe('ops', () => {
  const setup = () => {
    const d = createDesign();
    const row = createRow([1, 1]);
    const [a, b, c] = [createBlock('text'), createBlock('text'), createBlock('text')];
    row.columns[0].blocks.push(a, b, c);
    d.rows.push(row);
    return { d, row, a, b, c };
  };

  it('moves within the same column, accounting for removal shift', () => {
    const { d, row, a, b, c } = setup();
    moveBlock(d, a.id, row.columns[0].id, 3); // to the very end
    expect(row.columns[0].blocks.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it('moves across columns', () => {
    const { d, row, a } = setup();
    moveBlock(d, a.id, row.columns[1].id, 0);
    expect(row.columns[1].blocks[0].id).toBe(a.id);
    expect(row.columns[0].blocks).toHaveLength(2);
  });

  it('duplicates with fresh ids', () => {
    const { d, a } = setup();
    const copy = duplicateBlock(d, a.id)!;
    expect(copy.id).not.toBe(a.id);
    expect(findBlock(d, copy.id)!.index).toBe(1);
  });

  it('moves rows', () => {
    const { d, row } = setup();
    const r2 = createRow([1]);
    d.rows.push(r2);
    moveRow(d, row.id, 2);
    expect(d.rows.map((r) => r.id)).toEqual([r2.id, row.id]);
  });

  it('keeps blocks when shrinking a layout', () => {
    const { row } = setup();
    insertBlock({ version: 1, body: createDesign().body, rows: [row] }, row.columns[1].id, 0, createBlock('divider'));
    setRowLayout(row, [1]);
    expect(row.columns).toHaveLength(1);
    expect(row.columns[0].blocks).toHaveLength(4);
  });
});

describe('EditorStore', () => {
  it('supports undo/redo', () => {
    const s = new EditorStore(createDesign());
    s.change((d) => d.rows.push(createRow([1])));
    expect(s.design.rows).toHaveLength(1);
    s.undo();
    expect(s.design.rows).toHaveLength(0);
    s.redo();
    expect(s.design.rows).toHaveLength(1);
  });

  it('coalesces changes with the same key into one undo step', () => {
    const s = new EditorStore(createDesign());
    for (const w of [300, 400, 500]) s.change((d) => { d.body.contentWidth = w; }, { coalesceKey: 'w' });
    s.undo();
    expect(s.design.body.contentWidth).toBe(600);
    expect(s.canUndo).toBe(false);
  });
});
