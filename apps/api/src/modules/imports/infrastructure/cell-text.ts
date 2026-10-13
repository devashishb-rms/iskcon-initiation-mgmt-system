const MAX_CELL_CHARS = 2000;

/** Cleans what a person typed: composed Unicode (Bengali and Hindi), no control characters, trimmed. */
export function cleanCell(value: string): string {
  return (
    value
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CELL_CHARS)
  );
}
