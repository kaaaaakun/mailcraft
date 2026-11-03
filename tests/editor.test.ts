import { beforeEach, describe, expect, it } from 'vitest';
import { createEditor, createSampleDesign } from '../src';

describe('createEditor (jsdom smoke test)', () => {
  let el: HTMLElement;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });

  it('mounts, renders rows and exports HTML', () => {
    const ed = createEditor(el, { design: createSampleDesign() });
    expect(el.querySelectorAll('.mc-row')).toHaveLength(6);
    expect(ed.exportHtml()).toContain('autumn collection');
  });

  it('adds a block by clicking the palette and reports changes', () => {
    let last = 0;
    const ed = createEditor(el, { onChange: (d) => { last = d.rows.length; } });
    const item = Array.from(el.querySelectorAll<HTMLElement>('[data-block-type]')).find((i) => i.dataset.blockType === 'button')!;
    item.click();
    expect(last).toBe(1);
    expect(ed.getDesign().rows[0].columns[0].blocks[0].type).toBe('button');
    expect(el.querySelector('.mc-block.selected')).not.toBeNull();
  });

  it('undo removes the added block', () => {
    const ed = createEditor(el);
    Array.from(el.querySelectorAll<HTMLElement>('[data-block-type]')).find((i) => i.dataset.blockType === 'divider')!.click();
    expect(ed.getDesign().rows).toHaveLength(1);
    ed.undo();
    expect(ed.getDesign().rows).toHaveLength(0);
  });

  it('sanitizes dangerous markup in loaded text blocks on the canvas', () => {
    const d = createSampleDesign();
    const b = d.rows[2].columns[0].blocks[0];
    if (b.type === 'text') b.html = '<p onclick="x()">hi<script>alert(1)</script></p>';
    createEditor(el, { design: d });
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.innerHTML).not.toContain('onclick');
  });
});
