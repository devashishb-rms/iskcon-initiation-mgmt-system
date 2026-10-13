/**
 * Writes CSV that is safe to open in a spreadsheet. A cell that starts with = + - @ would be run
 * as a formula by Excel, so it is prefixed with an apostrophe (OWASP "CSV injection").
 */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined): string => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // A byte-order mark makes Excel read Bengali and Hindi names correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
