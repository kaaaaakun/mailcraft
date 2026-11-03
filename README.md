# Mailcraft

A source-available, embeddable **drag & drop email editor** — free for noncommercial use ([PolyForm Noncommercial 1.0.0](LICENSE)), dependency-free and framework-agnostic. Its layout and interaction conventions (left tools palette with tiles, context-sensitive right properties panel, row layouts, selection toolbar, collapsible properties) are *inspired by* Unlayer; Mailcraft is **not affiliated with Unlayer** and shares no code, assets or branding with it.

- 🧱 Rows → columns → blocks model (text, heading, image, button, divider, spacer, custom HTML)
- 🖱️ Drag & drop from the palette, reorder blocks and rows, click-to-add
- ✍️ Inline rich-text editing (bold / italic / underline / link / lists)
- 📱 Desktop / mobile preview, undo / redo (Ctrl+Z / Ctrl+Shift+Z)
- 🎨 Themeable editor chrome (CSS variables, light / dark presets) and 🌐 i18n (English and Japanese built in, bring your own)
- 📤 Exports **email-safe HTML** (tables, inline styles, responsive stacking, preheader, bulletproof buttons) and a portable **design JSON**
- 🔒 Escapes text, allow-lists URL schemes, sanitizes rich text
- 📦 Zero runtime dependencies (~16 KB gzip JS + ~3 KB CSS)

> Status: early (v0.1). The design JSON schema may still change.

## Quick start

```bash
npm install
npm run dev        # demo at http://localhost:5173
npm test
npm run build:lib  # library bundle in dist/
```

Optional real-pointer drag & drop E2E (not part of `npm test`): `npm run build && npx vite preview --outDir dist-demo --port 4173`, then in another shell `npm i --no-save playwright-core && npx playwright-core install chromium firefox && BROWSER=chromium node tests/e2e/dnd-real.mjs` (`BASE_URL`, `BROWSER=firefox`, `SAFARI_SIM=1` supported).

## Install

Mailcraft is not published to npm. Install it straight from GitHub (the `dist/` bundle is built automatically by the `prepare` script during install; Node 18+ and git required):

```sh
npm install github:kaaaaakun/mailcraft
```

## Usage

```ts
import { createEditor } from 'mailcraft';
import type { EditorOptions, Design } from 'mailcraft';
import 'mailcraft/style.css';   // required: editor styles (same file as mailcraft/dist/mailcraft.css)

const editor = createEditor(document.getElementById('editor')!, {
  design: savedDesignJson,                 // optional: restore a saved design
  onChange: (design) => save(design),      // called on every change
  imageUploader: async (file) => upload(file), // optional: return a hosted URL (default: base64)
  theme: { accent: '#7c3aed' },            // optional: editor chrome theme (see Theming)
  locale: 'ja',                            // optional: UI language (default: navigator.language)
  messages: { ja: { blockText: '本文' } }, // optional: override / add dictionaries
});

editor.exportHtml({ title: 'Welcome' }); // -> email HTML string
editor.getDesign();                       // -> design JSON
editor.loadDesign(json);
editor.undo(); editor.redo(); editor.destroy();
editor.setTheme({ mode: 'dark' });        // merge a partial theme, applied live
editor.setLocale('ja');                   // switch language, re-renders the UI
```

### API

