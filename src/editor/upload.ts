/** Image upload validation shared by the properties panel and the OS file-drop path. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export type UploadErrorKey = 'uploadErrType' | 'uploadErrSize' | 'uploadErrFailed';
export type UploadResult = { ok: true; src: string } | { ok: false; error: UploadErrorKey; message: string };

/** `maxImageBytes` option -> a usable limit (finite and > 0, otherwise the 5 MB default). */
export const resolveMaxBytes = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_IMAGE_BYTES);

/** The MIME type to trust: the browser-reported one, or (when empty) one derived from the file extension. */
export function imageTypeOf(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t) return t;
  return EXT_TYPE[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
}

/** Returns the error key, or null when the file may be uploaded. */
export function validateImageFile(file: File, maxBytes: number): UploadErrorKey | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(imageTypeOf(file))) return 'uploadErrType';
  if (file.size > maxBytes) return 'uploadErrSize';
  return null;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Number((n / 1024 / 1024).toFixed(1))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
