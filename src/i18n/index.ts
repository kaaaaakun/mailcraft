import { en, type MessageKey, type Messages } from './en.js';
import { ja } from './ja.js';

export type { MessageKey, Messages };

/** Built-in dictionaries. */
export const locales: Record<string, Messages> = { en, ja };

export interface I18n {
  /** Resolved locale code that was requested (e.g. "ja"). */
  readonly locale: string;
  t(key: MessageKey, params?: Record<string, string | number>): string;
}

const base = (code: string) => code.toLowerCase().split(/[-_]/)[0];

/** Pick a locale from `navigator.language` (falls back to "en"). */
export function detectLocale(): string {
  try {
    return base(navigator.language || 'en') || 'en';
  } catch {
    return 'en';
  }
}

/**
 * Build a translator. Lookup order per key:
 * custom[exact] -> custom[base] -> built-in[exact] -> built-in[base] -> custom.en -> en -> the key itself.
 * A missing key never throws.
 */
export function createI18n(locale?: string, custom: Record<string, Partial<Messages>> = {}): I18n {
  const code = (locale || detectLocale()).trim() || 'en';
  const lower = code.toLowerCase();
  const b = base(code);
  const find = (dict: Record<string, Partial<Messages> | undefined>, k: string) => {
    for (const key of Object.keys(dict)) if (key.toLowerCase() === k) return dict[key];
    return undefined;
  };
  const chain: (Partial<Messages> | undefined)[] = [
    find(custom, lower), find(custom, b), find(locales, lower), find(locales, b), find(custom, 'en'), en,
  ];
  return {
    locale: code,
    t(key, params) {
      let s: string | undefined;
      for (const d of chain) {
        const v = d?.[key];
        if (typeof v === 'string') { s = v; break; }
      }
      s ??= String(key);
      return params ? s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : s;
    },
  };
}
