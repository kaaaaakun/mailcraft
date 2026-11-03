import { ensureContrast, mix, normalizeColor, onColor, parseColor, fromOklch, rgba, shiftLightness, toHex, toOklch, contrastRatio, type RGB } from './color.js';

/** The three brand colors, by importance. All optional; any accepted CSS color format. */
export interface BrandColors { primary?: string; secondary?: string; normal?: string }

/** A contrast problem found while deriving the theme (never thrown; read it from `getTheme().warnings`). */
export interface ThemeWarning {
  code: 'onPrimary' | 'onSecondary' | 'primaryOnPanel' | 'secondaryOnPanel';
  message: string;
  ratio: number;
}

/** Derived variants of one brand color. */
export interface BrandTones {
  /** The color as used in the current mode (lifted in dark mode when needed for contrast). */
  color: string;
  /** Text/icon color on top of `color` (white or black, AA when reachable). */
  contrast: string;
  /** Soft background tint (mixed into the panel). */
  soft: string;
  /** Translucent line/hairline variant. */
  line: string;
  hover: string;
  active: string;
  /** Readable as text/icon on `soft`. */
  ink: string;
}

export interface BrandPalette {
  primary: string;
  secondary: string;
  normal: string;
  tints: {
    primary: BrandTones;
    secondary: BrandTones;
    normal: { background: string; panel: string; input: string; border: string; muted: string; text: string; disabled: string };
  };
  warnings: ThemeWarning[];
}

/**
 * Editor chrome theme. This styles the editor UI only (toolbar, panels, selection outlines).
 * Colors inside the email itself live in the design JSON and are never affected.
 */
