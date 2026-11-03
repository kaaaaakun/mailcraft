/**
 * Editor layout. Decides how the three panes (palette / canvas / properties) are arranged.
 * The decision is made from the width of the editor's own container (not the browser viewport),
 * because the editor is usually embedded in a host page.
 */
export type LayoutMode = 'auto' | 'split' | 'compact' | 'stacked';
/** The resolved arrangement, exposed as `data-layout` on the editor root. */
export type ResolvedLayout = 'wide' | 'compact' | 'stacked';

export interface MailcraftLayout {
  /** `auto` (default) picks by container width using `breakpoints`; the others force one arrangement (`split` = wide 3 panes). */
  mode: LayoutMode;
  /** Container widths in px. width >= compact -> wide, stacked <= width < compact -> compact, width < stacked -> stacked. */
  breakpoints: { compact: number; stacked: number };
  /** `false` hides a pane. Hiding the left palette also removes click-to-add and drag-from-palette (the host must provide its own). */
  sidebars: { left: boolean; right: boolean };
  /** Palette width in px for the wide layout (the compact layout uses a fixed icon rail). Clamped to 160-480. */
  leftWidth: number;
  /** Properties panel width in px (wide; compact caps it at 288). Clamped to 240-560. */
  rightWidth: number;
}

export type MailcraftLayoutInput = {
  mode?: LayoutMode;
  breakpoints?: Partial<MailcraftLayout['breakpoints']>;
  sidebars?: Partial<MailcraftLayout['sidebars']>;
  leftWidth?: number;
  rightWidth?: number;
};

export const defaultLayout: MailcraftLayout = {
  mode: 'auto',
  breakpoints: { compact: 1100, stacked: 820 },
  sidebars: { left: true, right: true },
  leftWidth: 264,
  rightWidth: 320,
};

export const LEFT_WIDTH_RANGE: [number, number] = [160, 480];
export const RIGHT_WIDTH_RANGE: [number, number] = [240, 560];

const MODES: readonly string[] = ['auto', 'split', 'compact', 'stacked'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Merge a partial layout over `base`. Invalid values are ignored (never thrown). Does not mutate `base`. */
export function mergeLayout(base: MailcraftLayout, input: unknown): MailcraftLayout {
  const out: MailcraftLayout = { ...base, breakpoints: { ...base.breakpoints }, sidebars: { ...base.sidebars } };
  if (!input || typeof input !== 'object') return out;
  const p = input as Record<string, unknown>;
  if (typeof p.mode === 'string' && MODES.includes(p.mode)) out.mode = p.mode as LayoutMode;
  if (p.breakpoints && typeof p.breakpoints === 'object') {
    const b = p.breakpoints as Record<string, unknown>;
    const next = { ...out.breakpoints };
    if (isNum(b.compact) && b.compact > 0) next.compact = Math.round(b.compact);
    if (isNum(b.stacked) && b.stacked > 0) next.stacked = Math.round(b.stacked);
    if (next.compact >= next.stacked) out.breakpoints = next; // an inverted pair is ignored as a whole
  }
  if (p.sidebars && typeof p.sidebars === 'object') {
    const s = p.sidebars as Record<string, unknown>;
    if (typeof s.left === 'boolean') out.sidebars.left = s.left;
    if (typeof s.right === 'boolean') out.sidebars.right = s.right;
  }
  if (isNum(p.leftWidth)) out.leftWidth = clamp(p.leftWidth, LEFT_WIDTH_RANGE);
  if (isNum(p.rightWidth)) out.rightWidth = clamp(p.rightWidth, RIGHT_WIDTH_RANGE);
  return out;
}

/** Container width -> arrangement. An unknown width (<= 0, e.g. jsdom / display:none) counts as wide. */
export function resolveLayout(layout: MailcraftLayout, width: number): ResolvedLayout {
  if (layout.mode === 'split') return 'wide';
  if (layout.mode === 'compact') return 'compact';
  if (layout.mode === 'stacked') return 'stacked';
  if (!isNum(width) || width <= 0) return 'wide';
  if (width < layout.breakpoints.stacked) return 'stacked';
  if (width < layout.breakpoints.compact) return 'compact';
  return 'wide';
}

export const cloneLayout = (l: MailcraftLayout): MailcraftLayout => ({ ...l, breakpoints: { ...l.breakpoints }, sidebars: { ...l.sidebars } });
