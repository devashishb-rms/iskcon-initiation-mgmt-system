import { Injectable } from '@nestjs/common';
import { toCsv } from '../../../common/csv';
import { IMPORT_FIELDS } from '../domain/columns';

/** The sheet people fill in: the headings the importer reads and one example row to show the format. */
@Injectable()
export class ImportTemplateService {
  csv(): string {
    const example: Record<(typeof IMPORT_FIELDS)[number], string> = {
      name: 'Ananya Sen',
      phone: '9800000000',
      email: 'ananya@example.org',
      groupName: 'Sunday group',
      mentorName: 'Mentor name or e-mail',
      guruName: 'Guru name',
      track: 'FIRST',
      shelterDate: '2025-03-01',
      practiceSince: '2024-01-10',
    };
    return toCsv([...IMPORT_FIELDS], [IMPORT_FIELDS.map((f) => example[f])]);
  }
}
