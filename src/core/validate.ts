/**
 * Design validation / normalization. `normalizeDesign` never throws: it accepts partial or legacy input,
 * fills defaults, clamps ranges, allow-lists enums, validates colors / font stacks, de-duplicates ids and makes
 * `columns.length === ratios.length`. `validateDesign` does the same and additionally reports what it had to fix.
 */
import { createBlock, FONT_FAMILIES, uid } from './defaults.js';
import { clampNum, isSafeColor, isSafeFontFamily, pickEnum, toNumber } from './safe.js';
import type { Block, BlockType, Column, Design, Padding, Row } from './types.js';

export interface ValidationError { path: string; message: string }
export interface ValidationResult { ok: boolean; errors: ValidationError[]; design?: Design }

/** Numeric ranges, shared by the normalizer and the exported JSON Schema. */
export const LIMITS = {
  padding: [0, 200],
  fontSize: [6, 120],
  lineHeight: [0.8, 4],
  thickness: [1, 50],
  spacerHeight: [0, 600],
  widthPercent: [1, 100],
  borderRadius: [0, 100],
  innerPaddingY: [0, 100],
  innerPaddingX: [0, 200],
  ratio: [0.1, 100],
  contentWidth: [200, 1000],
  level: [1, 3],
  columns: [1, 12],
} as const;

export const BLOCK_TYPES = ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'html'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;

const DEFAULT_FONT = FONT_FAMILIES['Sans-serif'];
const ID_RE = /^[A-Za-z0-9_:.-]{1,64}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Ctx { errors: ValidationError[]; ids: Set<string> }
export const newCtx = (): Ctx => ({ errors: [], ids: new Set() });
const err = (c: Ctx, path: string, message: string) => { c.errors.push({ path, message }); };

function fId(c: Ctx, o: Obj, path: string, prefix: string): string {
  const v = o.id;
  if (typeof v === 'string' && ID_RE.test(v) && !c.ids.has(v)) { c.ids.add(v); return v; }
  if (v !== undefined) err(c, `${path}.id`, typeof v === 'string' && ID_RE.test(v) ? 'duplicate id; a new one was generated' : 'invalid id; a new one was generated');
  let id = uid(prefix);
  while (c.ids.has(id)) id = uid(prefix);
  c.ids.add(id);
  return id;
}

function fNum(c: Ctx, o: Obj, key: string, path: string, range: readonly [number, number], def: number, int = true): number {
  const v = o[key];
  if (v === undefined) return def;
  const n = toNumber(v);
  if (n === undefined) { err(c, `${path}.${key}`, `expected a number, using ${def}`); return def; }
  if (typeof v !== 'number') err(c, `${path}.${key}`, 'expected a number, got a numeric string (coerced)');
  if (n < range[0] || n > range[1]) err(c, `${path}.${key}`, `out of range ${range[0]}..${range[1]}, clamped`);
  return clampNum(n, range[0], range[1], def, int);
}

function fStr(c: Ctx, o: Obj, key: string, path: string, def: string): string {
  const v = o[key];
  if (v === undefined || v === null) return def;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  err(c, `${path}.${key}`, 'expected a string');
  return def;
}

function fColor(c: Ctx, o: Obj, key: string, path: string, def: string, allowEmpty = false): string {
  const v = o[key];
  if (v === undefined) return def;
  if (allowEmpty && v === '') return '';
  if (isSafeColor(v)) return v.trim();
  err(c, `${path}.${key}`, `invalid color (use #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla() or a basic color name), using ${def || '""'}`);
  return def;
}

function fEnum<T extends string>(c: Ctx, o: Obj, key: string, path: string, allowed: readonly T[], def: T): T {
  const v = o[key];
  if (v === undefined) return def;
  const r = pickEnum(v, allowed, def);
  if (r !== v) err(c, `${path}.${key}`, `must be one of ${allowed.join(', ')}, using ${def}`);
  return r;
}

function fPadding(c: Ctx, raw: unknown, path: string, def: Padding): Padding {
  if (raw === undefined) return { ...def };
  if (typeof raw === 'number') raw = { top: raw, right: raw, bottom: raw, left: raw };
  if (!isObj(raw)) { err(c, path, 'expected an object {top,right,bottom,left}'); return { ...def }; }
  const r = LIMITS.padding;
  return {
    top: fNum(c, raw, 'top', path, r, def.top),
    right: fNum(c, raw, 'right', path, r, def.right),
    bottom: fNum(c, raw, 'bottom', path, r, def.bottom),
    left: fNum(c, raw, 'left', path, r, def.left),
  };
}

