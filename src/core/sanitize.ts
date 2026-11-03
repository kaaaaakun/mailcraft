import { sanitizeHtml, type SanitizeProfile } from './sanitize-html.js';

/**
 * Rich-text sanitizer used by the editor canvas (contenteditable output). It is the same DOM-free allow-list
 * implementation the exporter uses (see `sanitize-html.ts`), so canvas and exported HTML agree.
 * Pass `'html'` to also keep table / layout markup (custom HTML block).
 */
export function sanitizeRichText(html: string, profile: SanitizeProfile = 'rich'): string {
  return sanitizeHtml(html, profile);
}
