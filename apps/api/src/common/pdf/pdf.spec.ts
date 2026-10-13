import { createPdf, scriptOf, streamToBuffer } from './pdf';

describe('createPdf', () => {
  it('detects the script a string needs', () => {
    expect(scriptOf('Priya Ghosh 2026-10-14')).toBe('Latin');
    expect(scriptOf('দেবাশীষ লাহিড়ী')).toBe('Bengali');
    expect(scriptOf('देवाशीष लाहिड़ी')).toBe('Devanagari');
    expect(scriptOf('Debashis (দেবাশীষ)')).toBe('Bengali');
  });

  it('writes a valid PDF for Latin, Bengali and Devanagari names and embeds the matching fonts', async () => {
    const doc = createPdf({ title: 'Test' });
    const done = streamToBuffer(doc);
    doc.font('Body-Bold').fontSize(16).text('Recommendation for দেবাশীষ লাহিড়ী');
    doc.font('Body').fontSize(12).text('देवाशीष लाहिड़ी');
    doc.text('Plain Latin line');
    expect(doc.widthOfString('দেবাশীষ')).toBeGreaterThan(10);
    doc.end();
    const pdf = await done;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    const raw = pdf.toString('latin1');
    expect(raw).toContain('NotoSansBengali-Bold');
    expect(raw).toContain('NotoSansDevanagari-Regular');
    expect(raw).toContain('NotoSans-Regular');
  });

  it('keeps the requested font for later text after a Bengali line', async () => {
    const doc = createPdf();
    const done = streamToBuffer(doc);
    const before = doc.widthOfString('Hello');
    doc.text('দেবাশীষ');
    expect(doc.widthOfString('Hello')).toBe(before);
    doc.end();
    await done;
  });

  it('leaves non-registered fonts alone', async () => {
    const doc = createPdf();
    const done = streamToBuffer(doc);
    doc.font('Helvetica').text('Plain');
    doc.end();
    expect((await done).toString('latin1')).toContain('Helvetica');
  });
});