```ts
createEditor(container: HTMLElement, options?: EditorOptions): EditorInstance

interface EditorOptions {
  design?: Design;
  onChange?: (design: Design) => void;
  imageUploader?: (file: File) => Promise<string>;
  theme?: Partial<MailcraftTheme>;
  locale?: string;
  messages?: Record<string, Partial<Messages>>;
  layout?: MailcraftLayoutInput;                 // see Layout
  onLayoutChange?: (mode: 'wide' | 'compact' | 'stacked') => void;
}

interface EditorInstance {
  getDesign(): Design;
  loadDesign(design: Design): void;
  exportHtml(opts?: { title?: string }): string;
  undo(): void; redo(): void;
  setTheme(theme: Partial<MailcraftTheme>): void;
  getTheme(): ResolvedTheme;                      // resolved theme incl. derived `vars`, `palette`, `warnings`
  getBrandPalette(): BrandPalette;                // resolved brand colors + derived tints (experimental)
  setLocale(locale: string): void;
  getLocale(): string;
  setLayout(layout: MailcraftLayoutInput): void;  // merge a partial layout, applied live
  getLayout(): MailcraftLayout;
  getResolvedLayout(): 'wide' | 'compact' | 'stacked';
  destroy(): void;
}
```

Also exported: `defaultTheme`, `darkTheme`, `defaultLayout`, `locales`, `createI18n`, `renderHtml`, `createDesign`, `createSampleDesign(locale?)`, `createBlock`, `createRow`, and the types `MailcraftTheme`, `MailcraftLayout`, `MailcraftLayoutInput`, `Messages`, `MessageKey`, `Design` & co.

## Layout

The three panes adapt to the width of the **editor's own container** (observed with `ResizeObserver`), not the browser window, so an editor embedded in a narrow column of a wide page still switches correctly.

| Resolved (`data-layout`) | Container width (default) | Arrangement |
|---|---|---|
| `wide` | >= 1100px | palette (264px) / canvas / properties (320px) |
| `compact` | 820-1100px | palette becomes a 92px icon rail (drag and click still work), slimmer properties panel |
| `stacked` | < 820px | palette strip on top, canvas, properties below; the area scrolls |

```ts
const editor = createEditor(el, {
  layout: {
    mode: 'auto',                                   // 'auto' (default) | 'split' | 'compact' | 'stacked'
    breakpoints: { compact: 1100, stacked: 820 },   // container px, used by 'auto'
    sidebars: { left: true, right: true },          // false hides a pane
    leftWidth: 264,                                 // px, wide layout only; clamped to 160-480
    rightWidth: 320,                                // px; clamped to 240-560 (compact caps at 288)
  },
  onLayoutChange: (mode) => console.log(mode),      // 'wide' | 'compact' | 'stacked'
});
editor.setLayout({ mode: 'stacked' });              // partials accumulate, like setTheme
editor.getLayout();                                 // full MailcraftLayout (a copy)
editor.getResolvedLayout();                         // what is in effect right now
```

- `split` forces the wide 3-pane layout; `compact` and `stacked` force those layouts regardless of width.
- Invalid values are ignored (never thrown), e.g. an unknown `mode`, non-numeric widths, or `compact < stacked` breakpoints.
- `sidebars.left: false` hides the palette. Click-to-add and drag-from-palette are then **not available**; the host has to provide its own way to add content (or load designs). `sidebars.right: false` hides the properties panel.
- The resolved arrangement is exposed as `data-layout="wide|compact|stacked"` on `.mc-root`, so host CSS can react to it. Layout changes never re-render the canvas or lose the selection.
- Without `ResizeObserver` (old browsers, jsdom) the editor falls back to re-measuring on window `resize`, and to `wide` when the width is unknown.
- The demo accepts `?layout=auto|split|compact|stacked`, `?left=0`, `?right=0` and `?width=<px>` (simulates a narrow container).

## Theming

The editor chrome (top bar, panels, tiles, selection outlines) is styled through CSS custom properties on the editor root (`--mc-accent`, `--mc-bg`, `--mc-panel`, `--mc-border`, `--mc-text`, `--mc-muted`, `--mc-radius`, `--mc-font`, ...). Pass a partial `theme`; it is merged over the light preset, or over the dark preset when `mode: 'dark'`.

```ts
import { createEditor, darkTheme } from 'mailcraft';

const editor = createEditor(el, { theme: { accent: '#e11d48', radius: 12 } });
editor.setTheme({ mode: 'dark' });            // switch to the dark palette, keeps your accent
editor.setTheme({ ...darkTheme, accent: '#22c55e' });
```

