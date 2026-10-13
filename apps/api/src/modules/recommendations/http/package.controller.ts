import { Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, StreamableFile } from '@nestjs/common';
import type { PackagePreview } from '@iskcon/contracts';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { PackageService } from '../application/package.service';

@Controller('applications/:id/package')
export class PackageController {
  constructor(
    private readonly packages: PackageService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get('preview')
  @RequirePermission('package:export')
  preview(@Param('id', ParseUUIDPipe) id: string): Promise<PackagePreview> {
    return this.uow.run(() => this.packages.preview(id));
  }

  /** The zip is built inside the transaction, so the `package_exports` row and the audit line exist exactly when a package was produced. */
  @Post()
  @HttpCode(200)
  @RequirePermission('package:export')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async export(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const file = await this.uow.run(() => this.packages.export(id));
    return new StreamableFile(file.content, { type: 'application/zip', length: file.content.length, disposition: `attachment; filename="${file.filename}"` });
  }
}
