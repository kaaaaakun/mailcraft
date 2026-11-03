import { describe, expect, it } from 'vitest';
import { createBlock, createDesign, createRow, createSampleDesign } from '../src/core/defaults';
import { renderHtml } from '../src/core/render';
import { designJsonSchema, normalizeDesign, validateDesign } from '../src';
import { createEditor } from '../src';
import { ALL_HOSTILE } from './helpers/hostile';
import forAiMd from '../docs/for-ai.md?raw';
import llmsTxt from '../llms.txt?raw';

// ---- a minimal JSON Schema validator (just the keywords our schema uses) ------------------------------------

type Schema = Record<string, any>;
function check(schema: Schema, value: unknown, root: Schema, path = '$'): string[] {
  if (schema.$ref) {
    const target = (schema.$ref as string).replace('#/', '').split('/').reduce((o: any, k) => o[k], root);
    return check(target, value, root, path);
  }
  const errs: string[] = [];
  if (schema.const !== undefined && value !== schema.const) errs.push(`${path}: expected const ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: not in enum`);
  if (schema.type) {
    const t = schema.type;
    const ok =
      t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
      : t === 'array' ? Array.isArray(value)
      : t === 'string' ? typeof value === 'string'
      : t === 'boolean' ? typeof value === 'boolean'
      : t === 'integer' ? typeof value === 'number' && Number.isInteger(value)
      : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : true;
    if (!ok) return [`${path}: expected ${t}`];
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: < minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: > maximum`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: pattern mismatch (${value.slice(0, 40)})`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: too many items`);
    if (schema.items) value.forEach((v, i) => errs.push(...check(schema.items, v, root, `${path}[${i}]`)));
  }
  if (schema.type === 'object' && typeof value === 'object' && value && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) errs.push(`${path}: missing ${k}`);
    for (const [k, s] of Object.entries<Schema>(schema.properties ?? {})) if (k in o) errs.push(...check(s, o[k], root, `${path}.${k}`));
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((s: Schema) => check(s, value, root, path).length === 0).length;
    if (matches !== 1) errs.push(`${path}: matches ${matches} of oneOf`);
  }
  return errs;
}
const schemaErrors = (v: unknown) => check(designJsonSchema as Schema, v, designJsonSchema as Schema);

// ---- seeded generator of schema-valid designs -----------------------------------------------------------------

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function generate(seed: number) {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
  const col = () => pick(['#000', '#fff', '#2f6fed', '#112233cc', 'rgb(10, 20, 30)', 'rgba(0,0,0,0.5)', 'hsl(120, 50%, 50%)', 'red', 'Transparent']);
  const d = createDesign();
  d.body.backgroundColor = col();
  d.body.contentWidth = int(200, 1000);
  d.body.preheader = pick(['', 'Hello', '<b>not html</b>']);
  const types = ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'html'] as const;
  for (let i = int(0, 6); i > 0; i--) {
    const n = int(1, 12);
    const row = createRow(Array.from({ length: n }, () => int(1, 5)));
    row.backgroundColor = pick(['', col()]);
    for (const c of row.columns) for (let k = int(0, 3); k > 0; k--) {
      const b: any = createBlock(pick(types));
      for (const key of Object.keys(b)) {
        if (typeof b[key] === 'number') b[key] = key === 'lineHeight' ? (8 + int(0, 32)) / 10 : key === 'level' ? int(1, 3) : key === 'widthPercent' ? int(1, 100) : key === 'thickness' ? int(1, 50) : key === 'height' ? int(0, 600) : key === 'fontSize' ? int(6, 120) : key === 'borderRadius' ? int(0, 100) : key === 'innerPaddingY' ? int(0, 100) : key === 'innerPaddingX' ? int(0, 200) : b[key];
        if (key === 'color' || key === 'backgroundColor') b[key] = col();
        if (key === 'align') b[key] = pick(['left', 'center', 'right']);
      }
      for (const side of ['top', 'right', 'bottom', 'left']) b.padding[side] = int(0, 200);
      c.blocks.push(b);
    }
    d.rows.push(row);
  }
  return d;
}

describe('JSON Schema', () => {
  it('is draft 2020-12 and JSON-serializable', () => {
    expect(designJsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(() => JSON.parse(JSON.stringify(designJsonSchema))).not.toThrow();
  });
  it('accepts the built-in sample designs (en / ja), the default design and every default block', () => {
    for (const d of [createSampleDesign('en'), createSampleDesign('ja'), createDesign()]) expect(schemaErrors(d)).toEqual([]);
    for (const t of ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'html'] as const) expect(schemaErrors({ rows: [{ columns: [{ blocks: [createBlock(t)] }] }] })).toEqual([]);
  });
  it('accepts 200 generated designs, and validateDesign agrees (ok, no errors, unchanged)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = generate(seed);
      expect(schemaErrors(d), `seed ${seed}`).toEqual([]);
      const v = validateDesign(d);
      expect(v.errors, `seed ${seed}`).toEqual([]);
      expect(v.ok).toBe(true);
      expect(v.design).toEqual(d);
    }
  });
  it('rejects obviously invalid designs', () => {
    expect(schemaErrors({})).not.toEqual([]);
    expect(schemaErrors({ rows: [{ columns: [{ blocks: [{ type: 'nope' }] }] }] })).not.toEqual([]);
    expect(schemaErrors({ rows: [{ columns: [{ blocks: [{ type: 'heading', level: 7 }] }] }] })).not.toEqual([]);
    expect(schemaErrors({ rows: [{ columns: [{ blocks: [{ type: 'text', color: 'red;x' }] }] }] })).not.toEqual([]);
    expect(schemaErrors({ body: { fontFamily: 'a;b' }, rows: [] })).not.toEqual([]);
  });
  it('JSON examples in docs/for-ai.md and llms.txt are valid designs', () => {
    let n = 0;
    for (const [file, text] of [['docs/for-ai.md', forAiMd], ['llms.txt', llmsTxt]]) {
      for (const m of text.matchAll(/```json\n([\s\S]*?)```/g)) {
        const j = JSON.parse(m[1]);
        if (!j || !Array.isArray(j.rows)) continue;
        n++;
        expect(schemaErrors(j), `${file} example ${n}`).toEqual([]);
        expect(validateDesign(j).errors, `${file} example ${n}`).toEqual([]);
        expect(renderHtml(j)).toContain('<!DOCTYPE html>');
      }
    }
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('normalizeDesign / validateDesign', () => {
  it('never throws and always returns a schema-valid design, for junk of every type', () => {
    const junk = [...ALL_HOSTILE, undefined, 'x', 42, [], {}, { rows: 'x' }, { body: [], rows: [[], null, 1, 'x', { columns: 'x' }] }];
    for (const j of junk) {
      expect(() => normalizeDesign(j)).not.toThrow();
      expect(schemaErrors(normalizeDesign(j)), JSON.stringify(j)?.slice(0, 80)).toEqual([]);
      expect(() => validateDesign(j)).not.toThrow();
    }
  });

  it('fuzz: random corruption of a valid design still normalizes to a schema-valid design', () => {
    const r = rng(7);
    for (let n = 0; n < 150; n++) {
      const d: any = JSON.parse(JSON.stringify(generate(n + 1000)));
      const nodes: any[] = [d, d.body, ...d.rows, ...d.rows.flatMap((x: any) => [x.padding, ...x.columns, ...x.columns.flatMap((c: any) => c.blocks)])];
      for (let k = 0; k < 6; k++) {
        const node = nodes[Math.floor(r() * nodes.length)];
        const keys = Object.keys(node);
        if (!keys.length) continue;
        const key = keys[Math.floor(r() * keys.length)];
        node[key] = ALL_HOSTILE[Math.floor(r() * ALL_HOSTILE.length)];
      }
      const out = normalizeDesign(d);
      expect(schemaErrors(out), `iteration ${n}`).toEqual([]);
      // idempotent
      expect(normalizeDesign(out)).toEqual(out);
      expect(() => renderHtml(d)).not.toThrow();
    }
  });

  it('the issue case: no body / rows not an array', () => {
    expect(() => renderHtml({ rows: [] } as any)).not.toThrow();
    const a = normalizeDesign({ rows: [] });
    expect(a.body.contentWidth).toBe(600);
    expect(normalizeDesign({}).rows).toEqual([]);
    const v = validateDesign({ body: {}, rows: 'oops' });
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.path)).toContain('rows');
    expect(v.design?.rows).toEqual([]);
  });

  it('fills defaults for partial / legacy blocks and rows', () => {
    const d = normalizeDesign({ rows: [{ columns: [{ blocks: [{ type: 'button' }, { type: 'text', fontSize: '18' }] }] }] });
    const [btn, txt] = d.rows[0].columns[0].blocks;
    expect(btn.type === 'button' && btn.backgroundColor).toBe('#2f6fed');
    expect(txt.type === 'text' && txt.fontSize).toBe(18);
    expect(d.rows[0].ratios).toEqual([1]);
    expect(d.rows[0].padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(btn.id).toMatch(/^blk_/);
  });

  it('skips unknown block types and reports them', () => {
    const v = validateDesign({ rows: [{ columns: [{ blocks: [{ type: 'video' }, { type: 'spacer' }, null] }] }] });
    expect(v.ok).toBe(false);
    expect(v.design!.rows[0].columns[0].blocks.map((b) => b.type)).toEqual(['spacer']);
    expect(v.errors.some((e) => e.path.endsWith('.type') && /unknown block type/.test(e.message))).toBe(true);
  });

  it('de-duplicates and repairs ids', () => {
    const blk = { id: 'same', type: 'spacer' };
    const d = normalizeDesign({ rows: [{ id: 'same', columns: [{ id: 'same', blocks: [blk, { ...blk }, { id: '<x>', type: 'spacer' }] }] }] });
    const ids = [d.rows[0].id, d.rows[0].columns[0].id, ...d.rows[0].columns[0].blocks.map((b) => b.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => /^[A-Za-z0-9_:.-]{1,64}$/.test(i))).toBe(true);
  });

  it('makes columns.length === ratios.length and clamps ranges', () => {
    const d = normalizeDesign({ rows: [{ ratios: [1, 2, 3], columns: [{ blocks: [] }] }, { ratios: [], columns: [] }, { ratios: [1], columns: Array.from({ length: 15 }, () => ({ blocks: [{ type: 'spacer' }] })) }, { ratios: [0, 1e9, -3] }] });
    for (const r of d.rows) expect(r.columns.length).toBe(r.ratios.length);
    expect(d.rows[0].ratios).toEqual([1, 2, 3]);
    expect(d.rows[1].ratios).toEqual([1]);
    expect(d.rows[2].columns).toHaveLength(12);
    expect(d.rows[2].columns[11].blocks).toHaveLength(4); // 3 overflow columns merged into the last
    expect(d.rows[3].ratios).toEqual([0.1, 100, 0.1]);
    const s = normalizeDesign({ rows: [{ columns: [{ blocks: [{ type: 'spacer', height: 99999, padding: { top: -5, left: 'x' } }] }] }] }).rows[0].columns[0].blocks[0];
    expect(s.type === 'spacer' && s.height).toBe(600);
    expect(s.padding.top).toBe(0);
    expect(s.padding.left).toBe(0); // spacer default padding
  });

  it('replaces invalid colors / fonts / enums with defaults and says so', () => {
    const v = validateDesign({ body: { backgroundColor: 'red;x', fontFamily: 'a;b{}' }, rows: [{ columns: [{ blocks: [{ type: 'text', align: 'justify', color: 'url(x)', fontSize: 'big' }] }] }] });
    const paths = v.errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['body.backgroundColor', 'body.fontFamily', 'rows[0].columns[0].blocks[0].align', 'rows[0].columns[0].blocks[0].color', 'rows[0].columns[0].blocks[0].fontSize']));
    expect(v.design!.body.backgroundColor).toBe('#f3f4f6');
  });

  it('does not mutate its input', () => {
    const d = createSampleDesign();
    const snap = JSON.stringify(d);
    normalizeDesign(d);
    validateDesign(d);
    renderHtml(d);
    expect(JSON.stringify(d)).toBe(snap);
  });

  it('the sample design is valid and survives normalization unchanged', () => {
    for (const loc of ['en', 'ja']) {
      const d = createSampleDesign(loc);
      expect(validateDesign(d).errors).toEqual([]);
      expect(normalizeDesign(d)).toEqual(d);
    }
  });
});

describe('editor integration', () => {
  it('createEditor and loadDesign survive designs without body / rows', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const ed = createEditor(el, { design: { rows: [] } as any });
    expect(ed.getDesign().body.contentWidth).toBe(600);
    ed.loadDesign({ version: 1, rows: 'x' } as any);
    expect(ed.getDesign().rows).toEqual([]);
    ed.loadDesign({ rows: [{ columns: [{ blocks: [{ type: 'heading', level: 9, align: 'left"><img src=x onerror=alert(1)>', text: 'hi' }] }] }] } as any);
    expect(el.querySelector('img[onerror]')).toBeNull();
    expect(el.innerHTML).not.toContain('onerror');
    expect(el.querySelector('h3')).not.toBeNull();
    expect(ed.exportHtml()).toContain('hi');
  });
  it('the canvas shows the same sanitized markup the export contains', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const d = createSampleDesign();
    const b = d.rows[2].columns[0].blocks[0];
    if (b.type === 'text') b.html = '<p onclick="x()">hi<script>alert(1)</script><svg onload=alert(1)></svg></p>';
    const ed = createEditor(el, { design: d });
    expect(el.innerHTML).not.toContain('onclick');
    expect(el.querySelector('.mc-block-content svg')).toBeNull();
    expect(ed.exportHtml()).toContain('<p>hi</p>');
  });
});
