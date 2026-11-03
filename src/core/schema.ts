/**
 * JSON Schema (draft 2020-12) for the design JSON. Ranges come from the same `LIMITS` the normalizer uses.
 * The schema describes what is accepted WITHOUT any correction; `normalizeDesign` is more lenient (it fixes
 * numeric strings, missing fields, out-of-range numbers, ...).
 */
import { COLOR_PATTERN } from './safe.js';
import { ALIGNS, LIMITS } from './validate.js';

const range = (r: readonly [number, number], integer = true) => ({ type: integer ? 'integer' : 'number', minimum: r[0], maximum: r[1] });
const color = { type: 'string', pattern: COLOR_PATTERN, description: 'Hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba()/hsl()/hsla() or a basic color name.' };
const align = { enum: [...ALIGNS] };
const padding = {
  type: 'object',
  properties: { top: range(LIMITS.padding), right: range(LIMITS.padding), bottom: range(LIMITS.padding), left: range(LIMITS.padding) },
};
const blockBase = { id: { type: 'string', pattern: '^[A-Za-z0-9_:.-]{1,64}$', description: 'Unique within the design; generated when missing.' }, padding };
const block = (type: string, props: Record<string, unknown>, description: string) => ({
  type: 'object',
  description,
  required: ['type'],
  properties: { type: { const: type }, ...blockBase, ...props },
});

export const designJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/kaaaaakun/mailcraft/design.schema.json',
  title: 'Mailcraft design',
  type: 'object',
  required: ['rows'],
  properties: {
    version: { const: 1 },
    body: { $ref: '#/$defs/body' },
    rows: { type: 'array', items: { $ref: '#/$defs/row' } },
  },
  $defs: {
    body: {
      type: 'object',
      properties: {
        backgroundColor: color,
        contentBackgroundColor: color,
        contentWidth: range(LIMITS.contentWidth),
        fontFamily: { type: 'string', minLength: 1, maxLength: 200, pattern: "^[^;{}()\\\\<>&:/@!*=\\[\\]`|^~$%#+?\\u0000-\\u001f\\u007f-\\u009f]+$", description: 'Font stack: letters, digits, spaces, commas, quotes, dashes, dots only.' },
        preheader: { type: 'string' },
      },
    },
    row: {
      type: 'object',
      description: 'A horizontal band with 1-12 columns. columns.length must equal ratios.length.',
      properties: {
        id: blockBase.id,
        ratios: { type: 'array', minItems: LIMITS.columns[0], maxItems: LIMITS.columns[1], items: range(LIMITS.ratio, false) },
        columns: { type: 'array', minItems: LIMITS.columns[0], maxItems: LIMITS.columns[1], items: { $ref: '#/$defs/column' } },
        backgroundColor: { type: 'string', pattern: `^$|${COLOR_PATTERN}`, description: "'' means transparent." },
        padding,
        stackOnMobile: { type: 'boolean' },
      },
    },
    column: {
      type: 'object',
      properties: { id: blockBase.id, blocks: { type: 'array', items: { $ref: '#/$defs/block' } } },
    },
    block: {
      oneOf: [
        block('text', { html: { type: 'string', description: 'Rich-text HTML; sanitized on render (allow-list).' }, color, fontSize: range(LIMITS.fontSize), lineHeight: range(LIMITS.lineHeight, false), align }, 'Rich text paragraph(s).'),
        block('heading', { text: { type: 'string' }, level: range(LIMITS.level), color, fontSize: range(LIMITS.fontSize), align }, 'Plain-text heading (h1-h3).'),
        block('image', { src: { type: 'string' }, alt: { type: 'string' }, href: { type: 'string' }, widthPercent: range(LIMITS.widthPercent), align }, 'Image; src must be http(s), root-relative, a {{merge_tag}} or a base64 png/jpeg/gif/webp data URL.'),
        block('button', { text: { type: 'string' }, href: { type: 'string' }, backgroundColor: color, color, borderRadius: range(LIMITS.borderRadius), fontSize: range(LIMITS.fontSize), innerPaddingY: range(LIMITS.innerPaddingY), innerPaddingX: range(LIMITS.innerPaddingX), align }, 'Call-to-action button.'),
        block('divider', { color, thickness: range(LIMITS.thickness) }, 'Horizontal rule.'),
        block('spacer', { height: range(LIMITS.spacerHeight) }, 'Vertical space.'),
        block('html', { html: { type: 'string', description: 'Custom HTML; sanitized (tables and inline styles kept) unless renderHtml gets trustedHtml: true.' } }, 'Custom HTML block.'),
      ],
    },
  },
} as const;
