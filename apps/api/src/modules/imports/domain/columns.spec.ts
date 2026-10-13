import { importRow } from '@iskcon/contracts';
import { IMPORT_FIELDS, mapHeaders } from './columns';

describe('import columns', () => {
  it('are exactly the fields of the contract\'s row, in order', () => {
    expect([...IMPORT_FIELDS]).toEqual(Object.keys(importRow.shape));
  });

  it('maps the contract headings and friendly variants, in any order', () => {
    const m = mapHeaders(['Mobile Number', 'Full name', 'E-mail', 'Bhakti Vriksha', 'Mentor', 'Notes', 'Shelter date']);
    expect(m.columns).toEqual(['phone', 'name', 'email', 'groupName', 'mentorName', null, 'shelterDate']);
    expect(m.missing).toEqual([]);
    expect(m.ignored).toEqual(['Notes']);
  });

  it('reports a missing name column, and uses the first of two columns with the same meaning', () => {
    expect(mapHeaders(['phone', 'email']).missing).toEqual(['name']);
    expect(mapHeaders(['name', 'Name']).columns).toEqual(['name', null]);
  });

  it('reads headings in Bengali script letters without breaking', () => {
    expect(mapHeaders(['নাম', 'name']).columns).toEqual([null, 'name']);
  });
});
