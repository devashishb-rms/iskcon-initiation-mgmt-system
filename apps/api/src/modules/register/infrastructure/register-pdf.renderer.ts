import { Injectable } from '@nestjs/common';
import type { RegisterEntryDto } from '@iskcon/contracts';
import { createPdf, streamToBuffer } from '../../../common/pdf/pdf';
import { EXPORT_COLUMNS } from '../domain/register-entry';

export interface RegisterPdfMeta {
  /** Calendar date printed on the page (from `Clock.today()`). */
  generatedOn: string;
  createdAt: Date;
}

const MARGIN = 40;
const PAD = 4;
/** Column widths in points on landscape A4 (usable width 762). */
const WIDTHS = [78, 190, 190, 56, 248];

/**
 * Draws the register as a table. Uses the shared `createPdf`, which registers Unicode fonts and picks
 * the font of the script of each string, so Bengali and Hindi names print correctly.
 */
@Injectable()
export class RegisterPdfRenderer {
  async render(rows: RegisterEntryDto[], meta: RegisterPdfMeta): Promise<Buffer> {
    const doc = createPdf({ layout: 'landscape', margin: MARGIN, title: 'Initiation register', createdAt: meta.createdAt, bufferPages: true });
    const done = streamToBuffer(doc);

    doc.font('Body-Bold').fontSize(16).text('Initiation register', MARGIN, MARGIN);
    doc.font('Body').fontSize(9).fillColor('#555555').text(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${meta.generatedOn}`);
    doc.fillColor('#000000');
    let y = doc.y + 10;

    const bottom = doc.page.height - MARGIN - 18;
    const header = (at: number): number => this.row(doc, at, [...EXPORT_COLUMNS], true);
    y += header(y);

    for (const e of rows) {
      const cells = [e.initiatedOn, e.spiritualName, e.candidateName, e.track, e.guru.name];
      if (y + this.height(doc, cells) > bottom) {
        doc.addPage();
        y = MARGIN;
        y += header(y);
      }
      y += this.row(doc, y, cells, false);
    }
    if (!rows.length) doc.font('Body').fontSize(10).text('No entries match.', MARGIN, y + 6);

    // Page numbers, written after the content so the total is known.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // otherwise text this low would start a new page
      doc.font('Body').fontSize(8).fillColor('#555555').text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN, {
        width: doc.page.width - 2 * MARGIN,
        align: 'right',
        lineBreak: false,
      });
    }
    doc.end();
    return done;
  }

  private height(doc: PDFKit.PDFDocument, cells: string[]): number {
    doc.fontSize(9);
    return Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: WIDTHS[i]! - 2 * PAD }))) + 2 * PAD;
  }

  /** Draws one table row at `y` and returns its height. */
  private row(doc: PDFKit.PDFDocument, y: number, cells: string[], bold: boolean): number {
    doc.font(bold ? 'Body-Bold' : 'Body').fontSize(9);
    const h = this.height(doc, cells);
    let x = MARGIN;
    cells.forEach((c, i) => {
      doc.text(c, x + PAD, y + PAD, { width: WIDTHS[i]! - 2 * PAD });
      x += WIDTHS[i]!;
    });
    doc
      .moveTo(MARGIN, y + h)
      .lineTo(MARGIN + WIDTHS.reduce((a, b) => a + b, 0), y + h)
      .lineWidth(bold ? 1 : 0.4)
      .strokeColor(bold ? '#333333' : '#cccccc')
      .stroke();
    return h;
  }
}
