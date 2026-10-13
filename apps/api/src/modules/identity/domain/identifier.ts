export type Identifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

/**
 * Turns what a person typed into a stable form. Phone numbers are stored as +<country><number>;
 * a bare 10-digit number is taken as an Indian mobile.
 */
export function normalizeIdentifier(raw: string): Identifier | null {
  const input = raw.trim();
  if (input.includes('@')) {
    const email = input.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: 'email', value: email } : null;
  }
  const normalised = normalizePhone(input);
  return normalised ? { kind: 'phone', value: normalised } : null;
}

export function normalizePhone(raw: string): string | null {
  const hasPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!hasPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
    else if (digits.length === 10) digits = `91${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}
