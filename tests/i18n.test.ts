import { beforeEach, describe, expect, it } from 'vitest';
import { createEditor, createI18n, locales } from '../src';
import { en } from '../src/i18n/en';

describe('i18n dictionaries', () => {
  it('ja has exactly the same keys as en (parity) and no empty strings', () => {
    expect(Object.keys(locales.ja).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(locales.ja)) expect(v, k).not.toBe('');
  });

  it('keeps {placeholders} identical across locales', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(locales.ja[k]), k).toBe(ph(en[k]));
  });

  it('resolves exact, base language and falls back to en', () => {
    expect(createI18n('ja-JP').t('undo')).toBe(locales.ja.undo);
    expect(createI18n('fr').t('undo')).toBe(en.undo);
  });

  it('applies overrides, custom locales and per-key fallback; unknown keys do not throw', () => {
    const i = createI18n('fr', { fr: { undo: 'Annuler' } });
    expect(i.t('undo')).toBe('Annuler');
    expect(i.t('redo')).toBe(en.redo);
    expect(createI18n('en', { en: { preview: 'Look' } }).t('preview')).toBe('Look');
    expect(createI18n('ja', { ja: { preview: 'ミル' } }).t('undo')).toBe(locales.ja.undo);
    expect(createI18n('en').t('nope' as never)).toBe('nope');
    expect(createI18n('en').t('columnsCount', { n: 3 })).toBe('3 columns');
  });

  it('auto-detects from navigator.language when no locale is given', () => {
    expect(createI18n().locale).toBe('en');
  });
});

describe('editor locale', () => {
  let el: HTMLElement;
  beforeEach(() => { el = document.createElement('div'); document.body.append(el); });

  it('renders with the given locale and setLocale re-renders the UI', () => {
    const ed = createEditor(el, { locale: 'en' });
    expect(el.textContent).toContain(en.tabContent);
    expect(el.textContent).toContain(en.emptyCanvasTitle);
    ed.setLocale('ja');
    expect(ed.getLocale()).toBe('ja');
    expect(el.textContent).toContain(locales.ja.tabContent);
    expect(el.textContent).toContain(locales.ja.emptyCanvasTitle);
    expect(el.textContent).not.toContain(en.emptyCanvasTitle);
    expect(el.querySelector('button[title^="' + locales.ja.undo + '"]')).not.toBeNull();
  });

  it('uses custom messages and localized default block texts', () => {
    const ed = createEditor(el, { locale: 'xx', messages: { xx: { blockButton: 'Knopf', defaultButton: 'Los' } } });
    const tile = el.querySelector<HTMLElement>('[data-block-type="button"]')!;
    expect(tile.textContent).toBe('Knopf');
    tile.click();
    const b = ed.getDesign().rows[0].columns[0].blocks[0];
    expect(b.type === 'button' && b.text).toBe('Los');
    expect(el.textContent).toContain(en.tabContent); // fell back to en
  });
});