/** Normalize one block. Returns null (and records an error) for unknown / invalid blocks. Never throws. */
export function normalizeBlock(raw: unknown, c: Ctx = newCtx(), path = 'block'): Block | null {
  if (!isObj(raw)) { err(c, path, 'block must be an object; skipped'); return null; }
  const type = raw.type;
  if (typeof type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(type)) {
    err(c, `${path}.type`, `unknown block type ${JSON.stringify(typeof type === 'string' ? type.slice(0, 40) : type)}; skipped`);
    return null;
  }
  const d = createBlock(type as BlockType);
  const id = fId(c, raw, path, 'blk');
  const padding = fPadding(c, raw.padding, `${path}.padding`, d.padding);
  switch (d.type) {
    case 'text':
      return { id, type: 'text', padding, html: fStr(c, raw, 'html', path, d.html), color: fColor(c, raw, 'color', path, d.color), fontSize: fNum(c, raw, 'fontSize', path, LIMITS.fontSize, d.fontSize), lineHeight: fNum(c, raw, 'lineHeight', path, LIMITS.lineHeight, d.lineHeight, false), align: fEnum(c, raw, 'align', path, ALIGNS, d.align) };
    case 'heading':
      return { id, type: 'heading', padding, text: fStr(c, raw, 'text', path, d.text), level: fNum(c, raw, 'level', path, LIMITS.level, d.level) as 1 | 2 | 3, color: fColor(c, raw, 'color', path, d.color), fontSize: fNum(c, raw, 'fontSize', path, LIMITS.fontSize, d.fontSize), align: fEnum(c, raw, 'align', path, ALIGNS, d.align) };
    case 'image':
      return { id, type: 'image', padding, src: fStr(c, raw, 'src', path, ''), alt: fStr(c, raw, 'alt', path, ''), href: fStr(c, raw, 'href', path, ''), widthPercent: fNum(c, raw, 'widthPercent', path, LIMITS.widthPercent, d.widthPercent), align: fEnum(c, raw, 'align', path, ALIGNS, d.align) };
    case 'button':
      return { id, type: 'button', padding, text: fStr(c, raw, 'text', path, d.text), href: fStr(c, raw, 'href', path, d.href), backgroundColor: fColor(c, raw, 'backgroundColor', path, d.backgroundColor), color: fColor(c, raw, 'color', path, d.color), borderRadius: fNum(c, raw, 'borderRadius', path, LIMITS.borderRadius, d.borderRadius), fontSize: fNum(c, raw, 'fontSize', path, LIMITS.fontSize, d.fontSize), innerPaddingY: fNum(c, raw, 'innerPaddingY', path, LIMITS.innerPaddingY, d.innerPaddingY), innerPaddingX: fNum(c, raw, 'innerPaddingX', path, LIMITS.innerPaddingX, d.innerPaddingX), align: fEnum(c, raw, 'align', path, ALIGNS, d.align) };
    case 'divider':
      return { id, type: 'divider', padding, color: fColor(c, raw, 'color', path, d.color), thickness: fNum(c, raw, 'thickness', path, LIMITS.thickness, d.thickness) };
    case 'spacer':
      return { id, type: 'spacer', padding, height: fNum(c, raw, 'height', path, LIMITS.spacerHeight, d.height) };
    case 'html':
      return { id, type: 'html', padding, html: fStr(c, raw, 'html', path, d.html) };
  }
}

function stackOnMobile(c: Ctx, raw: Obj, path: string): boolean {
  if (raw.stackOnMobile === undefined) return true;
  if (typeof raw.stackOnMobile === 'boolean') return raw.stackOnMobile;
  err(c, `${path}.stackOnMobile`, 'expected a boolean; using true');
  return true;
}

