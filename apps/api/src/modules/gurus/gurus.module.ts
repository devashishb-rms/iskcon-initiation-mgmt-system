import { Module } from '@nestjs/common';
import { GurusService } from './application/gurus.service';
import { GurusController } from './http/gurus.controller';
import { GurusRepository } from './infrastructure/gurus.repository';

@Module({
  controllers: [GurusController],
  providers: [GurusService, GurusRepository],
  exports: [GurusService],
})
export class GurusModule {}
