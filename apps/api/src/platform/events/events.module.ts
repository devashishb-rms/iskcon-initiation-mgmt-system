import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { EventBus } from './event-bus';
import { OutboxDispatcher } from './outbox-dispatcher';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [EventBus, OutboxDispatcher],
  exports: [EventBus, OutboxDispatcher],
})
export class EventsModule {}
