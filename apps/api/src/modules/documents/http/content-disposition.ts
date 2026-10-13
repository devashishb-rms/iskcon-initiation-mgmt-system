/**
 * `Content-Disposition` for a download with a name that may not be ASCII (a Bengali file name).
 * RFC 6266: an ASCII `filename` for old clients plus `filename*` in UTF-8 for everyone else.
 */
export function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%;]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
