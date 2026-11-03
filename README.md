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

## Usage

```ts
import { createEditor } from 'mailcraft';
import 'mailcraft/dist/mailcraft.css';

const editor = createEditor(document.getElementById('editor')!, {
  design: savedDesignJson,                 // optional: restore a saved design
  onChange: (design) => save(design),      // called on every change
  imageUploader: async (file) => upload(file), // optional: return a hosted URL (default: base64)
});

editor.exportHtml({ title: 'Welcome' }); // → email HTML string
editor.getDesign();                       // → design JSON
editor.loadDesign(json);
editor.undo(); editor.redo(); editor.destroy();
```

Server side (Node, no DOM needed) you can render a saved design directly:

```ts
import { renderHtml } from 'mailcraft';
const html = renderHtml(designJson);
```

The editor's container needs a height (e.g. `height: 100vh`).

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
