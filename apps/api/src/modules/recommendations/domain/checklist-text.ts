import type { EvaluationDto } from '@iskcon/contracts';
import type { DocumentType } from '@iskcon/rules-engine';

type Item = EvaluationDto['items'][number];
type Params = Record<string, string | number> | undefined;

/**
 * English wording for the PDFs (the letter and the package cover). The JSON API sends message codes
 * that the web app translates; a PDF is a finished document, so its text is produced here. Unknown
 * codes fall back to the code itself, which is ugly but never wrong.
 */
const LABELS: Record<string, string> = {
  'rule.R-1.label.first': 'Regular practice for at least {months} months, confirmed by the mentor',
  'rule.R-1.label.second': 'Regular practice for at least {months} months, confirmed by the mentor',
  'rule.R-2.label': 'Accepted in shelter for at least {months} months',
  'rule.R-3.label': 'Initiation examination passed',
  'rule.R-4.label': 'Disciples Course completed, certificate on file',
  'rule.R-5.label': "President's written recommendation",
  'rule.R-6.label': 'At least {months} months since the first initiation',
  'rule.R-7.label': 'At least {months} months since changing guru',
  'rule.R-8.label': 'At least {months} months since returning to ISKCON',
};

const STATUS: Record<Item['status'], string> = {
  MET: 'Met',
  NOT_MET: 'Not met',
  UNKNOWN: 'Not yet recorded',
  LATER: 'With this letter',
  EXCEPTION: 'Committee exception',
};

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  SHELTER_ACCEPTANCE: 'Shelter acceptance',
  EXAM_RESULT: 'Examination result',
  COURSE_CERTIFICATE: 'Course certificate',
  ESSAY: 'Essay',
  OATH: 'Oath',
  BIO_DATA: 'Bio-data',
  OTHER: 'Other document',
};

const fill = (template: string, params: Params): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));

export const itemLabel = (item: Item): string => {
  const template = LABELS[item.label.code];
  return template ? fill(template, item.label.params) : item.label.code;
};

export const itemStatus = (item: Item): string => STATUS[item.status];

/** The reason of a committee exception, which the engine puts in the item's detail. */
export const exceptionReason = (item: Item): string | null =>
  item.status === 'EXCEPTION' && typeof item.detail.params?.reason === 'string' ? item.detail.params.reason : null;

/** Rules not yet satisfied by the record (not counting those that come with the letter itself). */
export const unmetItemIds = (evaluation: EvaluationDto): Item['id'][] =>
  evaluation.items.filter((i) => i.status === 'NOT_MET' || i.status === 'UNKNOWN').map((i) => i.id);
