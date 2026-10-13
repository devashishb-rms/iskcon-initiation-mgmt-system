/** The columns of the import sheet: the fields of a row in the contract, in the order of the template. */
export const IMPORT_FIELDS = ['name', 'phone', 'email', 'groupName', 'mentorName', 'guruName', 'track', 'shelterDate', 'practiceSince'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_FIELDS: readonly ImportField[] = ['name'];

/** What people actually type in a heading, reduced to lower-case letters and digits. */
const ALIASES: Record<ImportField, readonly string[]> = {
  name: ['name', 'fullname', 'candidate', 'candidatename'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber'],
  email: ['email', 'emailaddress', 'emailid'],
  groupName: ['groupname', 'group', 'sanga', 'bhaktivriksha'],
  mentorName: ['mentorname', 'mentor', 'mentoremail'],
  guruName: ['guruname', 'guru'],
  track: ['track', 'initiation', 'initiationtrack'],
  shelterDate: ['shelterdate', 'shelter', 'shelteron'],
  practiceSince: ['practicesince', 'practicedate', 'practisingsince'],
};

function squash(heading: string): string {
  return heading.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const FIELD_BY_ALIAS = new Map<string, ImportField>(
  (Object.entries(ALIASES) as Array<[ImportField, readonly string[]]>).flatMap(([field, aliases]) => aliases.map((a) => [squash(a), field] as const)),
);

export interface HeaderMapping {
  /** For each column of the sheet, the field it holds, or null when it is not one we read. */
  columns: Array<ImportField | null>;
  missing: ImportField[];
  /** Headings that were not recognised, so the person can be told they were ignored. */
  ignored: string[];
}

/** Maps the heading row to fields. The first column with a given meaning wins. */
export function mapHeaders(headings: string[]): HeaderMapping {
  const seen = new Set<ImportField>();
  const ignored: string[] = [];
  const columns = headings.map((h) => {
    const field = FIELD_BY_ALIAS.get(squash(h));
    if (!field || seen.has(field)) {
      if (h.trim()) ignored.push(h.trim());
      return null;
    }
    seen.add(field);
    return field;
  });
  return { columns, missing: REQUIRED_FIELDS.filter((f) => !seen.has(f)), ignored };
}
