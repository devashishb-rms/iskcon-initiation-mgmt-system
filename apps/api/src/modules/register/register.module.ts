import { Module } from '@nestjs/common';
import { GurusModule } from '../gurus';
import { RegisterCorrectionService } from './application/register-correction.service';
import { RegisterExportService } from './application/register-export.service';
import { RegisterQueryService } from './application/register-query.service';
import { RegisterFacet } from './application/register.facet';
import { RegisterPresenter } from './application/register.presenter';
import { RegisterService } from './application/register.service';
import { RegisterController } from './http/register.controller';
import { RegisterPdfRenderer } from './infrastructure/register-pdf.renderer';
import { RegisterRepository } from './infrastructure/register.repository';

/**
 * The permanent register of initiations. Written only when a ceremony completes (through
 * `RegisterService.createEntries`, inside the ceremony's unit of work); never deleted.
 * It depends on nothing but platform, gurus and audit: it does not know ceremonies exist.
 */
@Module({
  imports: [GurusModule],
  controllers: [RegisterController],
  providers: [
    RegisterRepository,
    RegisterPdfRenderer,
    RegisterPresenter,
    RegisterService,
    RegisterQueryService,
    RegisterCorrectionService,
    RegisterExportService,
    RegisterFacet,
  ],
  exports: [RegisterService],
})
export class RegisterModule {}
