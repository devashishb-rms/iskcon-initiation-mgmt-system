import type { Locale } from '@iskcon/contracts';
import { formatCalendarDate, isIsoDate } from '@/lib/dates';
import bn from './bn.json';
import en from './en.json';
import hi from './hi.json';

export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number | undefined>;
export type Catalogue = Readonly<Record<string, string>>;

export const catalogues: Record<Locale, Catalogue> = { en, bn, hi };

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', bn: 'বাংলা', hi: 'हिन्दी' };

/** ICU-lite: replaces `{name}` with the parameter. Unknown names are left visible so a gap is noticed. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });
}

/** `rule.R-1.detail.notMet` -> `not met` : only used when no catalogue has the code. */
export function humanizeCode(code: string): string {
  const last = code.split('.').pop() ?? code;
  return last.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Looks the code up in the locale, then in English; never throws. */
export function translate(locale: Locale, code: string, params?: Params): string {
  const template = catalogues[locale][code] ?? catalogues.en[code];
  return template === undefined ? humanizeCode(code) : interpolate(template, params);
}

export const hasMessage = (code: string): boolean => code in catalogues.en;

export interface ServerMessage {
  code: string;
  params?: Record<string, string | number> | undefined;
}

const STAGE_PARAMS = new Set(['from', 'to', 'stage']);
const IMPORT_FIELDS = new Set(['name', 'phone', 'email', 'groupName', 'mentorName', 'guruName', 'track', 'shelterDate', 'practiceSince']);

/**
 * Prepares the parameters the API sends for display: calendar dates are formatted for the locale
 * (never through a time zone), stage/track/document names are translated, and a comma-separated
 * `fields` list becomes readable fact names.
 */
export function formatParams(locale: Locale, params: ServerMessage['params']): Params | undefined {
  if (!params) return undefined;
  const out: Params = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && isIsoDate(value)) out[key] = formatCalendarDate(value, locale);
    else if (typeof value === 'string' && STAGE_PARAMS.has(key) && value) out[key] = translate(locale, `stage.${value}`);
    else if (typeof value === 'string' && key === 'track') out[key] = translate(locale, `track.${value}`);
    else if (typeof value === 'string' && (key === 'docType' || key === 'type' || key === 'documentType')) out[key] = translate(locale, `docType.${value}`);
    else if (typeof value === 'string' && key === 'by') out[key] = translate(locale, `by.${value}`);
    else if (typeof value === 'string' && key === 'response') out[key] = translate(locale, `guruResponse.${value}`);
    else if (typeof value === 'string' && key === 'field' && IMPORT_FIELDS.has(value)) out[key] = translate(locale, `import.field.${value}`);
    else if (typeof value === 'string' && key === 'fields') out[key] = value.split(',').filter(Boolean).map((f) => translate(locale, `fact.${f}`)).join(', ');
    else out[key] = value;
  }
  return out;
}

/** A few codes read better in a variant (a file opened has no "from" stage; a move may carry a reason). */
export function resolveCode(code: string, params: ServerMessage['params']): string {
  if (code === 'timeline.stage' && !params?.from) return 'timeline.stage.start';
  if (params?.reason && hasMessage(`${code}.withReason`)) return `${code}.withReason`;
  return code;
}

/** Translates a `{ code, params }` message from the API. */
export function translateMessage(locale: Locale, msg: ServerMessage): string {
  return translate(locale, resolveCode(msg.code, msg.params), formatParams(locale, msg.params));
}
