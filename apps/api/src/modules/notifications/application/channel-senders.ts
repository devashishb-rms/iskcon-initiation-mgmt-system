import { Injectable } from '@nestjs/common';
import { EmailGateway, SmsGateway } from '../../../platform/delivery/gateways';
import type { Channel } from '../domain/notification-kinds';
import type { Recipient } from '../domain/recipient';
import type { RenderedMessage } from '../domain/templates';

/**
 * How one text channel reaches a person. The DeliveryWorker knows this interface, not e-mail or SMS,
 * so a new channel (WhatsApp, push) is a new sender and a line in the module, not a change to the worker.
 */
export abstract class ChannelSender {
  abstract readonly channel: Exclude<Channel, 'IN_APP'>;
  /** Where to send to for this person, or null when they have no address on this channel. */
  abstract addressOf(recipient: Pick<Recipient, 'email' | 'phone'>): string | null;
  /** False when the deployment has this channel switched off. */
  abstract get available(): boolean;
  abstract send(address: string, message: RenderedMessage): Promise<void>;
}

@Injectable()
export class EmailSender extends ChannelSender {
  readonly channel = 'EMAIL' as const;
  constructor(private readonly gateway: EmailGateway) {
    super();
  }
  get available(): boolean {
    return true;
  }
  addressOf(recipient: Pick<Recipient, 'email' | 'phone'>): string | null {
    return recipient.email;
  }
  send(address: string, message: RenderedMessage): Promise<void> {
    return this.gateway.send({ to: address, subject: message.subject, text: message.body });
  }
}

@Injectable()
export class SmsSender extends ChannelSender {
  readonly channel = 'SMS' as const;
  constructor(private readonly gateway: SmsGateway) {
    super();
  }
  get available(): boolean {
    return this.gateway.enabled;
  }
  addressOf(recipient: Pick<Recipient, 'email' | 'phone'>): string | null {
    return recipient.phone;
  }
  send(address: string, message: RenderedMessage): Promise<void> {
    return this.gateway.send({ to: address, text: message.sms });
  }
}

/** Injection token for the list of senders; the module lists them. */
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');
