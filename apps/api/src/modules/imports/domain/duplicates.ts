import { nameKey } from './references';

export interface PersonKey {
  line: number;
  name: string;
  phone?: string;
  email?: string;
  groupName?: string;
}

export interface Duplicate {
  /** The earlier row it repeats. */
  ofLine: number;
  field: 'phone' | 'email' | 'name';
}

/**
 * Finds rows that repeat an earlier row of the same file. Two rows are the same person when they
 * share a phone number or an e-mail address; rows with neither are the same when name and group match.
 * The first row wins; later ones are the duplicates.
 */
export function findRepeatsInFile(rows: readonly PersonKey[]): Map<number, Duplicate> {
  const byPhone = new Map<string, number>();
  const byEmail = new Map<string, number>();
  const byName = new Map<string, number>();
  const repeats = new Map<number, Duplicate>();
  for (const row of rows) {
    const phone = row.phone && byPhone.get(row.phone);
    const email = row.email && byEmail.get(row.email);
    const contactless = !row.phone && !row.email;
    const name = contactless ? byName.get(`${nameKey(row.name)}|${nameKey(row.groupName ?? '')}`) : undefined;
    if (phone) repeats.set(row.line, { ofLine: phone, field: 'phone' });
    else if (email) repeats.set(row.line, { ofLine: email, field: 'email' });
    else if (name) repeats.set(row.line, { ofLine: name, field: 'name' });
    else {
      if (row.phone) byPhone.set(row.phone, row.line);
      if (row.email) byEmail.set(row.email, row.line);
      if (contactless) byName.set(`${nameKey(row.name)}|${nameKey(row.groupName ?? '')}`, row.line);
    }
  }
  return repeats;
}
