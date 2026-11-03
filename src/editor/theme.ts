/**
 * Editor chrome theme. This styles the editor UI only (toolbar, panels, selection outlines).
 * Colors inside the email itself live in the design JSON and are never affected.
 */
export interface MailcraftTheme {
  /** Base palette. `dark` swaps the default surfaces/text for a dark set. */
  mode: 'light' | 'dark';
  /** Primary / selection color. Hover, focus rings and soft fills are derived from it. */
  accent: string;
  /** Text/icon color on top of the accent. */
  accentContrast: string;
  /** Soft tint of the accent (hover/active fills). Derived from accent + panel when omitted. */
  accentSoft?: string;
  /** Workspace background behind the canvas and the top bar. */
  background: string;
  /** Panels, tiles and inputs. */
  panel: string;
  border: string;
  text: string;
  muted: string;
  /** Corner radius in px. */
  radius: number;
  fontFamily: string;
}

const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

export const defaultTheme: MailcraftTheme = {
  mode: 'light',
  accent: '#2f6fed',
  accentContrast: '#ffffff',
  background: '#eef0f3',
  panel: '#ffffff',
  border: '#e2e5ea',
  text: '#1d2330',
  muted: '#6b7280',
  radius: 8,
  fontFamily: FONT,
};

export const darkTheme: MailcraftTheme = {
  mode: 'dark',
  accent: '#5b8cff',
  accentContrast: '#0b1020',
  background: '#14171d',
  panel: '#1e222b',
  border: '#2d323d',
  text: '#e6e9ef',
  muted: '#9aa3b2',
  radius: 8,
  fontFamily: FONT,
};

const VARS: Record<string, string> = {
  accent: '--mc-accent',
  accentContrast: '--mc-accent-contrast',
  accentSoft: '--mc-accent-soft',
  background: '--mc-bg',
  panel: '--mc-panel',
  border: '--mc-border',
  text: '--mc-text',
  muted: '--mc-muted',
  fontFamily: '--mc-font',
};

/** Merge a partial theme over the preset for its mode. */
export function resolveTheme(partial: Partial<MailcraftTheme> = {}): MailcraftTheme {
  const preset = partial.mode === 'dark' ? darkTheme : defaultTheme;
  return { ...preset, ...partial };
}

/** Write the theme as CSS custom properties on `el`. Optional `accentSoft` is removed when absent so CSS derives it. */
export function applyTheme(el: HTMLElement, theme: MailcraftTheme): void {
  for (const [key, cssVar] of Object.entries(VARS)) {
    const v = (theme as unknown as Record<string, unknown>)[key];
    if (typeof v === 'string' && v) el.style.setProperty(cssVar, v);
    else el.style.removeProperty(cssVar);
  }
  el.style.setProperty('--mc-radius', `${Math.max(0, theme.radius)}px`);
  el.style.setProperty('color-scheme', theme.mode);
  el.dataset.mcMode = theme.mode;
}
