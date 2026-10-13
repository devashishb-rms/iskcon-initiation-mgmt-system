import { importRow, type ImportRow } from '@iskcon/contracts';
import type { ZodIssue } from 'zod';
import type { ImportField } from './columns';
import { ROW_ERRORS, ROW_WARNINGS, type RowMessage } from './messages';

export type RawRow = Partial<Record<ImportField, string>>;

/** The row after the contract's rules, with the phone in its stored form. */
export type ParsedRow = ImportRow;

export interface RowCheck {
  data?: ParsedRow;
  messages: RowMessage[];
}

export interface RowCheckEnv {
  /** Today's date (YYYY-MM-DD) in the temple's time zone. */
  today: string;
  /** The identity module's phone rule, passed in so this file stays free of other modules. */
  normalizePhone: (raw: string) => string | null;
}

const DATE_FIELDS: readonly ImportField[] = ['shelterDate', 'practiceSince'];
const TEXT_LIMITS: Partial<Record<ImportField, number>> = { name: 120, phone: 30, email: 160, groupName: 120, mentorName: 120, guruName: 120 };

/**
 * Spreadsheet programs write dates in the user's locale. Besides the contract's YYYY-MM-DD the
 * Indian day-first forms D/M/YYYY and D-M-YYYY are accepted. Returns the value unchanged when it
 * matches neither, so the contract's own check reports it.
 */
export function toIsoDate(value: string): string {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (!m) return value;
  const [, d, mo, y] = m as unknown as [string, string, string, string];
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** A cell a spreadsheet program would run as a formula. It stays plain text here; the person is told. */
export const looksLikeFormula = (value: string): boolean => /^[=@]/.test(value);

/** Checks one row against the contract and the rules a single row can be checked against. */
export function checkRow(raw: RawRow, env: RowCheckEnv): RowCheck {
  const messages: RowMessage[] = [];
  for (const field of Object.keys(raw) as ImportField[]) {
    if (looksLikeFormula(raw[field] ?? '')) messages.push({ code: ROW_WARNINGS.formulaLike, params: { field } });
  }

  const candidate: Record<string, string | undefined> = {};
  for (const field of Object.keys(raw) as ImportField[]) {
    const value = raw[field];
    if (value === undefined || value === '') continue;
    candidate[field] = DATE_FIELDS.includes(field) ? toIsoDate(value) : field === 'track' ? value.toUpperCase() : value;
  }

  const phoneRaw = candidate.phone;
  if (phoneRaw !== undefined) {
    const normalised = env.normalizePhone(phoneRaw);
    if (normalised) candidate.phone = normalised;
    else {
      delete candidate.phone;
      messages.push({ code: ROW_ERRORS.phoneInvalid });
    }
  }

  const parsed = importRow.safeParse(candidate);
  if (!parsed.success) {
    messages.push(...parsed.error.issues.map(toMessage));
    return { messages: dedupe(messages) };
  }

  const data = parsed.data;
  for (const field of DATE_FIELDS) {
    const value = data[field as 'shelterDate' | 'practiceSince'];
    if (value && value > env.today) messages.push({ code: ROW_ERRORS.dateFuture, params: { field } });
  }
  if (!data.phone && !data.email && !messages.some((m) => m.code === ROW_ERRORS.phoneInvalid)) {
    messages.push({ code: ROW_WARNINGS.noContact });
  }
  if (data.practiceSince) messages.push({ code: ROW_WARNINGS.practiceNotApplied });
  const blocked = messages.some((m) => isError(m));
  return { data: blocked ? undefined : data, messages: dedupe(messages) };
}

const ERROR_CODES = new Set<string>(Object.values(ROW_ERRORS));
export const isError = (m: RowMessage): boolean => ERROR_CODES.has(m.code);

function toMessage(issue: ZodIssue): RowMessage {
  const field = String(issue.path[0] ?? 'row');
  switch (issue.code) {
    case 'too_small':
      return field === 'name' ? { code: ROW_ERRORS.nameRequired } : { code: ROW_ERRORS.fieldInvalid, params: { field } };
    case 'too_big':
      return { code: ROW_ERRORS.tooLong, params: { field, max: Number(TEXT_LIMITS[field as ImportField] ?? issue.maximum) } };
    case 'invalid_string':
      if (field === 'email') return { code: ROW_ERRORS.emailInvalid };
      if (DATE_FIELDS.includes(field as ImportField)) return { code: ROW_ERRORS.dateInvalid, params: { field } };
      return { code: ROW_ERRORS.fieldInvalid, params: { field } };
    case 'invalid_enum_value':
      return { code: ROW_ERRORS.trackInvalid };
    case 'custom':
      return DATE_FIELDS.includes(field as ImportField) ? { code: ROW_ERRORS.dateInvalid, params: { field } } : { code: ROW_ERRORS.fieldInvalid, params: { field } };
    case 'invalid_type':
      return field === 'name' ? { code: ROW_ERRORS.nameRequired } : { code: ROW_ERRORS.fieldInvalid, params: { field } };
    default:
      return { code: ROW_ERRORS.fieldInvalid, params: { field } };
  }
}

function dedupe(messages: RowMessage[]): RowMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const key = `${m.code}|${JSON.stringify(m.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
