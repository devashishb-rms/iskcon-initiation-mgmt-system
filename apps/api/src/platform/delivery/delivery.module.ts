import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import {
  ConsoleGateway,
  ConsoleSmsGateway,
  EmailGateway,
  LoggingEmailGateway,
  SmsGateway,
  SmtpGateway,
  WebhookSmsGateway,
} from './gateways';

@Global()
@Module({
  providers: [
    ConsoleGateway,
    {
      provide: EmailGateway,
      inject: [ENV, ConsoleGateway],
      useFactory: (env: Env, console: ConsoleGateway) => {
        if (env.DELIVERY_MODE !== 'live') return console;
        const smtp = new SmtpGateway(env);
        return env.DELIVERY_LOG_COPY ? new LoggingEmailGateway(smtp, console) : smtp;
      },
    },
    {
      provide: SmsGateway,
      inject: [ENV, ConsoleGateway],
      useFactory: (env: Env, console: ConsoleGateway) =>
        env.DELIVERY_MODE === 'live' ? new WebhookSmsGateway(env) : new ConsoleSmsGateway(console),
    },
  ],
  exports: [EmailGateway, SmsGateway, ConsoleGateway],
})
export class DeliveryModule {}