export interface MailcraftTheme {
  /**
   * EXPERIMENTAL (API under discussion in issue #4). Host brand colors by importance; everything else is derived.
   * `primary`: selection outline, focus ring, primary buttons, active tabs, drop indicator.
   * `secondary`: row-level chrome, secondary buttons, badges, icon highlights, tile hover tints.
   * `normal`: the neutral/ink color; text, muted text, borders, surfaces and panels are a tinted scale of it.
   * Accepts #rgb/#rrggbb/#rrggbbaa, rgb(), hsl() and basic color names; invalid values are ignored.
   */
  brand?: BrandColors;
  /** Base palette. `dark` swaps the default surfaces/text for a dark set. */
  mode: 'light' | 'dark';
  /** Primary / selection color. Alias of `brand.primary` (used verbatim when no `brand` is set). Invalid values are ignored. Hover, focus rings and soft fills are derived from it. */
  accent: string;
  /** Text/icon color on top of the accent. Computed (white/black, AA) for a custom accent when omitted. */
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

/** The theme after derivation: every field filled, plus the CSS variables, the palette and any warnings. */
export interface ResolvedTheme extends MailcraftTheme {
  brand: Required<BrandColors>;
  palette: BrandPalette;
  /** CSS custom properties written on the editor root (`--mc-*`). */
  vars: Record<string, string>;
  warnings: ThemeWarning[];
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

const ALL_VARS = [
  '--mc-accent', '--mc-accent-contrast', '--mc-accent-soft', '--mc-accent-line', '--mc-accent-hover', '--mc-accent-active', '--mc-accent-ink',
  '--mc-focus-ring', '--mc-secondary', '--mc-secondary-contrast', '--mc-secondary-soft', '--mc-secondary-line', '--mc-secondary-hover',
  '--mc-secondary-active', '--mc-secondary-ink', '--mc-icon', '--mc-icon-hover', '--mc-disabled-bg', '--mc-disabled-text',
  '--mc-bg', '--mc-panel', '--mc-border', '--mc-text', '--mc-muted', '--mc-font',
];

const hex = (c: RGB) => toHex(c);

interface Neutrals { background: string; panel: string; input: string; border: string; text: string; muted: string }

/** Tinted neutral scale from the `normal` brand color: hue/chroma are kept (capped), lightness is re-mapped per mode. */
function deriveNeutrals(normal: RGB, dark: boolean): Neutrals {
  const o = toOklch(normal);
  const T = (l: number, cap: number) => fromOklch(l, Math.min(o.c, cap), o.h);
  if (!dark) {
    const bg = T(0.958, 0.01);
    return {
      panel: hex(T(0.996, 0.004)), background: hex(bg), input: hex(T(0.978, 0.007)), border: hex(T(0.9, 0.016)),
      text: hex(ensureContrast(T(0.26, 0.035), bg, 7)),
      muted: hex(ensureContrast(T(Math.min(0.55, Math.max(0.45, o.l)), 0.04), bg, 4.5)),
    };
  }
  const panel = T(0.23, 0.014);
  return {
    background: hex(T(0.185, 0.012)), panel: hex(panel), input: hex(T(0.205, 0.012)), border: hex(T(0.33, 0.02)),
    text: hex(ensureContrast(T(0.94, 0.012), panel, 7)),
    muted: hex(ensureContrast(T(0.74, 0.03), panel, 4.5)),
  };
}

function tones(c: RGB, panel: RGB, softAmount: number): BrandTones {
  const on = onColor(c);
  const soft = mix(panel, c, softAmount);
  const d = on.color === '#ffffff' ? -1 : 1; // move away from the text color so contrast only improves
  return {
    color: hex(c), contrast: on.color, soft: hex(soft), line: rgba(c, 0.45),
    hover: hex(shiftLightness(c, d * 0.05)), active: hex(shiftLightness(c, d * 0.09)),
    ink: hex(ensureContrast(c, soft, 4.5)),
  };
}

/**
 * Pure derivation: partial theme in, fully resolved theme out. Never throws.
 * Precedence: explicit legacy keys (`background`, `panel`, `text`, ...) > brand-derived values > mode preset.
 * Without any `brand` colors the result is the plain preset (legacy behavior), except that a custom `accent`
 * also gets a computed `accentContrast` plus hover/active/focus variants.
 */
export function deriveTheme(input: Partial<MailcraftTheme> = {}): ResolvedTheme {
  const dark = input.mode === 'dark';
  const preset = dark ? darkTheme : defaultTheme;
  const b = input.brand ?? {};
  const bPrimary = normalizeColor(b.primary), bSecondary = normalizeColor(b.secondary), bNormal = normalizeColor(b.normal);
  const accentIn = typeof input.accent === 'string' && parseColor(input.accent) ? input.accent : null;
  const brandMode = !!(bPrimary || bSecondary || bNormal);
  const customAccent = !!bPrimary || (!!accentIn && accentIn.toLowerCase() !== preset.accent.toLowerCase());
  const warnings: ThemeWarning[] = [];

  const neutrals: Neutrals = bNormal
    ? deriveNeutrals(parseColor(bNormal)!, dark)
    : { background: preset.background, panel: preset.panel, input: '', border: preset.border, text: preset.text, muted: preset.muted };
  const pick = (k: 'background' | 'panel' | 'border' | 'text' | 'muted') => (typeof input[k] === 'string' && input[k] ? (input[k] as string) : neutrals[k]);
  const background = pick('background'), panel = pick('panel'), border = pick('border'), text = pick('text'), muted = pick('muted');
  const panelRgb = parseColor(panel) ?? parseColor(preset.panel)!;
  const textRgb = parseColor(text) ?? parseColor(preset.text)!;

  // primary: brand.primary (or `accent` once brand mode is on) is adapted to the mode; a bare `accent` is verbatim.
  const adapt = !!bPrimary || (brandMode && !!accentIn);
  const basePrimary = parseColor(bPrimary ?? accentIn ?? preset.accent)!;
  const primary = adapt && dark ? ensureContrast(basePrimary, panelRgb, 4.5) : basePrimary;
  const bareAccent = !adapt && accentIn ? accentIn : null;
  const accent = bareAccent ?? hex(primary);
  const accentContrast = typeof input.accentContrast === 'string' && input.accentContrast ? input.accentContrast : customAccent ? onColor(primary).color : preset.accentContrast;
  const secondaryBase = parseColor(bSecondary ?? '') ?? primary;
  const secondary = bSecondary && dark ? ensureContrast(secondaryBase, panelRgb, 4.5) : secondaryBase;

  const pT = tones(primary, panelRgb, dark ? 0.22 : 0.12);
  const sT = tones(secondary, panelRgb, dark ? 0.18 : 0.1);
  const ratioP = contrastRatio(accentContrast, primary);
  if (ratioP < 4.5) warnings.push({ code: 'onPrimary', ratio: ratioP, message: `Text on the primary color has contrast ${ratioP.toFixed(2)}:1 (< 4.5:1, WCAG AA).` });
  if (brandMode) {
    const ratioS = contrastRatio(sT.contrast, secondary);
    if (ratioS < 4.5) warnings.push({ code: 'onSecondary', ratio: ratioS, message: `Text on the secondary color has contrast ${ratioS.toFixed(2)}:1 (< 4.5:1, WCAG AA).` });
  }
  const pOnPanel = contrastRatio(primary, panelRgb), sOnPanel = contrastRatio(secondary, panelRgb);
  if (pOnPanel < 3) warnings.push({ code: 'primaryOnPanel', ratio: pOnPanel, message: `The primary color is hard to see on the panel background (${pOnPanel.toFixed(2)}:1, < 3:1).` });
  if (brandMode && sOnPanel < 3) warnings.push({ code: 'secondaryOnPanel', ratio: sOnPanel, message: `The secondary color is hard to see on the panel background (${sOnPanel.toFixed(2)}:1, < 3:1).` });

  const accentSoft = typeof input.accentSoft === 'string' && input.accentSoft ? input.accentSoft : brandMode ? pT.soft : undefined;
  const fontFamily = typeof input.fontFamily === 'string' && input.fontFamily ? input.fontFamily : preset.fontFamily;
  const radius = typeof input.radius === 'number' && Number.isFinite(input.radius) ? input.radius : preset.radius;

  const disabledBg = hex(mix(panelRgb, textRgb, 0.08)), disabledText = hex(mix(panelRgb, textRgb, 0.42));
  const vars: Record<string, string> = {
    '--mc-accent': accent, '--mc-accent-contrast': accentContrast, '--mc-bg': background, '--mc-panel': panel, '--mc-border': border,
    '--mc-text': text, '--mc-muted': muted, '--mc-font': fontFamily,
  };
  if (accentSoft) vars['--mc-accent-soft'] = accentSoft;
  if (customAccent || brandMode) {
    const pc = bareAccent ? parseColor(bareAccent)! : primary;
    const d = onColor(pc).color === '#ffffff' ? -1 : 1;
    vars['--mc-accent-hover'] = bareAccent ? hex(shiftLightness(pc, d * 0.05)) : pT.hover;
    vars['--mc-accent-active'] = bareAccent ? hex(shiftLightness(pc, d * 0.09)) : pT.active;
    vars['--mc-focus-ring'] = rgba(pc, 0.35);
  }
  if (brandMode) {
    Object.assign(vars, {
      '--mc-accent-line': pT.line, '--mc-accent-ink': pT.ink,
      '--mc-secondary': sT.color, '--mc-secondary-contrast': sT.contrast, '--mc-secondary-soft': sT.soft, '--mc-secondary-line': sT.line,
      '--mc-secondary-hover': sT.hover, '--mc-secondary-active': sT.active, '--mc-secondary-ink': sT.ink,
      '--mc-icon': sT.ink, '--mc-icon-hover': pT.ink, '--mc-disabled-bg': disabledBg, '--mc-disabled-text': disabledText,
    });
  }

  const palette: BrandPalette = {
    primary: accent, secondary: hex(secondary), normal: bNormal ?? (normalizeColor(muted) ?? preset.muted),
    tints: {
      primary: { ...pT, color: accent }, secondary: sT,
      normal: { background, panel, input: neutrals.input || hex(mix(panelRgb, textRgb, 0.03)), border, muted, text, disabled: disabledText },
    },
    warnings,
  };
  return {
    mode: dark ? 'dark' : 'light', accent, accentContrast, accentSoft, background, panel, border, text, muted, radius, fontFamily,
    brand: { primary: palette.primary, secondary: palette.secondary, normal: palette.normal },
    palette, vars, warnings,
  };
}

/** Merge a partial theme over the preset for its mode (derives brand tokens). Same as `deriveTheme`. */
export function resolveTheme(partial: Partial<MailcraftTheme> = {}): ResolvedTheme {
  return deriveTheme(partial);
}

const THEME_STRING_KEYS = ['accentContrast', 'accentSoft', 'background', 'panel', 'border', 'text', 'muted', 'fontFamily'] as const;

/**
 * Accumulate `patch` into `prev` (what `createEditor({theme})` and `setTheme` use). Never throws:
 * invalid colors (`accent`, `brand.*`), unknown modes and non-finite radii are ignored and the previous value is kept;
 * `undefined` removes a key. `accent` and `brand.primary` are the same setting, so the one set last wins.
 */
export function mergeThemeInput(prev: Partial<MailcraftTheme>, patch: Partial<MailcraftTheme> | undefined | null): Partial<MailcraftTheme> {
  const out: Partial<MailcraftTheme> = { ...prev };
  if (!patch || typeof patch !== 'object') return out;
  const o = out as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  if (p.mode === 'light' || p.mode === 'dark') out.mode = p.mode;
  if ('radius' in p) {
    if (p.radius === undefined) delete out.radius;
    else if (typeof p.radius === 'number' && Number.isFinite(p.radius)) out.radius = p.radius;
  }
  for (const k of THEME_STRING_KEYS) {
    if (!(k in p)) continue;
    if (p[k] === undefined) delete o[k];
    else if (typeof p[k] === 'string') o[k] = p[k];
  }
  if ('accent' in p) {
    if (p.accent === undefined) delete out.accent;
    else if (normalizeColor(p.accent)) {
      out.accent = p.accent as string;
      if (out.brand) { out.brand = { ...out.brand }; delete out.brand.primary; }
    }
  }
  if ('brand' in p) {
    if (p.brand === undefined) delete out.brand;
    else if (p.brand && typeof p.brand === 'object') {
      const nb: BrandColors = { ...(out.brand ?? {}) };
      const pb = p.brand as Record<string, unknown>;
      for (const k of ['primary', 'secondary', 'normal'] as const) {
        if (!(k in pb)) continue;
        if (pb[k] === undefined) delete nb[k];
        else if (normalizeColor(pb[k])) { nb[k] = pb[k] as string; if (k === 'primary') delete out.accent; }
      }
      out.brand = nb;
    }
  }
  return out;
}

/** Write the resolved theme as CSS custom properties on `el`. Variables the theme does not set are removed so the stylesheet defaults apply. */
export function applyTheme(el: HTMLElement, theme: MailcraftTheme | ResolvedTheme): void {
  const r = 'vars' in theme && theme.vars ? (theme as ResolvedTheme) : deriveTheme(theme);
  for (const name of ALL_VARS) {
    const v = r.vars[name];
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  }
  el.style.setProperty('--mc-radius', `${Math.max(0, r.radius)}px`);
  el.style.setProperty('color-scheme', r.mode);
  el.dataset.mcMode = r.mode;
}
