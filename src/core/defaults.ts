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

/** Default texts for newly created blocks (the editor passes localized ones). */
export interface BlockLabels {
  text?: string;
  heading?: string;
  button?: string;
}

const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createBlock(type: BlockType, labels: BlockLabels = {}): Block {
  const id = uid('blk');
  switch (type) {
    case 'text':
      return { id, type, html: `<p style="margin:0">${escText(labels.text ?? 'Write something great here…')}</p>`, color: '#333333', fontSize: 15, lineHeight: 1.6, align: 'left', padding: pad() };
    case 'heading':
      return { id, type, text: labels.heading ?? 'Your heading', level: 1, color: '#111111', fontSize: 28, align: 'left', padding: pad(10, 20, 10, 20) };
    case 'image':
      return { id, type, src: '', alt: '', href: '', widthPercent: 100, align: 'center', padding: pad(0, 0, 0, 0) };
    case 'button':
      return { id, type, text: labels.button ?? 'Click me', href: 'https://example.com', backgroundColor: '#2f6fed', color: '#ffffff', borderRadius: 6, fontSize: 16, innerPaddingY: 12, innerPaddingX: 28, align: 'center', padding: pad(14, 20, 14, 20) };
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

const SAMPLE_TEXT = {
  en: {
    preheader: 'Fresh picks for the season, plus 20% off this week.',
    brand: 'MAPLE & CO.',
    heroTitle: 'The autumn collection is here',
    heroText: 'Warm textures, earthy tones and everyday pieces made to last. Discover what is new this season.',
    heroCta: 'Shop the collection',
    intro: 'Hi there, thanks for being part of our community. This month we are sharing three things we love, a small thank-you from us, and a few stories from the studio.',
    features: [
      ['Crafted locally', 'Every piece is made in small batches by partner studios nearby.'],
      ['Built to last', 'Natural materials and honest construction for years of daily use.'],
      ['Free returns', 'Changed your mind? Send it back within 30 days, no questions asked.'],
    ],
    offerTitle: '20% off',
    offerText: 'Use the code <b>AUTUMN20</b> at checkout. Valid until Sunday on all full-price items.',
    offerCta: 'Claim the offer',
    footer: 'You are receiving this email because you subscribed to our newsletter.<br>Maple &amp; Co., 1 Example Street &middot; <a href="#" style="color:#6b7280">Unsubscribe</a>',
  },
  ja: {
    preheader: '今季のおすすめと、今週限定の20%オフをお届けします。',
    brand: 'MAPLE & CO.',
    heroTitle: '秋の新作コレクションが登場',
    heroText: 'ぬくもりのある素材感と深みのある色合い。長く使える毎日のアイテムを、今シーズンの新作とともにご紹介します。',
    heroCta: 'コレクションを見る',
    intro: 'いつもご愛顧いただきありがとうございます。今月は、私たちが自信を持っておすすめする3つのこと、ささやかなお礼、そしてアトリエからの小さな便りをお届けします。',
    features: [
      ['地元の工房で製作', 'すべて近隣の提携工房で、少量ずつ丁寧に作っています。'],
      ['長く使える品質', '天然素材と誠実な作りで、何年も毎日使えます。'],
      ['返品無料', 'イメージと違った場合も、30日以内ならお気軽にご返品ください。'],
    ],
    offerTitle: '20%オフ',
    offerText: 'ご注文時にコード <b>AUTUMN20</b> を入力してください。日曜日まで、定価商品すべてが対象です。',
    offerCta: '特典を受け取る',
    footer: 'このメールは、ニュースレターにご登録いただいた方にお送りしています。<br>Maple &amp; Co. &middot; <a href="#" style="color:#6b7280">配信停止</a>',
  },
} as const;

/** A newsletter-style starter template used by the demo. `locale` only picks the sample copy ("en" or "ja"). */
export function createSampleDesign(locale: string = 'en'): Design {
  const tx = SAMPLE_TEXT[locale.toLowerCase().startsWith('ja') ? 'ja' : 'en'];
  const d = createDesign();
  d.body.backgroundColor = '#eef0f3';
  d.body.preheader = tx.preheader;
  const p = (html: string) => `<p style="margin:0">${html}</p>`;
  const head = (text: string, o: Partial<Extract<Block, { type: 'heading' }>> = {}): Block => ({ ...(createBlock('heading') as Extract<Block, { type: 'heading' }>), text, ...o });
  const para = (html: string, o: Partial<Extract<Block, { type: 'text' }>> = {}): Block => ({ ...(createBlock('text') as Extract<Block, { type: 'text' }>), html: p(html), ...o });
  const btn = (text: string, o: Partial<Extract<Block, { type: 'button' }>> = {}): Block => ({ ...(createBlock('button') as Extract<Block, { type: 'button' }>), text, ...o });

  const header = createRow([1]);
  header.padding = pad(8, 0, 8, 0);
  header.columns[0].blocks.push(head(tx.brand, { level: 3, fontSize: 16, align: 'center', color: '#111827', padding: pad(14, 20, 14, 20) }));

  const hero = createRow([1]);
  hero.backgroundColor = '#24345c';
  hero.padding = pad(36, 24, 36, 24);
  hero.columns[0].blocks.push(
    head(tx.heroTitle, { fontSize: 36, align: 'center', color: '#ffffff' }),
    para(tx.heroText, { align: 'center', color: '#d6def5', fontSize: 16, padding: pad(6, 20, 14, 20) }),
    btn(tx.heroCta, { backgroundColor: '#ffffff', color: '#24345c', borderRadius: 24, padding: pad(10, 20, 6, 20) }),
  );

  const intro = createRow([1]);
  intro.padding = pad(24, 12, 8, 12);
  intro.columns[0].blocks.push(para(tx.intro, { fontSize: 16, color: '#374151' }));

  const feats = createRow([1, 1, 1]);
  feats.padding = pad(8, 12, 16, 12);
  feats.columns.forEach((c, i) => {
    c.blocks.push(
      head(tx.features[i][0], { level: 3, fontSize: 18, color: '#111827', padding: pad(10, 8, 4, 8) }),
      para(tx.features[i][1], { fontSize: 14, color: '#6b7280', padding: pad(0, 8, 10, 8) }),
    );
  });

  const offer = createRow([1, 2]);
  offer.backgroundColor = '#eef3ff';
  offer.padding = pad(20, 12, 20, 12);
  offer.columns[0].blocks.push(head(tx.offerTitle, { fontSize: 40, color: '#2f6fed', align: 'center', padding: pad(14, 8, 14, 8) }));
  offer.columns[1].blocks.push(
    para(tx.offerText, { fontSize: 15, color: '#374151', padding: pad(10, 12, 8, 12) }),
    btn(tx.offerCta, { align: 'left', padding: pad(6, 12, 10, 12) }),
  );

  const footer = createRow([1]);
  footer.padding = pad(8, 12, 20, 12);
  footer.columns[0].blocks.push(
    { ...(createBlock('divider') as Block) },
    para(tx.footer, { fontSize: 12, color: '#9ca3af', align: 'center', lineHeight: 1.7 }),
  );

  d.rows.push(header, hero, intro, feats, offer, footer);
  return d;
}
