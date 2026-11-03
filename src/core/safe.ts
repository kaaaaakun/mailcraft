/**
 * Primitive escaping / validation helpers shared by the renderer, the sanitizer and the validator.
 * Nothing in here touches the DOM, so it runs in Node, workers and browsers.
 */

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Characters browsers ignore inside URL schemes (controls, spaces, zero-width). */
// eslint-disable-next-line no-control-regex
const URL_NOISE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g;
// eslint-disable-next-line no-control-regex
const URL_CTRL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Allow only safe URL schemes (and `{{merge_tags}}`). Anything else becomes ''. */
export function safeUrl(u: unknown): string {
  if (typeof u !== 'string') return '';
  const v = u.trim();
  const probe = v.replace(URL_NOISE, '');
  return /^(https?:|mailto:|tel:|#|\/|\{\{)/i.test(probe) ? v.replace(URL_CTRL, '') : '';
}

/** Image source: http(s), root-relative, merge tag, or a base64 raster data URL (no SVG). */
export function safeImgSrc(u: unknown): string {
  if (typeof u !== 'string') return '';
  const v = u.trim();
  const probe = v.replace(URL_NOISE, '');
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(probe)) return probe;
  return /^(https?:|\/|\{\{)/i.test(probe) ? v.replace(URL_CTRL, '') : '';
}

const ci = (w: string) => w.split('').map((c) => (c.toLowerCase() === c.toUpperCase() ? c : `[${c.toLowerCase()}${c.toUpperCase()}]`)).join('');

export const NAMED_COLORS = [
  'transparent', 'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'maroon', 'navy', 'teal', 'olive', 'lime', 'aqua', 'cyan', 'magenta', 'fuchsia', 'brown', 'gold', 'indigo', 'violet', 'crimson', 'coral', 'salmon', 'tomato', 'beige', 'ivory', 'khaki', 'lavender', 'whitesmoke', 'lightgray', 'lightgrey', 'darkgray', 'darkgrey', 'dimgray', 'dimgrey',
];

const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
const ARG = `${NUM}(?:%|[a-zA-Z]{1,4})?`;
const SEP = '(?:\\s*,\\s*|\\s+)';
const ALPHA = `(?:\\s*[,/]\\s*${NUM}%?)?`;

/** Source of the regex a color string must fully match (case-insensitive by construction, usable as a JSON Schema `pattern`). */
export const COLOR_PATTERN =
  '^(?:' +
  '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})' +
  `|(?:${ci('rgb')}|${ci('rgba')}|${ci('hsl')}|${ci('hsla')})\\(\\s*${ARG}${SEP}${ARG}${SEP}${ARG}${ALPHA}\\s*\\)` +
  `|(?:${NAMED_COLORS.map(ci).join('|')})` +
  ')$';
const COLOR_RE = new RegExp(COLOR_PATTERN);

export function isSafeColor(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 80 && COLOR_RE.test(v.trim());
}
export function safeColor(v: unknown, fallback: string): string {
  return isSafeColor(v) ? v.trim() : fallback;
}

/** Font stacks: letters, digits, spaces, commas, quotes, dashes, dots and non-ASCII letters only. */
// eslint-disable-next-line no-control-regex
const FONT_BAD = /[;{}()\\<>&:/@!*=[\]`|^~$%#+?\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
export function isSafeFontFamily(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 200 && !FONT_BAD.test(v) && !/url|expression|javascript|import/i.test(v);
}
export function safeFontFamily(v: unknown, fallback: string): string {
  return isSafeFontFamily(v) ? v.trim() : fallback;
}

export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && /^\s*[+-]?(?:\d+\.?\d*|\.\d+)\s*$/.test(v)) return Number(v);
  return undefined;
}

/** Finite number clamped to [min, max]; anything else -> fallback. `int` rounds; otherwise 2 decimals. */
export function clampNum(v: unknown, min: number, max: number, fallback: number, int = true): number {
  const n = toNumber(v);
  if (n === undefined) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return int ? Math.round(c) : Math.round(c * 100) / 100;
}

export function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