| Field | Meaning |
|---|---|
| `mode` | `'light'` or `'dark'` preset the other fields start from |
| `accent`, `accentContrast` | primary color and the text color on top of it; hover/selection/focus colors are derived from `accent` |
| `accentSoft` | optional soft tint; derived from `accent` and `panel` when omitted |
| `background`, `panel`, `border`, `text`, `muted` | surfaces and text |
| `radius` (px), `fontFamily` | shape and typography |

`setTheme` accumulates: values you set earlier stay until you overwrite them. You can also override the `--mc-*` variables from your own CSS.

### Brand colors (experimental)

> **Experimental.** The theme API is still being discussed (issue #4). `theme.brand` is small and additive; names and derivation details may change before 1.0.

Pass up to three brand colors, by importance. Everything else (hover/active/focus, soft backgrounds, text-on-color, the neutral surface scale, dark mode) is derived.

```ts
const editor = createEditor(el, {
  theme: { brand: { primary: '#4f46e5', secondary: '#0ea5e9', normal: '#475467' } },
});
editor.setTheme({ brand: { primary: '#059669' } }); // partial and accumulating, like every other key
editor.setTheme({ mode: 'dark' });                  // the same three colors are re-derived for dark
editor.getBrandPalette();                           // { primary, secondary, normal, tints: {...}, warnings }
editor.getTheme().warnings;                         // contrast problems, never thrown
```

| Brand color | Drives |
|---|---|
| `primary` | selection outline of blocks, focus rings, primary buttons and active toggles, active tabs, drop indicator, text on it (`accentContrast`, white or black, WCAG AA) |
| `secondary` | row-level chrome and selection (so rows read differently from blocks), badges/tags, icon highlights on tiles, hover tints of tiles, `--mc-secondary-*` |
| `normal` | text, muted text, borders, workspace background, panels and inputs, as a tinted neutral scale (hue of `normal`, low chroma) for light and dark |

- `secondary` defaults to `primary`; `normal` defaults to the built-in neutral preset.
- Derived per color: `soft` (tint mixed into the panel), `line` (translucent), `hover`, `active`, `ink` (readable as text/icon on `soft`), `contrast` (white/black on top of it). Also `--mc-focus-ring` and `--mc-disabled-bg/-text`. They are CSS variables on the editor root (`--mc-accent-hover`, `--mc-secondary-soft`, ...) and are listed in `getTheme().vars`.
- Dark mode keeps hue and chroma, re-maps lightness, and lifts `primary`/`secondary` until they reach 4.5:1 on the dark panel. In light mode your color is used as given; if it is hard to see on the panel (< 3:1) or the text on it cannot reach 4.5:1, `getTheme().warnings` says so.
- **Precedence:** explicit keys (`background`, `panel`, `border`, `text`, `muted`, `accentContrast`, `accentSoft`) > brand-derived values > the light/dark preset.
- **`accent` stays as an alias of `brand.primary`**: whichever you set last wins. Without any `brand` colors `accent` is used verbatim in both modes (as before), but its `accentContrast` is computed (AA) when you do not pass one. Once a `brand` color is set, `accent` is adapted to the mode like `brand.primary`.
- **Accepted formats** for `accent` and `brand.*`: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (alpha is ignored), `rgb()/rgba()`, `hsl()/hsla()` (comma or space syntax) and basic color names (`red`, `navy`, `coral`, ...). Anything else (`var(--x)`, `color-mix()`, typos) is **ignored and the previous value is kept**; nothing throws. The other keys (`background`, `panel`, ...) are passed through as CSS and may still be any CSS color.

Pure helpers are exported for hosts and tests: `deriveTheme(input)`, `mergeThemeInput(prev, patch)`, `checkContrast(fg, bg)` (WCAG ratio plus `aa`/`aaLarge`/`aaa` flags), `parseColor`, `normalizeColor`.

The demo has a **Brand** popover (presets Indigo / Green / Coral / Mono, three pickers, contrast warnings) and accepts `?primary=%234f46e5&secondary=%230ea5e9&normal=%23475467` (`?accent=` is an alias of `primary`; invalid values are ignored).

> The theme styles the **editor UI only**. Colors of the email itself (backgrounds, text, buttons) live in the design JSON and are never affected, so dark mode does not change the exported email.

## Internationalization

English (`en`) and Japanese (`ja`) are built in. The locale is `options.locale`, or detected from `navigator.language`, falling back to `en`. Regional codes (`ja-JP`) resolve to their base language. Any key a dictionary lacks falls back to English, and an unknown key never throws.

```ts
import { createEditor, locales } from 'mailcraft';
import type { Messages } from 'mailcraft';

const fr: Partial<Messages> = { undo: 'Annuler', redo: 'Rétablir', blockText: 'Texte' };
const editor = createEditor(el, {
  locale: 'fr',
  messages: { fr, en: { preview: 'Look' } },   // add a language and/or override built-in strings
});
editor.setLocale('ja');
Object.keys(locales);                           // ['en', 'ja']
```

Dictionaries cover toolbar titles, palette and tab labels, panel sections and fields, empty states, prompts and the default texts of newly created blocks. Use `createSampleDesign('ja')` for Japanese sample copy. The content you write inside emails is never translated.

The editor's container needs an explicit height (e.g. `style="height: 100vh"`).
The editor needs a DOM (browser, or jsdom in tests). Both ESM (`import`) and CommonJS (`require`) entry points are provided, with TypeScript types.

### Server side (Node, no DOM needed)

```js
import { renderHtml, createSampleDesign } from 'mailcraft';   // or: const { renderHtml } = require('mailcraft');
const html = renderHtml(designJson);                          // or renderHtml(createSampleDesign())
```

### Plain `<script>` tag (UMD)

Copy `node_modules/mailcraft/dist/mailcraft.umd.cjs` and `mailcraft.css` to your static assets (rename the script to `.js` if your server does not serve `.cjs` as JavaScript):

```html
<link rel="stylesheet" href="mailcraft.css">
<div id="editor" style="height: 100vh"></div>
<script src="mailcraft.umd.js"></script>
<script>
  const editor = Mailcraft.createEditor(document.getElementById('editor'));
</script>
```

## Security notes

- Text, attributes and URLs are escaped / allow-listed by the renderer; `javascript:` URLs are dropped.
- The **Custom HTML** block is rendered verbatim in the exported email. Only expose it to trusted authors.
- Rich-text sanitization runs in the browser editor. If you accept design JSON from untrusted sources, sanitize `text` block HTML server-side before sending.

## Email client compatibility

Output is table-based with inline styles and a small `@media` block for mobile stacking. Image `width` uses percentages, which Outlook (Word engine) may ignore. Always test in your target clients.

## Roadmap

- More built-in languages
- Templates gallery & merge-tag picker
- Social / menu / video blocks
- Per-block mobile visibility
- Outlook VML buttons
- React / Vue wrappers

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

## License

Mailcraft is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) (`PolyForm-Noncommercial-1.0.0`). It is source-available, not open source in the OSI sense.

- Noncommercial use is free. The license says: "Any noncommercial purpose is a permitted purpose." It also lists personal use (research, experiment, and testing for the benefit of public knowledge, personal study, private entertainment, hobby projects, amateur pursuits, or religious observance, without any anticipated commercial application) and use by any charitable organization, educational institution, public research organization, public safety or health organization, environmental protection organization, or government institution. See the license text for the exact terms.
- Commercial use requires a separate commercial license. Please open an issue at https://github.com/kaaaaakun/mailcraft/issues to get in touch.
- Earlier versions were released under MIT; see [LICENSE-HISTORY.md](LICENSE-HISTORY.md).

This is not legal advice; the text of the license governs.
