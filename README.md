# 💌 Mailcraft

An open-source, embeddable **drag & drop email editor** — in the spirit of Unlayer / Beefree, but MIT-licensed, dependency-free and framework-agnostic.

- 🧱 Rows → columns → blocks model (text, heading, image, button, divider, spacer, custom HTML)
- 🖱️ Drag & drop from the palette, reorder blocks and rows, click-to-add
- ✍️ Inline rich-text editing (bold / italic / underline / link / lists)
- 📱 Desktop / mobile preview, undo / redo (Ctrl+Z / Ctrl+Shift+Z)
- 📤 Exports **email-safe HTML** (tables, inline styles, responsive stacking, preheader, bulletproof buttons) and a portable **design JSON**
- 🔒 Escapes text, allow-lists URL schemes, sanitizes rich text
- 📦 Zero runtime dependencies (~10 KB gzip)

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
});

editor.exportHtml({ title: 'Welcome' }); // -> email HTML string
editor.getDesign();                       // -> design JSON
editor.loadDesign(json);
editor.undo(); editor.redo(); editor.destroy();
```

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

- Templates gallery & merge-tag picker
- Social / menu / video blocks
- Per-block mobile visibility
- Outlook VML buttons
- React / Vue wrappers

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works. License: MIT.
