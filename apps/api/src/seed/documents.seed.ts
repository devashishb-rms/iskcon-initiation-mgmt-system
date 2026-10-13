import type { DocumentType } from '@iskcon/rules-engine';
import { createPdf, streamToBuffer } from '../common/pdf/pdf';
import { DocumentsService } from '../modules/documents';
import type { SeedStep } from './seed-kit';

/**
 * Sample documents for two of the sample candidates, so the checklist, the document list and the
 * hand-over package have something to show. INVENTED: each file is a one-line PDF saying so.
 * Ananya deliberately gets no course certificate (she must still lack it). Safe to run again: it only
 * adds the types a file does not have yet.
 */
const SAMPLES: Array<{ key: string; name: string; types: DocumentType[] }> = [
  { key: 'priya', name: 'Priya Ghosh', types: ['COURSE_CERTIFICATE', 'EXAM_RESULT'] },
  { key: 'sunita', name: 'Sunita Roy', types: ['COURSE_CERTIFICATE', 'EXAM_RESULT', 'SHELTER_ACCEPTANCE'] },
];

const TITLES: Record<DocumentType, string> = {
  SHELTER_ACCEPTANCE: 'Shelter acceptance',
  EXAM_RESULT: 'Examination result',
  COURSE_CERTIFICATE: 'Disciples Course certificate',
  ESSAY: 'Essay',
  OATH: 'Oath',
  BIO_DATA: 'Bio-data',
  OTHER: 'Document',
};

async function samplePdf(title: string, person: string): Promise<Buffer> {
  const doc = createPdf({ title: `${title} (sample)` });
  const done = streamToBuffer(doc);
  doc.font('Body-Bold').fontSize(18).text(title);
  doc.moveDown().font('Body').fontSize(12).text(person);
  doc.moveDown().fontSize(10).text('Sample document with invented data, created by the demonstration seed.');
  doc.end();
  return done;
}

const step: SeedStep = {
  name: 'documents',
  order: 30,
  async run(ctx) {
    const documents = ctx.get(DocumentsService);
    const committee = ctx.people.committee;
    const mohan = ctx.people.mohan; // the mentor of both candidates
    if (!committee || !mohan) throw new Error('The documents step needs the core step (people and candidates) to run first');

    for (const sample of SAMPLES) {
      const applicationId = ctx.shared[sample.key];
      if (!applicationId) throw new Error(`The documents step needs the sample candidate "${sample.name}" from the core step`);
      const have = new Set((await ctx.as(committee, () => documents.list(applicationId))).map((d) => d.type));
      for (const type of sample.types.filter((t) => !have.has(t))) {
        const content = await samplePdf(TITLES[type], sample.name);
        const fileName = `${TITLES[type].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
        await ctx.as(mohan, () => documents.upload(applicationId, type, { originalName: fileName, content }));
      }
    }
  },
};

export default step;
