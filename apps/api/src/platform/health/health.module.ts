import { Controller, Get, Inject, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../access/decorators';
import { DbService } from '../../database/database.module';

/** `/healthz` says the process is up. `/readyz` says it can reach its database. */
@Controller()
class HealthController {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  @Public()
  @Get('healthz')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  async ready(): Promise<{ status: 'ok' }> {
    await this.db.client.execute(sql`select 1`);
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
