import { Global, Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AuditQueryService } from './application/audit-query.service';
import { AuditRepository } from './infrastructure/audit.repository';
import { AuditController } from './http/audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
