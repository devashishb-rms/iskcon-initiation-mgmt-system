import { itemLabel, itemStatus, exceptionReason } from '../domain/checklist-text';
import type { EvaluationDto } from '@iskcon/contracts';

/** Drawing helpers shared by the letter and the package cover. Plain PDFKit calls on a document from `createPdf()`. */
const INK = '#1f2933';
const MUTED = '#52606d';
const RULE = '#cbd2d9';

export const heading = (doc: PDFKit.PDFDocument, text: string, size = 13): void => {
  doc.moveDown(0.8).font('Body-Bold').fontSize(size).fillColor(INK).text(text).moveDown(0.3);
};

export const paragraph = (doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}): void => {
  doc.font('Body').fontSize(11).fillColor(INK).text(text, { lineGap: 2, ...options });
};

export const labelled = (doc: PDFKit.PDFDocument, label: string, value: string): void => {
  doc.font('Body').fontSize(10).fillColor(MUTED).text(label, { continued: true, lineGap: 2 });
  doc.fillColor(INK).font('Body-Bold').text(` ${value}`);
};

export const rule = (doc: PDFKit.PDFDocument): void => {
  const y = doc.y + 4;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.moveDown(0.6);
};

/** The checklist as it stood: one row per rule with its status, and the reason when a committee exception covers it. */
export function checklistTable(doc: PDFKit.PDFDocument, evaluation: EvaluationDto): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const statusWidth = 120;
  const labelWidth = width - statusWidth - 12;
  for (const item of evaluation.items) {
    const label = `${item.id}  ${itemLabel(item)}`;
    const status = itemStatus(item);
    const reason = exceptionReason(item);
    doc.font('Body').fontSize(10);
    const height = Math.max(doc.heightOfString(label, { width: labelWidth }), doc.heightOfString(status, { width: statusWidth })) + (reason ? doc.heightOfString(`Reason: ${reason}`, { width: labelWidth }) + 2 : 0);
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const top = doc.y;
    doc.fillColor(INK).text(label, left, top, { width: labelWidth });
    doc.font(item.status === 'MET' || item.status === 'EXCEPTION' ? 'Body-Bold' : 'Body').fillColor(item.status === 'NOT_MET' ? '#b42318' : INK).text(status, left + labelWidth + 12, top, { width: statusWidth });
    if (reason) doc.font('Body').fillColor(MUTED).text(`Reason: ${reason}`, left, doc.y + 2, { width: labelWidth });
    doc.x = left;
    doc.y = top + height + 6;
  }
  doc.fillColor(INK);
}

export const footer = (doc: PDFKit.PDFDocument, text: string): void => {
  const y = doc.page.height - doc.page.margins.bottom - 12;
  doc.font('Body').fontSize(8).fillColor(MUTED).text(text, doc.page.margins.left, y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center', lineBreak: false });
  doc.fillColor(INK);
};
