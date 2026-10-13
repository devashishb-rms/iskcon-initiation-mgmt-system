import type { Locale } from '@iskcon/contracts';
import type { MessageCode, MessageParams } from '../notification-kinds';
import { bn } from './bn';
import { en } from './en';
import { hi } from './hi';
import { sanitizeParams } from './sanitize';
import type { RenderedMessage, TemplateSet } from './types';

export type { RenderedMessage } from './types';
export { sanitize } from './sanitize';

const SETS: Record<Locale, TemplateSet> = { en, bn, hi };
export const DEFAULT_LOCALE: Locale = 'en';

/** The template set for a locale; English for anything unknown. */
export const templatesFor = (locale: string): TemplateSet => SETS[locale as Locale] ?? SETS[DEFAULT_LOCALE];

/**
 * Renders one message code for EMAIL or SMS. Parameters are sanitised once here, so no template can
 * forget to. `link` is an absolute URL (or null) appended to the e-mail body.
 */
export function renderMessage(locale: string, code: MessageCode, params: MessageParams, link: string | null): RenderedMessage {
  const template = templatesFor(locale)[code] ?? SETS[DEFAULT_LOCALE][code];
  const rendered = template(sanitizeParams(params));
  return { ...rendered, body: link ? `${rendered.body}\n\n${link}` : rendered.body };
}
