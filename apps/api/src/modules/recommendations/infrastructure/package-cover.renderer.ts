import { Injectable } from '@nestjs/common';
import type { EvaluationDto } from '@iskcon/contracts';
import { createPdf, streamToBuffer } from '../../../common/pdf/pdf';
import { checklistTable, footer, heading, labelled, paragraph, rule } from './pdf-sections';

export interface CoverModel {
  templeName: string;
  candidateName: string;
  guruName: string | null;
  track: 'FIRST' | 'SECOND';
  stage: string;
  ruleSet: { name: string; version: number };
  evaluation: EvaluationDto;
  generatedOn: string;
  generatedBy: string;
  included: Array<{ type: string; filename: string }>;
  missing: string[];
}

/** Draws the cover sheet of the hand-over package. */
@Injectable()
export class PackageCoverRenderer {
  async render(m: CoverModel): Promise<Buffer> {
    const doc = createPdf({ title: `File: ${m.candidateName}`, author: m.templeName });
    const done = streamToBuffer(doc);

    doc.font('Body-Bold').fontSize(18).text(m.templeName, { align: 'center' });
    doc.font('Body').fontSize(12).fillColor('#52606d').text('Initiation file: cover sheet', { align: 'center' });
    doc.moveDown(0.6);
    rule(doc);
    doc.moveDown(0.6);

    labelled(doc, 'Candidate:', m.candidateName);
    labelled(doc, 'Initiation:', m.track === 'SECOND' ? 'Second' : 'First');
    labelled(doc, 'Spiritual master:', m.guruName ?? 'Not chosen yet');
    labelled(doc, 'Stage:', m.stage);
    labelled(doc, 'Assessed against:', `${m.ruleSet.name}, version ${m.ruleSet.version}`);

    heading(doc, 'Checklist');
    checklistTable(doc, m.evaluation);

    heading(doc, `Documents included (${m.included.length})`);
    if (m.included.length === 0) paragraph(doc, 'None.');
    for (const d of m.included) paragraph(doc, `${d.type}: ${d.filename}`);

    heading(doc, `Documents missing (${m.missing.length})`);
    if (m.missing.length === 0) paragraph(doc, 'None. Every document the rules ask for is on file.');
    for (const d of m.missing) paragraph(doc, d);

    footer(doc, `Prepared ${m.generatedOn} by ${m.generatedBy}`);
    doc.end();
    return done;
  }
}
