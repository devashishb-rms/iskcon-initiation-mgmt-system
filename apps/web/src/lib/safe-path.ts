/** An in-app link from the server (notification link): only same-origin absolute paths are followed. */
export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link) return null;
  if (!link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  try {
    const u = new URL(link, 'http://local.invalid');
    if (u.origin !== 'http://local.invalid') return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * Where a notification link goes. The API links a file as `/applications/<id>`; the file lives at
 * `/candidates/<id>` in this app. Anything that is not an in-app path is dropped.
 */
export function notificationHref(link: string | null | undefined): string | null {
  const safe = safeInternalPath(link);
  if (!safe) return null;
  return safe.replace(/^\/applications\/([0-9A-Za-z-]+)/, '/candidates/$1');
}
