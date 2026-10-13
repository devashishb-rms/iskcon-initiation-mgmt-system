import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

/**
 * Shared PDF factory. Every PDF the API produces (recommendation letter, hand-off package cover,
 * register export, candidate list) starts from `createPdf()`, so they all render candidate names
 * written in Bengali or Devanagari correctly.
 *
 * Fonts: Noto Sans (Latin), Noto Sans Bengali and Noto Sans Devanagari, regular and bold, shipped in
 * `apps/api/assets/fonts` (SIL Open Font License, see LICENSE-OFL.txt there). PDFKit has no font
 * fallback, so the document returned here picks, per string, the font of the script the string is
 * written in. Use the registered family names `'Body'` and `'Body-Bold'` and everything else is automatic:
 *
 *     const doc = createPdf();               // current font is 'Body'
 *     doc.font('Body-Bold').text(name);      // Bengali or Devanagari names are shaped correctly
 *     const pdf = await streamToBuffer(doc); // when the content is written, call doc.end() first
 *
 * `text`, `widthOfString` and `heightOfString` choose the script font. Text that mixes Bengali and
 * Devanagari inside one call is drawn in the font of the first non-Latin script found. Fonts other
 * than 'Body' and 'Body-Bold' (for example PDFKit's built-in Helvetica) are used as they are.
 */

type Weight = 'Regular' | 'Bold';
type Script = 'Latin' | 'Bengali' | 'Devanagari';

const FILES: Record<Script, Record<Weight, string>> = {
  Latin: { Regular: 'NotoSans-Regular.ttf', Bold: 'NotoSans-Bold.ttf' },
  Bengali: { Regular: 'NotoSansBengali-Regular.ttf', Bold: 'NotoSansBengali-Bold.ttf' },
  Devanagari: { Regular: 'NotoSansDevanagari-Regular.ttf', Bold: 'NotoSansDevanagari-Bold.ttf' },
};

const BODY = 'Body';
const BODY_BOLD = 'Body-Bold';
const registeredName = (script: Script, weight: Weight): string =>
  script === 'Latin' ? (weight === 'Bold' ? BODY_BOLD : BODY) : `${script}${weight === 'Bold' ? '-Bold' : ''}`;

/** `assets/fonts` next to the sources (ts-node, jest) and next to `dist` (built), or under the working directory. */
function fontsDir(): string {
  const candidates = [join(__dirname, '../../../assets/fonts'), join(process.cwd(), 'assets/fonts'), join(process.cwd(), 'apps/api/assets/fonts')];
  const found = candidates.find((d) => existsSync(join(d, FILES.Latin.Regular)));
  if (!found) throw new Error(`PDF fonts not found. Looked in: ${candidates.join(', ')}`);
  return found;
}

const BENGALI = /[ঀ-৿]/;
const DEVANAGARI = /[ऀ-ॿ]/;

/** The script a piece of text needs a font for (Latin when it needs nothing special). */
export function scriptOf(text: string): Script {
  if (BENGALI.test(text)) return 'Bengali';
  if (DEVANAGARI.test(text)) return 'Devanagari';
  return 'Latin';
}

/** A PDFKit document that draws each string in the font of its script. Created only by `createPdf`. */
class MultiScriptDocument extends PDFDocument {
  /** The font the caller asked for ('Body' or 'Body-Bold', or something else we leave alone). */
  private requested: string = BODY;
  /** Depth of our own calls, so PDFKit's internal calls to these methods (line breaking) are not re-routed. */
  private depth = 0;

  // PDFKit declares overloads; the implementation signatures below forward everything unchanged.
  override font(...args: unknown[]): this {
    const [src] = args;
    if (typeof src === 'string' && this.depth === 0) this.requested = src;
    return (super.font as (...a: unknown[]) => this).apply(this, args);
  }

  override text(...args: unknown[]): this {
    return this.withScriptFont(args[0], () => (super.text as (...a: unknown[]) => this).apply(this, args));
  }

  override widthOfString(...args: unknown[]): number {
    return this.withScriptFont(args[0], () => (super.widthOfString as (...a: unknown[]) => number).apply(this, args));
  }

  override heightOfString(...args: unknown[]): number {
    return this.withScriptFont(args[0], () => (super.heightOfString as (...a: unknown[]) => number).apply(this, args));
  }

  private withScriptFont<T>(text: unknown, run: () => T): T {
    const weight: Weight | null = this.requested === BODY ? 'Regular' : this.requested === BODY_BOLD ? 'Bold' : null;
    const script = typeof text === 'string' && weight && this.depth === 0 ? scriptOf(text) : 'Latin';
    const outermost = this.depth === 0;
    const target = weight ? registeredName(script, weight) : this.requested;
    if (outermost && script !== 'Latin') this.switchFont(target);
    this.depth++;
    try {
      return run();
    } finally {
      this.depth--;
      if (outermost && script !== 'Latin') this.switchFont(this.requested);
    }
  }

  private switchFont(name: string): void {
    this.depth++;
    try {
      (super.font as (...a: unknown[]) => this).call(this, name);
    } finally {
      this.depth--;
    }
  }
}

export interface CreatePdfOptions {
  /** Default A4 portrait with 50pt margins. */
  size?: string | number[];
  margin?: number;
  layout?: 'portrait' | 'landscape';
  /** Document properties shown by PDF viewers. */
  title?: string;
  author?: string;
  /** Creation date in the document properties; pass `clock.now()` (defaults to the system time). */
  createdAt?: Date;
  /** Buffer every page so `doc.bufferedPageRange()` / `switchToPage` work (page numbers in footers). */
  bufferPages?: boolean;
}

/** A new PDF document with the Unicode fonts registered and 'Body' selected. The caller writes, then calls `doc.end()`. */
export function createPdf(options: CreatePdfOptions = {}): PDFKit.PDFDocument {
  const doc = new MultiScriptDocument({
    size: options.size ?? 'A4',
    margin: options.margin ?? 50,
    layout: options.layout ?? 'portrait',
    bufferPages: options.bufferPages ?? false,
    info: {
      Producer: 'ISKCON Initiation Platform',
      ...(options.title ? { Title: options.title } : {}),
      ...(options.author ? { Author: options.author } : {}),
      ...(options.createdAt ? { CreationDate: options.createdAt } : {}),
    },
  });
  const dir = fontsDir();
  for (const script of Object.keys(FILES) as Script[]) {
    for (const weight of ['Regular', 'Bold'] as Weight[]) doc.registerFont(registeredName(script, weight), join(dir, FILES[script][weight]));
  }
  doc.font(BODY);
  return doc;
}

/** Collects a finished document into memory. Call it before or after `doc.end()`; it resolves once the PDF is complete. */
export function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
