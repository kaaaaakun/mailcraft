/**
 * DOM-free allow-list HTML sanitizer (runs in Node, workers and browsers).
 *
 * It tokenizes the input and re-serializes ONLY allow-listed tags / attributes / style properties, so the output
 * is well-formed (balanced) by construction and never depends on a browser parser. Disallowed tags are unwrapped
 * (text kept); dangerous containers (script, style, svg, math, iframe, ...) are dropped together with their content.
 *
 * Profiles:
 *  - `rich`: rich-text subset (text blocks, contenteditable output).
 *  - `html`: rich-text subset + table / layout markup (custom HTML block).
 */
import { esc, isSafeColor, isSafeFontFamily, safeImgSrc, safeUrl } from './safe.js';

export type SanitizeProfile = 'rich' | 'html';

const RICH_TAGS = 'p br b strong i em u s strike del ins sub sup small a ul ol li span div h1 h2 h3 h4 h5 h6 blockquote img hr pre code font mark';
const HTML_EXTRA = 'table thead tbody tfoot tr td th caption colgroup col center section article header footer figure figcaption dl dt dd abbr cite address big tt q';
const ALLOWED: Record<SanitizeProfile, Set<string>> = {
  rich: new Set(RICH_TAGS.split(' ')),
  html: new Set(`${RICH_TAGS} ${HTML_EXTRA}`.split(' ')),
};
const VOID = new Set(['br', 'hr', 'img', 'col']);
/** Dropped together with their content. */
const DROP_WITH_CONTENT = new Set('script style iframe frame frameset object embed applet noscript template svg math title textarea xmp noembed noframes plaintext select datalist'.split(' '));

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')', sol: '/', period: '.', comma: ',', semi: ';', num: '#', excl: '!', equals: '=', quest: '?', lbrack: '[', rbrack: ']', lcub: '{', rcub: '}' };

function decodeEntities(s: string): string {
  return s.replace(/&(?:#[xX]([0-9a-fA-F]{1,8})|#(\d{1,10})|([a-zA-Z][a-zA-Z0-9]{1,10}));?/g, (m, hex, dec, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? m;
    const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\ufffd';
  });
}

// ---- style filtering ------------------------------------------------------------------------------------------

const STYLE_PROPS = new Set((
  'color background-color background font-family font-size font-weight font-style line-height text-align text-decoration text-transform letter-spacing word-spacing ' +
  'margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left ' +
  'border border-top border-right border-bottom border-left border-color border-width border-style border-radius border-collapse border-spacing ' +
  'width height max-width min-width max-height min-height display vertical-align white-space list-style-type text-indent opacity word-break overflow-wrap'
).split(' '));
const COLOR_PROPS = new Set(['color', 'background-color', 'background', 'border-color']);
const DISPLAY_OK = new Set(['block', 'inline', 'inline-block', 'none', 'table', 'table-cell', 'table-row']);
const CSS_FUNCS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'calc', 'min', 'max', 'clamp', '']);