function normalizeRow(raw: unknown, c: Ctx, path: string): Row | null {
  if (!isObj(raw)) { err(c, path, 'row must be an object; skipped'); return null; }
  const id = fId(c, raw, path, 'row');
  const ratios: number[] = [];
  if (raw.ratios !== undefined && !Array.isArray(raw.ratios)) err(c, `${path}.ratios`, 'expected an array of numbers');
  if (Array.isArray(raw.ratios)) raw.ratios.slice(0, LIMITS.columns[1]).forEach((r, i) => {
    const n = toNumber(r);
    if (n === undefined) { err(c, `${path}.ratios[${i}]`, 'expected a number, using 1'); ratios.push(1); return; }
    if (n < LIMITS.ratio[0] || n > LIMITS.ratio[1]) err(c, `${path}.ratios[${i}]`, `out of range ${LIMITS.ratio[0]}..${LIMITS.ratio[1]}, clamped`);
    ratios.push(clampNum(n, LIMITS.ratio[0], LIMITS.ratio[1], 1, false));
  });
  const columns: Column[] = [];
  if (raw.columns !== undefined && !Array.isArray(raw.columns)) err(c, `${path}.columns`, 'expected an array');
  const rawCols = Array.isArray(raw.columns) ? raw.columns : [];
  rawCols.forEach((rc, ci) => {
    const cp = `${path}.columns[${ci}]`;
    if (!isObj(rc)) { err(c, cp, 'column must be an object; replaced by an empty column'); columns.push({ id: fId(c, {}, cp, 'col'), blocks: [] }); return; }
    const cid = fId(c, rc, cp, 'col');
    const blocks: Block[] = [];
    if (rc.blocks !== undefined && !Array.isArray(rc.blocks)) err(c, `${cp}.blocks`, 'expected an array');
    if (Array.isArray(rc.blocks)) rc.blocks.forEach((rb, bi) => { const b = normalizeBlock(rb, c, `${cp}.blocks[${bi}]`); if (b) blocks.push(b); });
    columns.push({ id: cid, blocks });
  });
  if (columns.length > LIMITS.columns[1]) {
    err(c, `${path}.columns`, `at most ${LIMITS.columns[1]} columns; extra columns were merged into the last one`);
    const extra = columns.splice(LIMITS.columns[1]);
    for (const e of extra) columns[columns.length - 1].blocks.push(...e.blocks);
  }
  const n = Math.max(columns.length, ratios.length, 1);
  if (columns.length !== ratios.length && raw.ratios !== undefined && raw.columns !== undefined) err(c, path, 'columns and ratios length differ; padded to match');
  while (columns.length < n) columns.push({ id: fId(c, {}, path, 'col'), blocks: [] });
  while (ratios.length < n) ratios.push(1);
  const pad0: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    id,
    ratios,
    columns,
    backgroundColor: fColor(c, raw, 'backgroundColor', path, '', true),
    padding: fPadding(c, raw.padding, `${path}.padding`, pad0),
    stackOnMobile: stackOnMobile(c, raw, path),
  };
}

function normalizeBody(raw: unknown, c: Ctx): Design['body'] {
  const o: Obj = isObj(raw) ? raw : {};
  if (raw !== undefined && !isObj(raw)) err(c, 'body', 'expected an object; defaults used');
  let fontFamily = DEFAULT_FONT;
  if (o.fontFamily !== undefined) {
    if (isSafeFontFamily(o.fontFamily)) fontFamily = o.fontFamily.trim();
    else err(c, 'body.fontFamily', 'invalid font stack (letters, digits, spaces, commas, quotes, dashes only); default used');
  }
  return {
    backgroundColor: fColor(c, o, 'backgroundColor', 'body', '#f3f4f6'),
    contentBackgroundColor: fColor(c, o, 'contentBackgroundColor', 'body', '#ffffff'),
    contentWidth: fNum(c, o, 'contentWidth', 'body', LIMITS.contentWidth, 600),
    fontFamily,
    preheader: fStr(c, o, 'preheader', 'body', ''),
  };
}

function run(input: unknown): { design: Design; errors: ValidationError[] } {
  const c = newCtx();
  if (!isObj(input)) {
    err(c, '', 'design must be an object');
    return { design: { version: 1, body: normalizeBody(undefined, c), rows: [] }, errors: c.errors };
  }
  if (input.version !== undefined && input.version !== 1) err(c, 'version', 'unsupported version; treated as 1');
  const body = normalizeBody(input.body, c);
  const rows: Row[] = [];
  if (!Array.isArray(input.rows)) err(c, 'rows', 'required array; treated as empty');
  else input.rows.forEach((r, i) => { const row = normalizeRow(r, c, `rows[${i}]`); if (row) rows.push(row); });
  return { design: { version: 1, body, rows }, errors: c.errors };
}

/** Tolerant: always returns a valid Design, never throws. Cost: one O(size) walk that allocates a fresh copy. */
export function normalizeDesign(input: unknown): Design {
  try { return run(input).design; } catch { return { version: 1, body: normalizeBody(undefined, newCtx()), rows: [] }; }
}

/** Like `normalizeDesign` but also reports every problem found. `ok` is true when nothing had to be fixed. */
export function validateDesign(input: unknown): ValidationResult {
  try {
    const { design, errors } = run(input);
    return { ok: errors.length === 0, errors, design };
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `unexpected error: ${(e as Error)?.message ?? e}` }], design: normalizeDesign(undefined) };
  }
}
