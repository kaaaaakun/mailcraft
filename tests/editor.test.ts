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

  describe('3-pane layout', () => {
    const left = () => el.querySelector('.mc-sidebar')!;
    const right = () => el.querySelector<HTMLElement>('.mc-panel')!;

    it('puts add tools on the left and body settings on the right by default', () => {
      createEditor(el, { design: createSampleDesign() });
      expect(left().querySelector('[data-block-type="text"]')).not.toBeNull();
      expect(right().querySelector('[data-block-type]')).toBeNull();
      expect(right().dataset.view).toBe('body');
      expect(left().querySelectorAll('[data-tab]')).toHaveLength(2);
    });

    it('switches the right panel to properties on selection and back to body on deselect, keeping the left palette', () => {
      createEditor(el, { design: createSampleDesign() });
      const palette = left().querySelector('[data-block-type="text"]');
      el.querySelector<HTMLElement>('.mc-block')!.click();
      expect(right().dataset.view).toBe('props');
      expect(left().querySelector('[data-block-type="text"]')).toBe(palette); // palette not re-rendered
      el.querySelector<HTMLElement>('.mc-canvas-wrap')!.click();
      expect(right().dataset.view).toBe('body');
    });

    it('keeps collapsed sections collapsed across re-renders', () => {
      createEditor(el, { design: createSampleDesign() });
      el.querySelector<HTMLElement>('.mc-block')!.click();
      const det = right().querySelector<HTMLDetailsElement>('details.mc-section')!;
      const title = det.querySelector('summary span')!.textContent;
      det.open = false;
      det.dispatchEvent(new Event('toggle'));
      el.querySelectorAll<HTMLElement>('.mc-block')[1].click();
      el.querySelector<HTMLElement>('.mc-block')!.click();
      const again = Array.from(right().querySelectorAll<HTMLDetailsElement>('details.mc-section')).find((d) => d.querySelector('summary span')!.textContent === title)!;
      expect(again.open).toBe(false);
    });
  });
});
