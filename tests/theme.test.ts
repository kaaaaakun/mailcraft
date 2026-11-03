import { beforeEach, describe, expect, it } from 'vitest';
import { createEditor, darkTheme, defaultTheme } from '../src';

describe('theme', () => {
  let el: HTMLElement;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });
  const root = () => el.querySelector<HTMLElement>('.mc-root')!;
  const v = (n: string) => root().style.getPropertyValue(n);

  it('applies the default light theme as CSS variables on the root', () => {
    createEditor(el);
    expect(v('--mc-accent')).toBe(defaultTheme.accent);
    expect(v('--mc-panel')).toBe(defaultTheme.panel);
    expect(v('--mc-radius')).toBe(`${defaultTheme.radius}px`);
    expect(root().dataset.mcMode).toBe('light');
    expect(v('--mc-accent-soft')).toBe(''); // derived in CSS from accent
  });

  it('merges a partial theme from options', () => {
    createEditor(el, { theme: { accent: '#ff0066', radius: 2 } });
    expect(v('--mc-accent')).toBe('#ff0066');
    expect(v('--mc-radius')).toBe('2px');
    expect(v('--mc-text')).toBe(defaultTheme.text);
  });

  it('dark mode uses the dark preset; explicit values still win', () => {
    createEditor(el, { theme: { mode: 'dark', accent: '#00aa88' } });
    expect(root().dataset.mcMode).toBe('dark');
    expect(v('--mc-panel')).toBe(darkTheme.panel);
    expect(v('--mc-accent')).toBe('#00aa88');
  });

  it('setTheme updates variables live, accumulates, and does not touch the design', () => {
    const ed = createEditor(el);
    const before = JSON.stringify(ed.getDesign());
    ed.setTheme({ accent: '#123456' });
    ed.setTheme({ mode: 'dark', accentSoft: '#222244' });
    expect(v('--mc-accent')).toBe('#123456');
    expect(v('--mc-bg')).toBe(darkTheme.background);
    expect(v('--mc-accent-soft')).toBe('#222244');
    expect(ed.getTheme().mode).toBe('dark');
    expect(JSON.stringify(ed.getDesign())).toBe(before);
  });
});
