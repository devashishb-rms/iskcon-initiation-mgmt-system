import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Track } from '@iskcon/contracts';
import { DbService } from '../../../database/database.module';
import { ceremonyAttendees, ceremonies } from '../../../database/schema';
import type { Attendee, Ceremony, CeremonyStatus } from '../domain/ceremony';

const cols = {
  id: ceremonies.id,
  guruId: ceremonies.guruId,
  track: ceremonies.track,
  venue: ceremonies.venue,
  date: ceremonies.date,
  status: ceremonies.status,
};

/** The only code that touches `ceremonies` and `ceremony_attendees`. */
@Injectable()
export class CeremoniesRepository {
  constructor(private readonly db: DbService) {}

  async insert(tenantId: string, row: { guruId: string; track: Track; venue: string; date: string }): Promise<Ceremony> {
    const [r] = await this.db.client.insert(ceremonies).values({ tenantId, ...row }).returning(cols);
    return r!;
  }

  /** `lock` holds a row lock to the end of the transaction, so two people cannot change one ceremony at once. */
  async find(tenantId: string, id: string, lock = false): Promise<Ceremony | undefined> {
    const q = this.db.client
      .select(cols)
      .from(ceremonies)
      .where(and(eq(ceremonies.tenantId, tenantId), eq(ceremonies.id, id)))
      .limit(1);
    const [r] = lock ? await q.for('update') : await q;
    return r;
  }

  /** Soonest first; ties by creation time so the order is stable. */
  list(tenantId: string): Promise<Ceremony[]> {
    return this.db.client
      .select(cols)
      .from(ceremonies)
      .where(eq(ceremonies.tenantId, tenantId))
      .orderBy(asc(ceremonies.date), asc(ceremonies.createdAt), asc(ceremonies.id));
  }

  async setStatus(tenantId: string, id: string, status: CeremonyStatus): Promise<void> {
    await this.db.client.update(ceremonies).set({ status }).where(and(eq(ceremonies.tenantId, tenantId), eq(ceremonies.id, id)));
  }

  // ───────── attendees ─────────
  attendeesOf(tenantId: string, ceremonyIds: string[]): Promise<Array<Attendee & { ceremonyId: string }>> {
    if (!ceremonyIds.length) return Promise.resolve([]);
    return this.db.client
      .select({
        ceremonyId: ceremonyAttendees.ceremonyId,
        applicationId: ceremonyAttendees.applicationId,
        present: ceremonyAttendees.present,
        spiritualName: ceremonyAttendees.spiritualName,
      })
      .from(ceremonyAttendees)
      .where(and(eq(ceremonyAttendees.tenantId, tenantId), inArray(ceremonyAttendees.ceremonyId, ceremonyIds)));
  }

  async insertAttendee(tenantId: string, ceremonyId: string, applicationId: string): Promise<void> {
    await this.db.client.insert(ceremonyAttendees).values({ tenantId, ceremonyId, applicationId });
  }

  /** Returns whether a row was removed. */
  async deleteAttendee(tenantId: string, ceremonyId: string, applicationId: string): Promise<boolean> {
    const rows = await this.db.client
      .delete(ceremonyAttendees)
      .where(
        and(
          eq(ceremonyAttendees.tenantId, tenantId),
          eq(ceremonyAttendees.ceremonyId, ceremonyId),
          eq(ceremonyAttendees.applicationId, applicationId),
        ),
      )
      .returning({ id: ceremonyAttendees.applicationId });
    return rows.length > 0;
  }

  async deleteAttendees(tenantId: string, ceremonyId: string): Promise<void> {
    await this.db.client
      .delete(ceremonyAttendees)
      .where(and(eq(ceremonyAttendees.tenantId, tenantId), eq(ceremonyAttendees.ceremonyId, ceremonyId)));
  }

  /** Returns whether the person is attached to this ceremony. */
  async updateAttendee(
    tenantId: string,
    ceremonyId: string,
    applicationId: string,
    patch: { present: boolean; spiritualName?: string },
  ): Promise<boolean> {
    const rows = await this.db.client
      .update(ceremonyAttendees)
      .set({ present: patch.present, ...(patch.spiritualName !== undefined ? { spiritualName: patch.spiritualName } : {}) })
      .where(
        and(
          eq(ceremonyAttendees.tenantId, tenantId),
          eq(ceremonyAttendees.ceremonyId, ceremonyId),
          eq(ceremonyAttendees.applicationId, applicationId),
        ),
      )
      .returning({ id: ceremonyAttendees.applicationId });
    return rows.length > 0;
  }

  /** Which of these applications are attached to a PLANNED ceremony (any ceremony). */
  async attachedToPlanned(tenantId: string, applicationIds: string[]): Promise<Set<string>> {
    if (!applicationIds.length) return new Set();
    const rows = await this.db.client
      .select({ applicationId: ceremonyAttendees.applicationId })
      .from(ceremonyAttendees)
      .innerJoin(ceremonies, and(eq(ceremonies.tenantId, ceremonyAttendees.tenantId), eq(ceremonies.id, ceremonyAttendees.ceremonyId)))
      .where(
        and(
          eq(ceremonyAttendees.tenantId, tenantId),
          inArray(ceremonyAttendees.applicationId, applicationIds),
          eq(ceremonies.status, 'PLANNED'),
        ),
      );
    return new Set(rows.map((r) => r.applicationId));
  }

  /**
   * Serialises attaching one application to ceremonies: two people attaching the same person to two
   * ceremonies at once would otherwise both pass the "not attached elsewhere" check. The lock is
   * released when the transaction ends.
   */
  async lockForAttachment(tenantId: string, applicationId: string): Promise<void> {
    await this.db.client.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ceremony-attach:${tenantId}:${applicationId}`}, 0))`);
  }
}
