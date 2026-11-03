/**
 * Small, dependency-free color helpers used to derive the editor theme from brand colors.
 * Everything here is pure and never throws: invalid input yields `null` / `NaN`.
 * Perceptual math (lightness shifts, mixing) is done in OKLab / OKLCH.
 */
export interface RGB { r: number; g: number; b: number }
export interface OKLCH { l: number; c: number; h: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => Math.round(clamp(n, 0, 255));

const NAMED: Record<string, string> = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff', maroon: '#800000',
  red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', magenta: '#ff00ff', green: '#008000', lime: '#00ff00',
  olive: '#808000', yellow: '#ffff00', navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff',
  cyan: '#00ffff', orange: '#ffa500', pink: '#ffc0cb', brown: '#a52a2a', indigo: '#4b0082', violet: '#ee82ee',
  gold: '#ffd700', coral: '#ff7f50', crimson: '#dc143c', tomato: '#ff6347', salmon: '#fa8072',
};

function hslToRgb(h: number, s: number, l: number): RGB {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: byte(f(0) * 255), g: byte(f(8) * 255), b: byte(f(4) * 255) };
}

const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(%|deg)?$/;
const FN_RE = /^(rgba?|hsla?)\(\s*([^()]*?)\s*\)$/;

function parseParts(body: string): string[] | null {
  const [main, alpha, ...rest] = body.split('/');
  if (rest.length) return null;
  const parts = main.trim().split(/\s*,\s*|\s+/).filter(Boolean);
  if (alpha !== undefined) parts.push(alpha.trim());
  return parts.length === 3 || parts.length === 4 ? parts : null;
}

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, `hsl()/hsla()` (comma or space syntax) and a few
 * basic named colors. Alpha is accepted and ignored. Returns `null` for anything else (never throws).
 */
export function parseColor(input: unknown): RGB | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) s = NAMED[s];
  if (s[0] === '#') {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
    if (hex.length === 6 || hex.length === 8) return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    return null;
  }
  const m = FN_RE.exec(s);
  if (!m) return null;
  const parts = parseParts(m[2]);
  if (!parts || !parts.every((p) => NUM_RE.test(p))) return null;
  const n = (p: string) => parseFloat(p);
  if (m[1].startsWith('rgb')) {
    if (parts.slice(0, 3).some((p) => p.endsWith('deg'))) return null;
    const ch = (p: string) => (p.endsWith('%') ? (n(p) / 100) * 255 : n(p));
    return { r: byte(ch(parts[0])), g: byte(ch(parts[1])), b: byte(ch(parts[2])) };
  }
  if (!parts[1].endsWith('%') || !parts[2].endsWith('%') || parts[0].endsWith('%')) return null;
  return hslToRgb(n(parts[0]), clamp(n(parts[1]), 0, 100) / 100, clamp(n(parts[2]), 0, 100) / 100);
}

const hex2 = (n: number) => byte(n).toString(16).padStart(2, '0');
export function toHex(c: RGB): string { return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`; }
/** Normalize any accepted color to `#rrggbb`, or `null` if invalid. */
export function normalizeColor(input: unknown): string | null {
  const c = parseColor(input);
  return c ? toHex(c) : null;
}
export function rgba(c: RGB, alpha: number): string { return `rgba(${byte(c.r)},${byte(c.g)},${byte(c.b)},${+clamp(alpha, 0, 1).toFixed(3)})`; }

const toLin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const fromLin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG 2.x relative luminance. */
export function relativeLuminance(c: RGB): number {
  return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
}

function toRgb(x: string | RGB): RGB | null { return typeof x === 'string' ? parseColor(x) : x; }

/** WCAG contrast ratio (1..21) between two colors; `NaN` when either is invalid. */
export function contrastRatio(a: string | RGB, b: string | RGB): number {
  const ca = toRgb(a), cb = toRgb(b);
  if (!ca || !cb) return NaN;
  const la = relativeLuminance(ca), lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastResult { ratio: number; aa: boolean; aaLarge: boolean; aaa: boolean }
/** WCAG check for a foreground/background pair (any accepted color format). `null` if either color is invalid. */
export function checkContrast(a: string, b: string): ContrastResult | null {
  const ratio = contrastRatio(a, b);
  if (Number.isNaN(ratio)) return null;
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7 };
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

/** White or black, whichever reads better on `bg` (AA 4.5:1 when reachable, otherwise the better one). */
export function onColor(bg: RGB): { color: '#ffffff' | '#000000'; ratio: number; ok: boolean } {
  const w = contrastRatio(bg, WHITE), k = contrastRatio(bg, BLACK);
  // Prefer white when it passes AA (the conventional choice on brand buttons), else the higher contrast.
  const white = w >= 4.5 || w >= k;
  const ratio = white ? w : k;
  return { color: white ? '#ffffff' : '#000000', ratio, ok: ratio >= 4.5 };
}

// ---- OKLab / OKLCH ----
function toOklab(c: RGB): [number, number, number] {
  const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklabRaw(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (v: [number, number, number]) => v.every((x) => x >= -0.0005 && x <= 1.0005);
const linToRgb = (v: [number, number, number]): RGB => ({ r: byte(fromLin(clamp(v[0], 0, 1))), g: byte(fromLin(clamp(v[1], 0, 1))), b: byte(fromLin(clamp(v[2], 0, 1))) });

export function toOklch(c: RGB): OKLCH {
  const [L, a, b] = toOklab(c);
  const ch = Math.hypot(a, b);
  return { l: L, c: ch, h: ch < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH -> sRGB, reducing chroma until the color fits the gamut (keeps lightness and hue). */
export function fromOklch(l: number, c: number, h: number): RGB {
  const L = clamp(l, 0, 1), hr = (h * Math.PI) / 180;
  const at = (cc: number) => fromOklabRaw(L, cc * Math.cos(hr), cc * Math.sin(hr));
  let hi = Math.max(0, c);
  if (!inGamut(at(hi))) {
    let lo = 0;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
    hi = lo;
  }
  return linToRgb(at(hi));
}

/** Mix `a` toward `b` by `t` (0..1) in OKLab. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const x = toOklab(a), y = toOklab(b), k = clamp(t, 0, 1);
  return linToRgb(fromOklabRaw(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k));
}

/** Shift OKLCH lightness by `dl`, keeping hue and chroma (gamut-mapped). */
export function shiftLightness(c: RGB, dl: number): RGB {
  const o = toOklch(c);
  return fromOklch(o.l + dl, o.c, o.h);
}

/**
 * Move `fg` along the lightness axis (hue/chroma kept) until it reaches `min`:1 against `bg`.
 * Goes lighter on dark backgrounds and darker on light ones. Returns `fg` unchanged when it already passes;
 * falls back to black/white when the target is unreachable.
 */
export function ensureContrast(fg: RGB, bg: RGB, min = 4.5): RGB {
  if (contrastRatio(fg, bg) >= min) return fg;
  const o = toOklch(fg);
  const dir = relativeLuminance(bg) < 0.4 ? 1 : -1;
  for (let i = 1; i <= 100; i++) {
    const cand = fromOklch(o.l + dir * i * 0.01, o.c, o.h);
    if (contrastRatio(cand, bg) >= min) return cand;
  }
  const end = dir > 0 ? WHITE : BLACK;
  return contrastRatio(end, bg) >= contrastRatio(fg, bg) ? end : fg;
}
