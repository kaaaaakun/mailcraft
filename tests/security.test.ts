import { describe, expect, it } from 'vitest';
import { createBlock, createDesign, createRow, createSampleDesign } from '../src/core/defaults';
import { renderBlockContent, renderHtml } from '../src/core/render';
import { assertSafe } from './helpers/assertSafe';
import { ALL_HOSTILE, HOSTILE } from './helpers/hostile';

function fieldPaths(o: unknown, prefix: string[] = []): string[][] {
  if (typeof o !== 'object' || o === null) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => fieldPaths(v, [...prefix, k]));
}
function setPath(o: any, path: string[], v: unknown) {
  let cur = o;
  for (const k of path.slice(0, -1)) cur = cur[k];
  cur[path[path.length - 1]] = v;
}

// Per-field sweeps use the attack-oriented head of the corpus + junk types; the "all fields at once" test uses the whole corpus.
const SWEEP: unknown[] = [...HOSTILE.slice(0, 24), NaN, null, {}, [], 1e21];

const TYPES = ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'html'] as const;
// An image src must render something so that the img path is exercised too.
const prime = (b: any) => { if (b.type === 'image') { b.src = 'https://example.com/a.png'; b.href = 'https://example.com'; } return b; };

let cases = 0;

describe('hostile input fuzz: every field of every block / row / body', { timeout: 120_000 }, () => {
  for (const type of TYPES) {
    it(`block ${type}: each field x each hostile value`, () => {
      const paths = fieldPaths(createBlock(type)).filter((p) => p[0] !== 'type');
      for (const path of paths) {
        for (const [i, v] of SWEEP.entries()) {
          const b = prime(createBlock(type));
          setPath(b, path, v);
          assertSafe(`<table><tr><td>${renderBlockContent(b)}</td></tr></table>`, `${type}.${path.join('.')}=${JSON.stringify(v)}`);
          cases++;
          if (i % 6 === 0) {
            const d = createDesign();
            const r = createRow([1]);
            r.columns[0].blocks.push(b);
            d.rows.push(r);
            assertSafe(renderHtml(d), `doc ${type}.${path.join('.')}`);
            cases++;
          }
        }
      }
    });

    it(`block ${type}: all fields hostile at once`, () => {
      for (const v of HOSTILE) {
        const b: any = prime(createBlock(type));
        for (const path of fieldPaths(b).filter((p) => p[0] !== 'type')) setPath(b, path, v);
        assertSafe(`<table><tr><td>${renderBlockContent(b)}</td></tr></table>`, `${type} all=${v}`);
        cases++;
      }
    });
  }

  it('row fields', () => {
    for (const path of fieldPaths({ ...createRow([1, 2]), columns: [], ratios: [1, 2] }).filter((p) => p[0] !== 'columns')) {
      for (const v of SWEEP) {
        const d: any = createSampleDesign();
        setPath(d.rows[3], path, v);
        setPath(d.rows[4], path, v);
        assertSafe(renderHtml(d), `row.${path.join('.')}=${JSON.stringify(v)}`);
        cases++;
      }
    }
    for (const v of ALL_HOSTILE) {
      const d: any = createSampleDesign();
      d.rows[3].ratios = [v, v, v];
      d.rows[4].columns = v;
      d.rows[2].columns[0].blocks = v;
      assertSafe(renderHtml(d), 'row structure');
      cases++;
    }
  });

  it('body fields (including contentWidth, fontFamily, preheader)', () => {
    for (const key of Object.keys(createDesign().body)) {
      for (const v of SWEEP) {
        const d: any = createSampleDesign();
        d.body[key] = v;
        assertSafe(renderHtml(d, { title: typeof v === 'object' ? JSON.stringify(v) : String(v) }), `body.${key}=${JSON.stringify(v)}`);
        cases++;
      }
    }
  });

  it('title option is escaped', () => {
    assertSafe(renderHtml(createDesign(), { title: '</title><script>alert(1)</script>' }));
  });

  it('structurally broken designs never throw', () => {
    const junk: unknown[] = [undefined, null, 1, 'x', [], {}, { rows: 1 }, { body: 1, rows: [null, 1, 'x', [], {}] }, { rows: [{ columns: [null, { blocks: [null, 1, { type: 'nope' }, { type: 'text', padding: null }] }], ratios: 'x' }] }, { rows: [{ columns: [{ blocks: [{ type: 'text', padding: { top: '<script>' } }] }] }] }];
    for (const j of junk) assertSafe(renderHtml(j as any), JSON.stringify(j));
  });

  it('reports the size of the hostile corpus', () => {
    expect(cases).toBeGreaterThan(1500);
    // eslint-disable-next-line no-console
    console.log(`hostile render cases: ${cases}; corpus: ${HOSTILE.length} strings + ${ALL_HOSTILE.length - HOSTILE.length} non-string values`);
  });
});

describe('regression: the QA exploit', () => {
  it('align = left"><img src=x onerror=...> does not produce an element or handler', () => {
    const b: any = createBlock('text');
    b.align = 'left"><img src=x onerror=alert(1)>';
    const out = renderBlockContent(b);
    expect(out).not.toContain('onerror');
    expect(out).toContain('text-align:left;');
  });
  it('level 7 does not produce <h7>', () => {
    const b: any = createBlock('heading');
    b.level = 7;
    expect(renderBlockContent(b)).toMatch(/^<h3 /);
  });
  it('valid sample designs render with the expected structure', () => {
    const html = renderHtml(createSampleDesign());
    assertSafe(html);
    expect(html).toContain('width="33.33%"');
  });
});
