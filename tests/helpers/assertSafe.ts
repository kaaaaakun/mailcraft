import { expect } from 'vitest';

/** Tags the renderer + sanitizer may legitimately produce. Anything else in the output is a bug. */
const OK_TAGS = new Set((
  'html head meta title style body table tbody thead tfoot tr td th div a img span p br b strong i em u s strike del ins sub sup small ul ol li h1 h2 h3 h4 h5 h6 blockquote hr pre code font mark ' +
  'caption colgroup col center section article header footer figure figcaption dl dt dd abbr cite address big tt q'
).split(' '));

const NOISE = new RegExp('[\\x00-\\x20\\x7f-\\x9f' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f) + String.fromCharCode(0x2028, 0x2029, 0xfeff) + ']', 'g');

/** Asserts the HTML is safe and structurally balanced. Returns the parsed document. */
export function assertSafe(html: string, label = ''): Document {
  const where = `${label}\n${html.slice(0, 400)}`;
  expect(/<script/i.test(html), `<script in output ${where}`).toBe(false);
  // balanced: every non-void open tag has a matching close tag in the raw output
  const open: Record<string, number> = {};
  const VOID = new Set(['meta', 'img', 'br', 'hr', 'col']);
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const name = m[2].toLowerCase();
    if (VOID.has(name)) continue;
    open[name] = (open[name] ?? 0) + (m[1] ? -1 : 1);
  }
  for (const [k, v] of Object.entries(open)) expect(v, `unbalanced <${k}> ${where}`).toBe(0);

  const bad: string[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (!OK_TAGS.has(tag)) bad.push(`unexpected <${tag}>`);
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name)) bad.push(`event handler ${a.name}`);
      const v = a.value.replace(NOISE, '').toLowerCase();
      const urlAttr = ['href', 'src', 'background', 'action', 'formaction', 'xlink:href', 'poster', 'style'].includes(a.name);
      if (urlAttr && (v.includes('javascript:') || v.includes('vbscript:') || v.includes('expression('))) bad.push(`script url in ${a.name}=${a.value}`);
      if (a.name === 'style' && /url\(|@import|behavior|-moz-binding/.test(v)) bad.push(`css url in style=${a.value}`);
      if ((a.name === 'src' || a.name === 'href') && !/^(https?:|mailto:|tel:|#|\/|\{\{|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(v)) bad.push(`bad ${a.name}=${a.value}`);
    }
  }
  expect(bad, where).toEqual([]);
  return doc;
}

