import { contentDisposition } from './content-disposition';

describe('contentDisposition', () => {
  it('gives an ASCII fallback and a UTF-8 name', () => {
    expect(contentDisposition('attachment', 'essay.pdf')).toBe(`attachment; filename="essay.pdf"; filename*=UTF-8''essay.pdf`);
    const bn = contentDisposition('inline', 'শংসাপত্র.pdf');
    expect(bn).toMatch(/^inline; filename="_+\.pdf"; filename\*=UTF-8''%E0%A6%B6/);
  });

  it('cannot be used to inject header parameters', () => {
    const h = contentDisposition('attachment', 'a";\r\nSet-Cookie: x=1.pdf');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.match(/"/g)).toHaveLength(2);
  });
});
