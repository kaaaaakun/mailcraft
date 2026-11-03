import type { Block, BlockType, Design, Padding, Row } from './types.js';

export function uid(prefix = 'mc'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rnd}`;
}

export const pad = (top = 10, right = 20, bottom = 10, left = 20): Padding => ({ top, right, bottom, left });

export const FONT_FAMILIES: Record<string, string> = {
  'Sans-serif': "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  Serif: "Georgia, 'Times New Roman', serif",
  Monospace: "'Courier New', Courier, monospace",
  'Japanese (Gothic)': "'Hiragino Kaku Gothic ProN', Meiryo, 'Yu Gothic', sans-serif",
};

export function createBlock(type: BlockType): Block {
  const id = uid('blk');
  switch (type) {
    case 'text':
      return { id, type, html: '<p style="margin:0">Write something great here…</p>', color: '#333333', fontSize: 15, lineHeight: 1.6, align: 'left', padding: pad() };
    case 'heading':
      return { id, type, text: 'Your heading', level: 1, color: '#111111', fontSize: 28, align: 'left', padding: pad(10, 20, 10, 20) };
    case 'image':
      return { id, type, src: '', alt: '', href: '', widthPercent: 100, align: 'center', padding: pad(0, 0, 0, 0) };
    case 'button':
      return { id, type, text: 'Click me', href: 'https://example.com', backgroundColor: '#4f46e5', color: '#ffffff', borderRadius: 6, fontSize: 16, innerPaddingY: 12, innerPaddingX: 28, align: 'center', padding: pad(14, 20, 14, 20) };
    case 'divider':
      return { id, type, color: '#e5e7eb', thickness: 1, padding: pad(10, 20, 10, 20) };
    case 'spacer':
      return { id, type, height: 24, padding: pad(0, 0, 0, 0) };
    case 'html':
      return { id, type, html: '<p style="margin:0">Custom HTML</p>', padding: pad(0, 0, 0, 0) };
  }
}

export function createRow(ratios: number[] = [1]): Row {
  return {
    id: uid('row'),
    ratios: [...ratios],
    columns: ratios.map(() => ({ id: uid('col'), blocks: [] })),
    backgroundColor: '',
    padding: pad(0, 0, 0, 0),
    stackOnMobile: true,
  };
}

export function createDesign(): Design {
  return {
    version: 1,
    body: {
      backgroundColor: '#f3f4f6',
      contentBackgroundColor: '#ffffff',
      contentWidth: 600,
      fontFamily: FONT_FAMILIES['Sans-serif'],
      preheader: '',
    },
    rows: [],
  };
}

/** A small starter template used by the demo. */
export function createSampleDesign(): Design {
  const d = createDesign();
  d.body.preheader = 'Welcome aboard 🎉';
  const hero = createRow([1]);
  const h = createBlock('heading');
  if (h.type === 'heading') { h.text = 'Welcome to Mailcraft 💌'; h.align = 'center'; }
  const t = createBlock('text');
  if (t.type === 'text') { t.html = '<p style="margin:0;text-align:center">Drag blocks from the left, tweak them on the right, export <b>email-safe HTML</b>.</p>'; t.align = 'center'; }
  const b = createBlock('button');
  hero.columns[0].blocks.push(h, t, b);
  const two = createRow([1, 1]);
  for (const c of two.columns) {
    const hh = createBlock('heading');
    if (hh.type === 'heading') { hh.level = 2; hh.fontSize = 20; hh.text = c === two.columns[0] ? 'Fast ⚡' : 'Portable 📦'; }
    const tt = createBlock('text');
    c.blocks.push(hh, tt);
  }
  d.rows.push(hero, two);
  return d;
}
