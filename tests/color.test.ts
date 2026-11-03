import { describe, expect, it } from 'vitest';
import { checkContrast, contrastRatio, ensureContrast, fromOklch, mix, normalizeColor, onColor, parseColor, toHex, toOklch } from '../src/editor/color';

describe('parseColor', () => {
  it('parses hex, rgb(), hsl() and names; alpha is ignored', () => {
    expect(toHex(parseColor('#fff')!)).toBe('#ffffff');
    expect(toHex(parseColor('#1a2B3c')!)).toBe('#1a2b3c');
    expect(toHex(parseColor('#11223344')!)).toBe('#112233');
    expect(toHex(parseColor('#1234')!)).toBe('#112233');
    expect(toHex(parseColor('rgb(255, 0, 0)')!)).toBe('#ff0000');
    expect(toHex(parseColor('rgb(0 128 255 / 50%)')!)).toBe('#0080ff');
    expect(toHex(parseColor('rgba(10,20,30,.5)')!)).toBe('#0a141e');
    expect(toHex(parseColor('hsl(0, 100%, 50%)')!)).toBe('#ff0000');
    expect(toHex(parseColor('hsl(120deg 100% 25%)')!)).toBe('#008000');
    expect(toHex(parseColor('  Coral ')!)).toBe('#ff7f50');
    expect(normalizeColor('navy')).toBe('#000080');
  });
  it('returns null (never throws) for invalid input', () => {
    for (const bad of ['', 'red!', '#12', '#12345', '#gggggg', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(1,2,3)', 'var(--x)', 'notacolor', 'rgb(1 2 3 / 4 / 5)']) expect(parseColor(bad)).toBeNull();
    for (const bad of [undefined, null, 5, {}, []]) expect(parseColor(bad)).toBeNull();
  });
});

describe('contrast (WCAG 2.x)', () => {
  it('known values', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
  it('checkContrast reports AA/AAA flags and null for invalid colors', () => {
    const r = checkContrast('#000000', '#ffffff')!;
    expect(r.ratio).toBeCloseTo(21, 5);
    expect(r).toMatchObject({ aa: true, aaLarge: true, aaa: true });
    expect(checkContrast('#777', '#fff')).toMatchObject({ aa: false, aaLarge: true });
    expect(checkContrast('nope', '#fff')).toBeNull();
  });
  it('onColor picks white/black with AA when reachable', () => {
    expect(onColor(parseColor('#2f6fed')!)).toMatchObject({ color: '#ffffff', ok: true });
    expect(onColor(parseColor('#ffee00')!)).toMatchObject({ color: '#000000', ok: true });
    // mid colors where neither is great still choose the better one
    const mid = onColor(parseColor('#777777')!);
    expect(mid.ratio).toBeGreaterThanOrEqual(4.5);
  });
  it('white or black always reaches AA on every color of a coarse grid', () => {
    let worst = 99;
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) worst = Math.min(worst, onColor({ r, g, b }).ratio);
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

describe('OKLCH helpers', () => {
  it('round-trips sRGB through OKLCH', () => {
    for (const hex of ['#2f6fed', '#10b981', '#ff6b4a', '#475467', '#000000', '#ffffff']) {
      const o = toOklch(parseColor(hex)!);
      const back = toHex(fromOklch(o.l, o.c, o.h));
      const d = (i: number) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16));
      expect(Math.max(d(1), d(3), d(5))).toBeLessThanOrEqual(1);
    }
  });
  it('gamut-maps out-of-range chroma instead of producing garbage', () => {
    const c = fromOklch(0.6, 0.6, 140);
    for (const v of [c.r, c.g, c.b]) expect(v >= 0 && v <= 255).toBe(true);
  });
  it('mix interpolates between endpoints', () => {
    const a = parseColor('#ffffff')!, b = parseColor('#000000')!;
    expect(toHex(mix(a, b, 0))).toBe('#ffffff');
    expect(toHex(mix(a, b, 1))).toBe('#000000');
    const m = toOklch(mix(a, b, 0.5));
    expect(m.l).toBeGreaterThan(0.4); expect(m.l).toBeLessThan(0.7);
  });
  it('ensureContrast lifts/darkens until the target, and leaves passing colors alone', () => {
    const dark = parseColor('#1e222b')!, light = parseColor('#ffffff')!;
    const indigo = parseColor('#4f46e5')!;
    expect(contrastRatio(indigo, dark)).toBeLessThan(4.5);
    expect(contrastRatio(ensureContrast(indigo, dark, 4.5), dark)).toBeGreaterThanOrEqual(4.5);
    const yellow = parseColor('#facc15')!;
    expect(contrastRatio(ensureContrast(yellow, light, 4.5), light)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast(indigo, light, 4.5)).toBe(indigo);
  });
});
