import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { renderMessage, type RenderedMessage } from '../domain/templates';
import type { StoredPayload } from '../infrastructure/notifications.repository';

/** Renders the stored message code in the recipient's language for channels that carry text (EMAIL, SMS). */
@Injectable()
export class MessageRenderer {
  constructor(@Inject(ENV) private readonly env: Env) {}

  render(locale: string, payload: Pick<StoredPayload, 'message' | 'link'>): RenderedMessage {
    return renderMessage(locale, payload.message.code, payload.message.params, this.absoluteLink(payload.link));
  }

  private absoluteLink(link: string | null): string | null {
    return link ? `${this.env.PUBLIC_WEB_URL.replace(/\/+$/, '')}${link}` : null;
  }
}
