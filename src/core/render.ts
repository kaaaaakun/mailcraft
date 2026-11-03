import { esc, safeImgSrc, safeUrl } from './safe.js';
import { sanitizeHtml } from './sanitize-html.js';
import { newCtx, normalizeBlock, normalizeDesign } from './validate.js';
import type { Block, Design, Padding, Row } from './types.js';

export interface RenderOptions {
  title?: string;
  /**
   * Skip sanitization of the custom `html` block only (text blocks are always sanitized). Default false.
   * Enable it only when every design author is trusted: the block is then emitted verbatim.
   */
  trustedHtml?: boolean;
}


export { esc, safeUrl };

export const paddingCss = (p: Padding) => `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;

/**
 * Inner HTML of a block (without the surrounding padding cell). Shared by the exporter and the editor canvas.
 * Every field is coerced / validated first (see `normalizeBlock`), `text` HTML and the `html` block are sanitized.
 */
export function renderBlockContent(b: Block, opts: Pick<RenderOptions, 'trustedHtml'> = {}): string {
  const nb = normalizeBlock(b, newCtx());
  return nb ? renderNormalizedBlock(nb, !!opts.trustedHtml) : '';
}

function renderNormalizedBlock(b: Block, trustedHtml: boolean): string {
  switch (b.type) {
    case 'text':
      return `<div style="font-size:${b.fontSize}px;line-height:${b.lineHeight};color:${esc(b.color)};text-align:${b.align};">${sanitizeHtml(b.html, 'rich')}</div>`;
    case 'heading':
      return `<h${b.level} style="margin:0;font-size:${b.fontSize}px;line-height:1.3;font-weight:700;color:${esc(b.color)};text-align:${b.align};">${esc(b.text)}</h${b.level}>`;
    case 'image': {
      const src = safeImgSrc(b.src);
      if (!src) return '';
      const img = `<img src="${esc(src)}" alt="${esc(b.alt)}" width="${b.widthPercent}%" style="display:inline-block;width:${b.widthPercent}%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
      const href = safeUrl(b.href);
      return `<div style="text-align:${b.align};font-size:0;line-height:0;">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img}</div>`;
    }
    case 'button': {
      const margin = b.align === 'center' ? '0 auto' : b.align === 'right' ? '0 0 0 auto' : '0';
      return (
        `<table role="presentation" align="${b.align}" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};border-collapse:separate;"><tr>` +
        `<td align="center" bgcolor="${esc(b.backgroundColor)}" style="background-color:${esc(b.backgroundColor)};border-radius:${b.borderRadius}px;">` +
        `<a href="${esc(safeUrl(b.href) || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:${b.innerPaddingY}px ${b.innerPaddingX}px;font-size:${b.fontSize}px;font-weight:600;line-height:1.2;color:${esc(b.color)};text-decoration:none;border-radius:${b.borderRadius}px;">${esc(b.text)}</a>` +
        `</td></tr></table>`
      );
    }
    case 'divider':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:${b.thickness}px solid ${esc(b.color)};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    case 'spacer':
      return `<div style="height:${b.height}px;line-height:${b.height}px;font-size:0;">&nbsp;</div>`;
    case 'html':
      return trustedHtml ? b.html : sanitizeHtml(b.html, 'html');
  }
}

const pct = (n: number) => Math.round(n * 100) / 100;

function renderRow(row: Row, d: Design, trustedHtml: boolean): string {
  const total = row.ratios.reduce((a, b) => a + b, 0) || 1;
  const cols = row.columns
    .map((col, i) => {
      const w = pct((row.ratios[i] / total) * 100);
      const blocks = col.blocks
        .map((b) => `<tr><td style="padding:${paddingCss(b.padding)};font-family:${esc(d.body.fontFamily)};">${renderNormalizedBlock(b, trustedHtml)}</td></tr>`)
        .join('');
      const inner = blocks || `<tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr>`;
      return `<td class="${row.stackOnMobile ? 'mc-col' : ''}" width="${w}%" valign="top" style="width:${w}%;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td>`;
    })
    .join('');
  const bg = row.backgroundColor ? ` bgcolor="${esc(row.backgroundColor)}" style="background-color:${esc(row.backgroundColor)};padding:${paddingCss(row.padding)};"` : ` style="padding:${paddingCss(row.padding)};"`;
  return `<tr><td${bg}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table></td></tr>`;
}

/**
 * Design JSON → table-based, inline-styled, responsive email HTML.
 * The input is first run through `normalizeDesign` (never throws; one O(size) pass), so partial / hostile JSON is safe.
 */
export function renderHtml(input: Design, opts: RenderOptions = {}): string {
  const d = normalizeDesign(input);
  const trusted = !!opts.trustedHtml;
  const w = d.body.contentWidth;
  const pre = d.body.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(d.body.preheader)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(opts.title ?? '')}</title>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{-ms-interpolation-mode:bicubic;}
  @media (max-width:${w + 20}px){
    .mc-container{width:100% !important;}
    .mc-col{display:block !important;width:100% !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${esc(d.body.backgroundColor)};">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${esc(d.body.backgroundColor)}" style="background-color:${esc(d.body.backgroundColor)};"><tr><td align="center">
<table role="presentation" class="mc-container" width="${w}" cellpadding="0" cellspacing="0" border="0" bgcolor="${esc(d.body.contentBackgroundColor)}" style="width:${w}px;max-width:100%;background-color:${esc(d.body.contentBackgroundColor)};">
${d.rows.map((r) => renderRow(r, d, trusted)).join('\n')}
</table>
</td></tr></table>
</body>
</html>`;
}
