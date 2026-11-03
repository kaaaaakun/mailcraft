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
  destroy(): void;
}
```

Also exported: `defaultTheme`, `darkTheme`, `locales`, `createI18n`, `renderHtml`, `createDesign`, `createSampleDesign(locale?)`, `createBlock`, `createRow`, and the types `MailcraftTheme`, `Messages`, `MessageKey`, `Design` & co.

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
