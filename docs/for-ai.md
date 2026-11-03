# Mailcraft design JSON for AI / LLM authors

This page tells an LLM (or a human scripting against Mailcraft) how to generate a **valid design JSON**.
The machine-readable version is `designJsonSchema` (JSON Schema draft 2020-12), exported from the package.
Everything below matches the implemented schema (`src/core/schema.ts`, `src/core/validate.ts`).

## Shape

```
Design   = { version: 1, body: Body, rows: Row[] }
Row      = { id, ratios: number[], columns: Column[], backgroundColor, padding, stackOnMobile }
Column   = { id, blocks: Block[] }
Block    = text | heading | image | button | divider | spacer | html     (discriminated by "type")
```

Only `rows` is required. Everything else is optional and defaulted by `normalizeDesign`, but generating the full
shape is recommended. `columns.length` must equal `ratios.length` (1 to 12 columns, ratio 0.1 to 100 each;
`[1,2]` means 33% / 67%). `id` values are optional (generated when missing), must match `^[A-Za-z0-9_:.-]{1,64}$`
and be unique in the design.

### Body (`design.body`)

| field | type | range / default |
| --- | --- | --- |
| `backgroundColor` | color | `#f3f4f6` |
| `contentBackgroundColor` | color | `#ffffff` |
| `contentWidth` | integer | 200 to 1000, default 600 (use 600) |
| `fontFamily` | string | letters, digits, spaces, commas, quotes, dashes, dots only (max 200 chars). Default is a system sans-serif stack. No `; { } ( ) : / \ < >` |
| `preheader` | string | plain text (escaped); the inbox preview line |

### Row

| field | type | notes |
| --- | --- | --- |
| `ratios` | number[] | 1 to 12 items, each 0.1 to 100 |
| `columns` | Column[] | same length as `ratios` |
| `backgroundColor` | color or `""` | `""` = transparent |
| `padding` | `{top,right,bottom,left}` | integers 0 to 200 |
| `stackOnMobile` | boolean | default true |

### Blocks

All blocks accept `id` and `padding` (`{top,right,bottom,left}`, integers 0 to 200). `align` is `"left" | "center" | "right"`.

| `type` | fields (range) |
| --- | --- |
| `text` | `html` (rich text, sanitized), `color`, `fontSize` 6-120, `lineHeight` 0.8-4 (decimal), `align` |
| `heading` | `text` (plain text), `level` 1-3, `color`, `fontSize` 6-120, `align` |
| `image` | `src`, `alt`, `href` (optional link), `widthPercent` 1-100, `align` |
| `button` | `text`, `href`, `backgroundColor`, `color`, `borderRadius` 0-100, `fontSize` 6-120, `innerPaddingY` 0-100, `innerPaddingX` 0-200, `align` |
| `divider` | `color`, `thickness` 1-50 |
| `spacer` | `height` 0-600 |
| `html` | `html` (custom markup; sanitized by default, see below) |

**Colors** must be `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()/hsl()/hsla()`, `transparent`, or a basic
CSS color name (black, white, red, green, blue, gray, ...). Anything else (including `var()`, `url()`, or text with `;`)
is replaced by the default.

**URLs** (`href`, `image.src`): `https://`, `http://`, `mailto:`, `tel:`, `#anchor`, root-relative `/path`, or a
`{{merge_tag}}`. `image.src` may also be a base64 `data:image/png|jpeg|gif|webp`. `javascript:`, `data:text/html`,
SVG data URLs etc. are dropped.

### Rich text (`text.html`) allowlist

Tags: `p br b strong i em u s strike del ins sub sup small a ul ol li span div h1-h6 blockquote img hr pre code font mark`.
Attributes: `style` (limited properties: colors, font, size, spacing, alignment, width/height, border, display), `title`, `lang`, `dir`,
`align`; `a[href,target]`, `img[src,alt,width,height]`, `ol[start,type]`, `font[color,size,face]`.
Everything else is removed (unknown tags are unwrapped, script/style/svg/iframe/... are dropped with their content).
The `html` block additionally keeps table layout markup (`table thead tbody tfoot tr td th caption colgroup col center section ...`
with `width height valign bgcolor cellpadding cellspacing border colspan rowspan role="presentation"`).

## Minimal valid example

