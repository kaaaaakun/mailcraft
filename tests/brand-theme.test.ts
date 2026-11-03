import { beforeEach, describe, expect, it } from 'vitest';
import { createEditor, darkTheme, defaultTheme, deriveTheme, checkContrast, mergeThemeInput, type MailcraftTheme } from '../src';
import { contrastRatio, parseColor } from '../src/editor/color';

const BRANDS: Array<[string, string, string]> = [
  ['#4f46e5', '#0ea5e9', '#475467'], // indigo
  ['#10b981', '#f59e0b', '#44403c'], // green
  ['#ff6b4a', '#7c3aed', '#52525b'], // coral
  ['#111827', '#6b7280', '#374151'], // mono
  ['#facc15', '#22d3ee', '#475467'], // very light primary
  ['#7f1d1d', '#1e3a8a', '#0f172a'], // very dark
  ['#ffffff', '#000000', '#808080'], // extremes
];

describe('deriveTheme', () => {
  it('without brand/accent returns the plain presets (legacy)', () => {
    const l = deriveTheme({});
    expect(l).toMatchObject({ mode: 'light', accent: defaultTheme.accent, panel: defaultTheme.panel, text: defaultTheme.text });
    expect(l.vars['--mc-secondary']).toBeUndefined();
    const d = deriveTheme({ mode: 'dark' });
    expect(d).toMatchObject({ accent: darkTheme.accent, panel: darkTheme.panel, accentContrast: darkTheme.accentContrast });
  });

  it('derives a tinted neutral scale from `normal`, in light and dark', () => {
    const l = deriveTheme({ brand: { primary: '#4f46e5', normal: '#475467' } });
    const d = deriveTheme({ mode: 'dark', brand: { primary: '#4f46e5', normal: '#475467' } });
    expect(parseColor(l.panel)).not.toBeNull();
    expect(l.panel).not.toBe(defaultTheme.panel);
    expect(contrastRatio(l.text, l.panel)).toBeGreaterThan(10);
    expect(contrastRatio(d.text, d.panel)).toBeGreaterThan(10);
    expect(l.palette.normal).toBe('#475467');
    // dark surfaces are darker than light ones
    expect(contrastRatio(d.background, '#000000')).toBeLessThan(contrastRatio(l.background, '#000000'));
  });

  it('explicit legacy keys override derived values', () => {
    const t = deriveTheme({ brand: { normal: '#475467' }, panel: '#fafafa', text: '#111111' });
    expect(t.panel).toBe('#fafafa');
    expect(t.vars['--mc-panel']).toBe('#fafafa');
    expect(t.text).toBe('#111111');
  });

  it('secondary defaults to primary; accent is an alias of primary', () => {
    const t = deriveTheme({ brand: { primary: '#ff0066' } });
    expect(t.palette.secondary).toBe(t.palette.primary);
    const a = deriveTheme({ accent: '#7c3aed' });
    expect(a.accent).toBe('#7c3aed');
    expect(a.accentContrast).toBe('#ffffff');
    const both = deriveTheme({ accent: '#111111', brand: { primary: '#ff0066' } });
    expect(both.accent).toBe('#ff0066');
  });

  it('computes an AA accentContrast for a custom accent and warns for an explicit bad one', () => {
    expect(deriveTheme({ accent: '#ffee00' }).accentContrast).toBe('#000000');
    const bad = deriveTheme({ accent: '#ffee00', accentContrast: '#ffffff' });
    expect(bad.warnings.some((w) => w.code === 'onPrimary')).toBe(true);
  });

  it('warns when the primary is invisible on the panel (white primary, light mode)', () => {
    const t = deriveTheme({ brand: { primary: '#ffffff', normal: '#475467' } });
    expect(t.warnings.some((w) => w.code === 'primaryOnPanel')).toBe(true);
  });

  it('AA contrast holds for generated pairs across a grid of brand colors (light and dark)', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const [primary, secondary, normal] of BRANDS) {
        const t = deriveTheme({ mode, brand: { primary, secondary, normal } });
        const tag = `${mode} ${primary}/${secondary}/${normal}`;
        const v = t.vars;
        const check = (fg: string, bg: string, min: number, what: string) => expect(contrastRatio(fg, bg), `${tag}: ${what}`).toBeGreaterThanOrEqual(min - 0.01);
        check(v['--mc-accent-contrast'], v['--mc-accent'], 4.5, 'onPrimary');
        check(v['--mc-secondary-contrast'], v['--mc-secondary'], 4.5, 'onSecondary');
        check(v['--mc-text'], v['--mc-panel'], 7, 'text/panel');
        check(v['--mc-text'], v['--mc-bg'], 7, 'text/bg');
        check(v['--mc-muted'], v['--mc-panel'], 4.5, 'muted/panel');
        check(v['--mc-muted'], v['--mc-bg'], 4.5, 'muted/bg');
        check(v['--mc-text'], v['--mc-accent-soft'], 7, 'text/primarySoft');
        check(v['--mc-text'], v['--mc-secondary-soft'], 7, 'text/secondarySoft');
        check(v['--mc-accent-ink'], v['--mc-accent-soft'], 4.5, 'primaryInk/soft');
        check(v['--mc-secondary-ink'], v['--mc-secondary-soft'], 4.5, 'secondaryInk/soft');
        check(v['--mc-accent-contrast'], v['--mc-accent-hover'], 4.5, 'onPrimary/hover');
        if (mode === 'dark') {
          check(v['--mc-accent'], v['--mc-panel'], 4.5, 'primary/panel (dark)');
          check(v['--mc-secondary'], v['--mc-panel'], 4.5, 'secondary/panel (dark)');
        }
      }
    }
  });

  it('exposes the palette with tints and never throws on garbage', () => {
    const p = deriveTheme({ brand: { primary: '#4f46e5', secondary: '#0ea5e9', normal: '#475467' } }).palette;
    expect(p.primary).toBe('#4f46e5');
    expect(p.secondary).toBe('#0ea5e9');
    for (const k of ['soft', 'hover', 'active', 'ink', 'contrast', 'line'] as const) expect(p.tints.primary[k]).toBeTruthy();
    expect(() => deriveTheme({ brand: { primary: 'nope' as string, normal: 5 as unknown as string }, accent: 12 as unknown as string, radius: NaN, mode: 'x' as 'dark' })).not.toThrow();
    expect(deriveTheme({ brand: { primary: 'nope' } }).accent).toBe(defaultTheme.accent);
  });

  it('checkContrast is exported from the package entry', () => {
    expect(checkContrast('#000', '#fff')!.ratio).toBeCloseTo(21, 5);
  });
});

