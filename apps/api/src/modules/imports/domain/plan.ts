import type { ImportField } from './columns';
import { findRepeatsInFile } from './duplicates';
import { DUPLICATE_CODES, ROW_WARNINGS, type RowMessage } from './messages';
import { resolveGuru, resolveMentor, type GuruRef, type MentorRef } from './references';
import { checkRow, isError, type RawRow, type RowCheckEnv } from './row-validation';
import type { RowStatus, StoredRow } from './stored-row';

/** What the plan needs to know about the temple. */
export interface PlanReference {
  mentors: readonly MentorRef[];
  gurus: readonly GuruRef[];
  /** E-mail addresses and phone numbers (stored form) of people who already exist. */
  existingEmails: ReadonlySet<string>;
  existingPhones: ReadonlySet<string>;
}

export interface PlanInput {
  line: number;
  raw: RawRow;
}

/** A planned row, plus what the person reading the preview sees of it. */
export interface PlannedRow extends StoredRow {
  echo: Partial<Record<ImportField, string>>;
}

/**
 * Decides, row by row, what the commit would do: the contract's checks, mentor and guru lookup,
 * then repeats (against people who already exist, and against earlier rows of the same file).
 * Pure: the same input always gives the same plan, and nothing is written.
 */
export function planRows(inputs: readonly PlanInput[], ref: PlanReference, env: RowCheckEnv): PlannedRow[] {
  const checked = inputs.map(({ line, raw }) => {
    const check = checkRow(raw, env);
    const messages: RowMessage[] = [...check.messages];
    let mentorId: string | undefined;
    let guruId: string | undefined;
    if (raw.mentorName) {
      const found = resolveMentor(raw.mentorName, ref.mentors);
      if ('error' in found) messages.push(found.error);
      else mentorId = found.id;
    }
    if (raw.guruName) {
      const found = resolveGuru(raw.guruName, ref.gurus);
      if ('error' in found) messages.push(found.error);
      else guruId = found.id;
    }
    const valid = check.data && !messages.some(isError);
    return { line, raw, messages, mentorId, guruId, data: valid ? check.data : undefined };
  });

  const repeats = findRepeatsInFile(
    checked.flatMap((c) =>
      c.data ? [{ line: c.line, name: c.data.name, phone: c.data.phone, email: c.data.email, groupName: c.data.groupName }] : [],
    ),
  );

  return checked.map((c): PlannedRow => {
    const messages = c.messages;
    const existing = c.data && (c.data.email && ref.existingEmails.has(c.data.email) ? 'email' : c.data.phone && ref.existingPhones.has(c.data.phone) ? 'phone' : null);
    const repeat = c.data ? repeats.get(c.line) : undefined;
    if (existing) messages.push({ code: ROW_WARNINGS.duplicateExisting, params: { field: existing } });
    else if (repeat) messages.push({ code: ROW_WARNINGS.duplicateInFile, params: { field: repeat.field, line: repeat.ofLine } });

    const hasError = messages.some(isError);
    const status: RowStatus = hasError ? 'ERROR' : messages.length ? 'WARNING' : 'OK';
    const skip = hasError || messages.some((m) => DUPLICATE_CODES.includes(m.code));
    return {
      line: c.line,
      status,
      plan: skip ? 'SKIP' : 'CREATE',
      messages,
      data: !hasError && c.data ? { ...c.data, mentorId: c.mentorId, guruId: c.guruId } : undefined,
      echo: c.data ? echoOf(c.data) : c.raw,
    };
  });
}

function echoOf(data: NonNullable<ReturnType<typeof checkRow>['data']>): Partial<Record<ImportField, string>> {
  const entries = Object.entries({
    name: data.name,
    phone: data.phone,
    email: data.email,
    groupName: data.groupName,
    mentorName: data.mentorName,
    guruName: data.guruName,
    track: data.track,
    shelterDate: data.shelterDate,
    practiceSince: data.practiceSince,
  }).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries) as Partial<Record<ImportField, string>>;
}