```json
{
  "version": 1,
  "body": { "backgroundColor": "#f3f4f6", "contentBackgroundColor": "#ffffff", "contentWidth": 600, "fontFamily": "Arial, Helvetica, sans-serif", "preheader": "Our spring sale starts today" },
  "rows": [
    {
      "id": "row_hero",
      "ratios": [1],
      "columns": [
        {
          "id": "col_hero",
          "blocks": [
            { "id": "b1", "type": "heading", "text": "Spring sale", "level": 1, "color": "#111111", "fontSize": 32, "align": "center", "padding": { "top": 24, "right": 20, "bottom": 8, "left": 20 } },
            { "id": "b2", "type": "text", "html": "<p style=\"margin:0\">Up to <b>30% off</b> this week only.</p>", "color": "#333333", "fontSize": 16, "lineHeight": 1.6, "align": "center", "padding": { "top": 0, "right": 20, "bottom": 16, "left": 20 } },
            { "id": "b3", "type": "button", "text": "Shop now", "href": "https://example.com/sale", "backgroundColor": "#2f6fed", "color": "#ffffff", "borderRadius": 6, "fontSize": 16, "innerPaddingY": 12, "innerPaddingX": 28, "align": "center", "padding": { "top": 8, "right": 20, "bottom": 24, "left": 20 } }
          ]
        }
      ],
      "backgroundColor": "",
      "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
      "stackOnMobile": true
    }
  ]
}
```

## Two-column example

```json
{
  "version": 1,
  "rows": [
    {
      "ratios": [1, 2],
      "columns": [
        { "blocks": [ { "type": "image", "src": "https://example.com/product.png", "alt": "Product", "widthPercent": 100, "align": "center" } ] },
        { "blocks": [
          { "type": "heading", "text": "The Maple chair", "level": 2 },
          { "type": "text", "html": "<p style=\"margin:0\">Solid oak, built to last.</p>" },
          { "type": "spacer", "height": 12 },
          { "type": "button", "text": "Details", "href": "https://example.com/chair" }
        ] }
      ]
    },
    { "ratios": [1], "columns": [ { "blocks": [ { "type": "divider", "color": "#e5e7eb", "thickness": 1 } ] } ] }
  ]
}
```

## Email-client guidance (what to avoid)

- Use 600 px width, a web-safe font stack, and inline styles only; keep text colors with enough contrast.
- Do not rely on `<style>` blocks, CSS variables, flex/grid, `position`, `float`, web fonts, JavaScript, forms, video or SVG (all are stripped or unsupported in many clients).
- Prefer solid colors; gradients and background images are not generated. Outlook (Word engine) may ignore percentage image widths and `border-radius`.
- Always give images `alt` text and a hosted `https://` URL; avoid large base64 images (Gmail clips messages over about 102 KB).
- Keep one primary call-to-action button; use a `spacer`/padding for vertical rhythm instead of empty paragraphs.
- Put the unsubscribe link in a footer `text` block (`<a href="{{unsubscribe_url}}">`).
- Use `html` blocks sparingly; prefer built-in blocks.

## Safety guarantees (what you do not have to worry about)

The renderer never emits a field from the JSON without validation or escaping:

- Numbers are coerced to finite numbers and clamped to the ranges above; enums (`align`, `level`) are allow-listed.
- Colors and `fontFamily` are validated against the patterns above, else replaced by defaults.
- Text, `alt`, `title`, `preheader` are HTML-escaped; URLs are scheme-allow-listed.
- `text.html` and the `html` block go through a DOM-free allowlist sanitizer (unless the host passes `trustedHtml: true`).
- Unknown block types are skipped; broken structure (no `body`, `rows` not an array, mismatched ratios) is repaired, never thrown.

These guarantees concern output safety, not correctness: a design can be valid and still look bad. Validate then iterate.

## Validating from code

```ts
import { validateDesign, normalizeDesign, renderHtml, designJsonSchema } from 'mailcraft';

const { ok, errors, design } = validateDesign(JSON.parse(llmOutput));
// errors: [{ path: 'rows[0].columns[0].blocks[1].type', message: 'unknown block type "video"; skipped' }, ...]
// design: the normalized design (always present), usable even when ok === false

const html = renderHtml(normalizeDesign(untrusted));   // renderHtml normalizes internally too
// Host trusts every author and needs raw custom HTML: renderHtml(design, { trustedHtml: true })
```

`ok` is `true` only when nothing had to be fixed. Feed `errors` back to the model to self-correct, or just use
`design`. `designJsonSchema` can be given to any structured-output / JSON-schema validator.