describe('mergeThemeInput', () => {
  it('accumulates brand keys partially and ignores invalid values (keeps the previous one)', () => {
    let t: Partial<MailcraftTheme> = mergeThemeInput({}, { brand: { primary: '#112233' } });
    t = mergeThemeInput(t, { brand: { secondary: 'rgb(1,2,3)' } });
    t = mergeThemeInput(t, { brand: { primary: 'banana', normal: '#445566' } });
    expect(t.brand).toEqual({ primary: '#112233', secondary: 'rgb(1,2,3)', normal: '#445566' });
    t = mergeThemeInput(t, { brand: { secondary: undefined } });
    expect(t.brand).toEqual({ primary: '#112233', normal: '#445566' });
  });
  it('last write wins between accent and brand.primary; invalid accent keeps the old one', () => {
    let t = mergeThemeInput({}, { brand: { primary: '#112233' } });
    t = mergeThemeInput(t, { accent: '#445566' });
    expect(deriveTheme(t).accent).toBe('#445566');
    t = mergeThemeInput(t, { brand: { primary: '#778899' } });
    expect(t.accent).toBeUndefined();
    t = mergeThemeInput(t, { accent: 'red!' });
    expect(t.brand?.primary).toBe('#778899');
  });
  it('ignores bad mode and radius, never throws on null', () => {
    const t = mergeThemeInput({ mode: 'dark', radius: 4 }, { mode: 'sepia' as 'dark', radius: Infinity });
    expect(t).toMatchObject({ mode: 'dark', radius: 4 });
    expect(() => mergeThemeInput({}, null)).not.toThrow();
  });
});

describe('editor integration', () => {
  let el: HTMLElement;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });
  const root = () => el.querySelector<HTMLElement>('.mc-root')!;
  const v = (n: string) => root().style.getPropertyValue(n);

  it('applies derived CSS variables from brand colors', () => {
    createEditor(el, { theme: { brand: { primary: '#4f46e5', secondary: '#0ea5e9', normal: '#475467' } } });
    expect(v('--mc-accent')).toBe('#4f46e5');
    expect(v('--mc-secondary')).toBe('#0ea5e9');
    expect(v('--mc-accent-contrast')).toBe('#ffffff');
    expect(v('--mc-panel')).toMatch(/^#[0-9a-f]{6}$/);
    expect(v('--mc-accent-soft')).toMatch(/^#[0-9a-f]{6}$/);
    expect(v('--mc-icon')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('setTheme accumulates brand colors and survives a light/dark switch', () => {
    const ed = createEditor(el);
    ed.setTheme({ brand: { primary: '#10b981' } });
    ed.setTheme({ brand: { normal: '#44403c' } });
    ed.setTheme({ brand: { primary: 'not-a-color' } });
    const light = v('--mc-panel');
    expect(ed.getBrandPalette().normal).toBe('#44403c');
    ed.setTheme({ mode: 'dark' });
    expect(root().dataset.mcMode).toBe('dark');
    expect(v('--mc-panel')).not.toBe(light);
    expect(ed.getTheme().brand.primary).not.toBe('#ffffff');
    expect(ed.getTheme().vars['--mc-accent']).toBe(v('--mc-accent'));
    expect(contrastRatio(v('--mc-accent'), v('--mc-panel'))).toBeGreaterThanOrEqual(4.5);
  });

  it('accent still works as an alias and removes stale brand variables when brand is cleared', () => {
    const ed = createEditor(el, { theme: { accent: '#ff0066' } });
    expect(v('--mc-accent')).toBe('#ff0066');
    expect(v('--mc-secondary')).toBe(''); // falls back to the accent in CSS
    ed.setTheme({ brand: { secondary: '#00aa88' } });
    expect(v('--mc-secondary')).toBe('#00aa88');
    ed.setTheme({ brand: undefined });
    expect(v('--mc-secondary')).toBe('');
    expect(v('--mc-accent')).toBe('#ff0066');
  });

  it('getTheme exposes warnings for low-contrast brand colors', () => {
    const ed = createEditor(el, { theme: { brand: { primary: '#ffffff' } } });
    expect(ed.getTheme().warnings.length).toBeGreaterThan(0);
  });
});