function cssValueOk(prop: string, raw: string): boolean {
  const v = raw.replace(/\s*!important\s*$/i, '').trim();
  if (!v || v.length > 200) return false;
  if (/\\|\/\*|\*\/|[<>{};@]|&/.test(v)) return false;
  if (prop === 'font-family') return isSafeFontFamily(v) && (v.match(/'/g)?.length ?? 0) % 2 === 0 && (v.match(/"/g)?.length ?? 0) % 2 === 0;
  if (!/^[A-Za-z0-9\s#%.,()+\-/!]*$/.test(v)) return false;
  for (const m of v.matchAll(/([a-zA-Z-]*)\(/g)) if (!CSS_FUNCS.has(m[1].toLowerCase())) return false;
  if (/url|expression|javascript|behavior|binding|import|image/i.test(v)) return false;
  if (COLOR_PROPS.has(prop) && !isSafeColor(v) && !/^(inherit|none)$/i.test(v)) return false;
  if (prop === 'display') return DISPLAY_OK.has(v.toLowerCase());
  return true;
}

/** Keep only allow-listed, value-validated declarations. */
export function filterStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (STYLE_PROPS.has(prop) && cssValueOk(prop, val)) out.push(`${prop}:${val}`);
  }
  return out.join(';');
}

// ---- attribute filtering --------------------------------------------------------------------------------------

const DIGITS = /^\d{1,4}%?$/;
const SMALL_INT = /^\d{1,3}$/;

/** Returns the sanitized value for an attribute, or null to drop it. */
function attrValue(tag: string, name: string, value: string, profile: SanitizeProfile): string | null {
  const v = decodeEntities(value);
  switch (name) {
    case 'style': { const s = filterStyle(v); return s || null; }
    case 'title': return v.slice(0, 300);
    case 'lang': return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$/.test(v) ? v : null;
    case 'dir': return /^(ltr|rtl|auto)$/i.test(v) ? v.toLowerCase() : null;
    case 'align': return /^(left|center|right|justify)$/i.test(v) ? v.toLowerCase() : null;
  }
  if (tag === 'a') {
    if (name === 'href') return safeUrl(v) || null;
    if (name === 'target') return v === '_blank' ? v : null;
  }
  if (tag === 'img') {
    if (name === 'src') return safeImgSrc(v) || null;
    if (name === 'alt') return v.slice(0, 500);
    if (name === 'width' || name === 'height') return DIGITS.test(v.trim()) ? v.trim() : null;
  }
  if (tag === 'ol') {
    if (name === 'start') return /^-?\d{1,5}$/.test(v.trim()) ? v.trim() : null;
    if (name === 'type') return /^[1aAiI]$/.test(v) ? v : null;
  }
  if (tag === 'font') {
    if (name === 'color') return isSafeColor(v) ? v.trim() : null;
    if (name === 'size') return /^[1-7]$/.test(v.trim()) ? v.trim() : null;
    if (name === 'face') return isSafeFontFamily(v) ? v.trim() : null;
  }
  if (profile === 'html') {
    if (name === 'width' || name === 'height') return DIGITS.test(v.trim()) ? v.trim() : null;
    if (name === 'valign') return /^(top|middle|bottom|baseline)$/i.test(v) ? v.toLowerCase() : null;
    if (name === 'bgcolor') return isSafeColor(v) ? v.trim() : null;
    if (name === 'cellpadding' || name === 'cellspacing' || name === 'border' || name === 'colspan' || name === 'rowspan') return SMALL_INT.test(v.trim()) ? v.trim() : null;
    if (name === 'role') return v.toLowerCase() === 'presentation' ? 'presentation' : null;
  }
  return null;
}

// ---- tokenizer ------------------------------------------------------------------------------------------------

interface TagToken { name: string; attrs: [string, string][]; end: number }

const WS = /[\t\n\f\r ]/;

/** Parse a start/end tag beginning at `s[i] === '<'`. Returns null if the input ends inside the tag. */
function parseTag(s: string, i: number): TagToken | null {
  let p = i + 1;
  if (s[p] === '/') p++;
  const ns = p;
  while (p < s.length && !WS.test(s[p]) && s[p] !== '/' && s[p] !== '>') p++;
  const name = s.slice(ns, p).toLowerCase();
  const attrs: [string, string][] = [];
  while (p < s.length) {
    while (p < s.length && (WS.test(s[p]) || s[p] === '/')) p++;
    if (p >= s.length) return null;
    if (s[p] === '>') return { name, attrs, end: p + 1 };
    const as = p;
    p++; // an attribute name may start with '=' per the HTML spec
    while (p < s.length && !WS.test(s[p]) && s[p] !== '/' && s[p] !== '>' && s[p] !== '=') p++;
    const an = s.slice(as, p).toLowerCase();
    while (p < s.length && WS.test(s[p])) p++;
    let val = '';
    if (s[p] === '=') {
      p++;
      while (p < s.length && WS.test(s[p])) p++;
      if (s[p] === '"' || s[p] === "'") {
        const q = s[p];
        const e = s.indexOf(q, p + 1);
        if (e < 0) return null;
        val = s.slice(p + 1, e);
        p = e + 1;
      } else {
        const vs = p;
        while (p < s.length && !WS.test(s[p]) && s[p] !== '>') p++;
        val = s.slice(vs, p);
      }
    }
    attrs.push([an, val]);
  }
  return null;
}

const MAX_DEPTH = 100;

export function sanitizeHtml(input: unknown, profile: SanitizeProfile = 'rich'): string {
  const s = typeof input === 'string' ? input : '';
  const allowed = ALLOWED[profile];
  const out: string[] = [];
  const stack: string[] = [];
  let i = 0;
  const n = s.length;
  const text = (t: string) => { if (t) out.push(t.replace(/</g, '&lt;').replace(/>/g, '&gt;')); };

  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { text(s.slice(i)); break; }
    text(s.slice(i, lt));
    i = lt;
    const next = s[i + 1] ?? '';
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      if (e < 0) break;
      i = e + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      const e = s.indexOf('>', i);
      if (e < 0) break;
      i = e + 1;
      continue;
    }
    const isEnd = next === '/';
    if (!/[a-zA-Z]/.test(isEnd ? (s[i + 2] ?? '') : next)) { out.push('&lt;'); i++; continue; }
    const tok = parseTag(s, i);
    if (!tok) break; // unterminated tag: drop the rest
    i = tok.end;
    const name = tok.name;

    if (isEnd) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) while (stack.length > at) out.push(`</${stack.pop()}>`);
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (name === 'plaintext') break;
      const re = new RegExp(`</${name}(?=[\\s/>])`, 'i');
      const m = re.exec(s.slice(i));
      if (!m) break;
      const close = s.indexOf('>', i + m.index);
      if (close < 0) break;
      i = close + 1;
      continue;
    }
    if (!allowed.has(name)) continue; // unwrap: keep children, drop the tag
    let attrs = '';
    const seen = new Set<string>();
    let srcOk = true;
    for (const [an, av] of tok.attrs) {
      if (seen.has(an)) continue; // first occurrence wins, like browsers
      seen.add(an);
      const val = attrValue(name, an, av, profile);
      if (val === null) { if (name === 'img' && an === 'src') srcOk = false; continue; }
      attrs += ` ${an}="${esc(val)}"`;
    }
    if (name === 'img' && (!srcOk || !/ src="/.test(attrs))) continue;
    if (name === 'a' && / target="/.test(attrs)) attrs += ' rel="noopener noreferrer"';
    if (VOID.has(name)) { out.push(`<${name}${attrs}>`); continue; }
    if (stack.length >= MAX_DEPTH) continue;
    stack.push(name);
    out.push(`<${name}${attrs}>`);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}
