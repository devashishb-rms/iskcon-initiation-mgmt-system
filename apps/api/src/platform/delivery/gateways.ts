import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
export interface SmsMessage {
  to: string;
  text: string;
}

/** Ports. Modules depend on these, never on nodemailer or an SMS vendor (dependency inversion). */
export abstract class EmailGateway {
  abstract send(message: EmailMessage): Promise<void>;
}
export abstract class SmsGateway {
  abstract send(message: SmsMessage): Promise<void>;
  abstract get enabled(): boolean;
}

/** Development and test: nothing leaves the machine. Messages are logged and kept in memory. */
@Injectable()
export class ConsoleGateway extends EmailGateway {
  private readonly log = new Logger('ConsoleGateway');
  readonly sent: Array<{ channel: 'EMAIL' | 'SMS'; to: string; subject?: string; text: string }> = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push({ channel: 'EMAIL', ...message });
    this.log.log(`EMAIL to ${message.to}: ${message.subject}\n${message.text}`);
  }
  async sendSms(message: SmsMessage): Promise<void> {
    this.sent.push({ channel: 'SMS', ...message });
    this.log.log(`SMS to ${message.to}: ${message.text}`);
  }
  lastTo(to: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === to)?.text;
  }
  clear(): void {
    this.sent.length = 0;
  }
}

@Injectable()
export class ConsoleSmsGateway extends SmsGateway {
  readonly enabled = true;
  constructor(private readonly console: ConsoleGateway) {
    super();
  }
  send(message: SmsMessage): Promise<void> {
    return this.console.sendSms(message);
  }
}

@Injectable()
export class SmtpGateway extends EmailGateway {
  private readonly transport: Transporter;
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    if (!env.SMTP_URL) throw new Error('SMTP_URL is required when DELIVERY_MODE=live');
    this.transport = nodemailer.createTransport(env.SMTP_URL);
  }
  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.env.MAIL_FROM, ...message });
  }
}

/**
 * Posts {to, text} to a configured HTTP endpoint. India's SMS rules (DLT templates, sender ids)
 * live in the gateway behind that endpoint, not in this code.
 */
@Injectable()
export class WebhookSmsGateway extends SmsGateway {
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }
  get enabled(): boolean {
    return Boolean(this.env.SMS_WEBHOOK_URL);
  }
  async send(message: SmsMessage): Promise<void> {
    if (!this.env.SMS_WEBHOOK_URL) throw new Error('SMS is not configured');
    const res = await fetch(this.env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.env.SMS_WEBHOOK_TOKEN ? { authorization: `Bearer ${this.env.SMS_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`SMS gateway answered ${res.status}`);
  }
}
