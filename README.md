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
  getTheme(): MailcraftTheme;
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

Design JSON is treated as **untrusted input** by the renderer. What happens to each part (all of it runs without a DOM, so it works the same in the browser, Node and workers):

- **Every field is validated before it reaches the output.** Numbers (font sizes, paddings, `widthPercent`, `contentWidth`, ratios, ...) are coerced to finite numbers and clamped; `align` and `level` are allow-listed (`level` is 1 to 3); colors must be hex / `rgb()` / `rgba()` / `hsl()` / `hsla()` / a basic color name / `transparent`; `body.fontFamily` must be a plain font stack (letters, numbers, spaces, commas, quotes, dashes, dots). Invalid values fall back to the defaults instead of being emitted.
- **Plain-text fields are HTML-escaped** (`heading.text`, `button.text`, `image.alt`, `body.preheader`, the `title` option). **URLs** (`href`, `image.src`) are scheme-allow-listed (`http(s)`, `mailto`, `tel`, `#`, `/path`, `{{merge_tag}}`; images may also be base64 png/jpeg/gif/webp); `javascript:`, `data:text/html`, SVG data URLs, entity- or whitespace-obfuscated schemes are dropped.
- **Rich text (`text` blocks) is always sanitized** with a tag / attribute / CSS-property allow-list, both in the exported HTML and on the editor canvas (same implementation: `sanitizeHtml`). Script, style, svg, math, iframe, forms, event handlers and unsafe URLs are removed.
- **The Custom HTML (`html`) block is sanitized by default** with a more permissive allow-list that keeps table / layout markup and safe inline styles. The one exception: `renderHtml(design, { trustedHtml: true })` (and `editor.exportHtml({ trustedHtml: true })`) emits the `html` block **verbatim**. Use it only when every person who can author designs is trusted; never for designs from end users or from an LLM. The editor canvas always shows the sanitized version.
- **Structure is repaired, not trusted.** `renderHtml` and `createEditor({ design })` / `editor.loadDesign()` run the input through `normalizeDesign()` (fills defaults, drops unknown block types, makes `columns.length === ratios.length`, de-duplicates ids, never throws). It is one O(size) pass that allocates a copy; for very large designs you can normalize once and reuse the result.
- **Server-side usage** (e.g. a design JSON received from an API or generated by an LLM):

```ts
import { validateDesign, renderHtml } from 'mailcraft';

const { ok, errors, design } = validateDesign(JSON.parse(body)); // never throws
// errors: [{ path: 'rows[0].columns[0].blocks[1].type', message: '...' }]  (report them, or ignore)
const html = renderHtml(design!);                                   // default: html blocks sanitized
```

What this does **not** do: it does not check that merge tags resolve, that remote images exist or are not tracking pixels, or that the email is accepted by your ESP; and `trustedHtml: true` removes the HTML-block guarantee entirely. The sanitizer is an allow-list tokenizer, not a full HTML parser; it re-serializes only what it understands, so output is balanced by construction.

`designJsonSchema` (JSON Schema draft 2020-12) and [docs/for-ai.md](docs/for-ai.md) describe the format for tools and LLMs.

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
