import { Injectable } from '@nestjs/common';
import type { EvaluationDto } from '@iskcon/contracts';
import { createPdf, streamToBuffer } from '../../../common/pdf/pdf';
import { checklistTable, footer, heading, labelled, paragraph, rule } from './pdf-sections';

/** Everything the letter says, already decided; the renderer only draws. */
export interface LetterModel {
  templeName: string;
  candidateName: string;
  guruName: string;
  track: 'FIRST' | 'SECOND';
  recommendedOn: string;
  ruleSet: { name: string; version: number };
  evaluation: EvaluationDto;
  decidedBy: string;
  reference: string;
}

/** Draws the president's recommendation letter as a PDF. */
@Injectable()
export class LetterRenderer {
  async render(m: LetterModel): Promise<Buffer> {
    const doc = createPdf({ title: `Recommendation: ${m.candidateName}`, author: m.templeName });
    const done = streamToBuffer(doc);

    doc.font('Body-Bold').fontSize(20).text(m.templeName, { align: 'center' });
    doc.font('Body').fontSize(12).fillColor('#52606d').text('Recommendation for initiation', { align: 'center' });
    doc.moveDown(0.6);
    rule(doc);

    doc.moveDown(0.8);
    paragraph(doc, `This is to recommend ${m.candidateName} for ${m.track === 'SECOND' ? 'second' : 'first'} initiation by ${m.guruName}.`, { align: 'left' });
    doc.moveDown(0.6);
    labelled(doc, 'Candidate:', m.candidateName);
    labelled(doc, 'Spiritual master:', m.guruName);
    labelled(doc, 'Recommended on:', m.recommendedOn);
    labelled(doc, 'Assessed against:', `${m.ruleSet.name}, version ${m.ruleSet.version}`);

    heading(doc, 'Checklist at the time of the recommendation');
    checklistTable(doc, m.evaluation);

    paragraph(doc, "The checklist is a record of what was known; the decision is the president's own, made after reading the file.", { align: 'left' });

    // Signature block, kept together on one page.
    if (doc.y > doc.page.height - 190) doc.addPage();
    doc.moveDown(3);
    const left = doc.page.margins.left;
    const y = doc.y;
    doc.moveTo(left, y).lineTo(left + 220, y).lineWidth(0.8).strokeColor('#1f2933').stroke();
    doc.font('Body').fontSize(11).fillColor('#1f2933').text('President', left, y + 6);
    doc.fontSize(10).fillColor('#52606d').text(m.templeName, left, doc.y);
    doc.text(`Decision recorded by ${m.decidedBy}`, left, doc.y);

    footer(doc, `Reference ${m.reference}`);
    doc.end();
    return done;
  }
}
