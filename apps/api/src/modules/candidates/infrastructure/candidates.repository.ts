import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { NoteKind, Stage, Track } from '@iskcon/contracts';
import { DbService } from '../../../database/database.module';
import { applications, applicationStageEvents, candidates, notes } from '../../../database/schema';
import type { ApplicationRecord, ApplicationWithCandidate, CandidateRecord } from '../domain/application';

const candidateCols = {
  id: candidates.id,
  userId: candidates.userId,
  name: candidates.name,
  phone: candidates.phone,
  email: candidates.email,
  groupName: candidates.groupName,
  mentorId: candidates.mentorId,
  consentAt: candidates.consentAt,
  active: candidates.active,
};

export interface ListFilter {
  q?: string;
  stage?: Stage;
  status?: ApplicationRecord['status'];
  track?: Track;
  mentorId?: string;
  guruId?: string;
  /** Restrictions that come from who is asking, not from what they typed. */
  scopeMentorId?: string;
  scopeUserId?: string;
  /** Only applications at these stages. */
  stages?: Stage[];
}

export interface StageEventRow {
  id: string;
  fromStage: Stage | null;
  toStage: Stage;
  actorId: string | null;
  reason: string | null;
  at: Date;
}
export interface NoteRow {
  id: string;
  applicationId: string;
  kind: NoteKind;
  body: string;
  authorId: string;
  createdAt: Date;
}

@Injectable()
export class CandidatesRepository {
  constructor(private readonly db: DbService) {}

  // ───────── candidates ─────────
  async insertCandidate(row: typeof candidates.$inferInsert): Promise<CandidateRecord> {
    const [r] = await this.db.client.insert(candidates).values(row).returning(candidateCols);
    return r!;
  }

  async findCandidate(tenantId: string, id: string): Promise<CandidateRecord | undefined> {
    const [r] = await this.db.client
      .select(candidateCols)
      .from(candidates)
      .where(and(eq(candidates.tenantId, tenantId), eq(candidates.id, id)))
      .limit(1);
    return r;
  }

  // ───────── applications ─────────
  async insertApplication(row: typeof applications.$inferInsert): Promise<ApplicationRecord> {
    const [r] = await this.db.client.insert(applications).values(row).returning();
    return r as ApplicationRecord;
  }

  /** `lock` takes a row lock until the transaction ends, so two people cannot change one file at once. */
  async findApplication(tenantId: string, id: string, lock = false): Promise<ApplicationWithCandidate | undefined> {
    const q = this.db.client
      .select({ app: applications, candidate: candidateCols })
      .from(applications)
      .innerJoin(candidates, and(eq(candidates.tenantId, applications.tenantId), eq(candidates.id, applications.candidateId)))
      .where(and(eq(applications.tenantId, tenantId), eq(applications.id, id)))
      .limit(1);
    const [r] = lock ? await q.for('update', { of: applications }) : await q;
    return r ? ({ ...(r.app as ApplicationRecord), candidate: r.candidate }) : undefined;
  }

  async findApplications(tenantId: string, ids: string[]): Promise<ApplicationWithCandidate[]> {
    if (!ids.length) return [];
    const rows = await this.db.client
      .select({ app: applications, candidate: candidateCols })
      .from(applications)
      .innerJoin(candidates, and(eq(candidates.tenantId, applications.tenantId), eq(candidates.id, applications.candidateId)))
      .where(and(eq(applications.tenantId, tenantId), inArray(applications.id, ids)));
    return rows.map((r) => ({ ...(r.app as ApplicationRecord), candidate: r.candidate }));
  }

  async applicationsOfCandidate(tenantId: string, candidateId: string): Promise<ApplicationRecord[]> {
    const rows = await this.db.client
      .select()
      .from(applications)
      .where(and(eq(applications.tenantId, tenantId), eq(applications.candidateId, candidateId)))
      .orderBy(asc(applications.createdAt));
    return rows as ApplicationRecord[];
  }

  /** The application a signed-in candidate sees as "my path": the open one, else the latest. */
  async currentForUser(tenantId: string, userId: string): Promise<string | undefined> {
    const [r] = await this.db.client
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(candidates, and(eq(candidates.tenantId, applications.tenantId), eq(candidates.id, applications.candidateId)))
      .where(and(eq(applications.tenantId, tenantId), eq(candidates.userId, userId)))
      .orderBy(sql`(${applications.status} = 'OPEN') desc`, desc(applications.createdAt))
      .limit(1);
    return r?.id;
  }

  async updateApplication(
    tenantId: string,
    id: string,
    patch: Partial<Omit<typeof applications.$inferInsert, 'id' | 'tenantId'>>,
  ): Promise<void> {
    await this.db.client
      .update(applications)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(applications.tenantId, tenantId), eq(applications.id, id)));
  }

  async list(
    tenantId: string,
    f: ListFilter,
    page: number,
    pageSize: number,
    order: 'newest' | 'oldest-in-stage' = 'newest',
  ): Promise<{ rows: ApplicationWithCandidate[]; total: number }> {
    const conds: Array<SQL | undefined> = [
      eq(applications.tenantId, tenantId),
      f.stage ? eq(applications.stage, f.stage) : undefined,
      f.stages ? inArray(applications.stage, f.stages) : undefined,
      f.status ? eq(applications.status, f.status) : undefined,
      f.track ? eq(applications.track, f.track) : undefined,
      f.guruId ? eq(applications.guruId, f.guruId) : undefined,
      f.mentorId ? eq(candidates.mentorId, f.mentorId) : undefined,
      f.scopeMentorId ? eq(candidates.mentorId, f.scopeMentorId) : undefined,
      f.scopeUserId ? eq(candidates.userId, f.scopeUserId) : undefined,
      f.q ? or(ilike(candidates.name, `%${escapeLike(f.q)}%`), ilike(candidates.groupName, `%${escapeLike(f.q)}%`)) : undefined,
    ];
    const where = and(...conds);
    const base = this.db.client
      .select({ app: applications, candidate: candidateCols })
      .from(applications)
      .innerJoin(candidates, and(eq(candidates.tenantId, applications.tenantId), eq(candidates.id, applications.candidateId)))
      .where(where);
    const rows = await base
      .orderBy(
        ...(order === 'oldest-in-stage'
          ? [asc(applications.stageSince), asc(applications.id)]
          : [desc(applications.createdAt), asc(applications.id)]),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await this.db.client
      .select({ n: count() })
      .from(applications)
      .innerJoin(candidates, and(eq(candidates.tenantId, applications.tenantId), eq(candidates.id, applications.candidateId)))
      .where(where);
    return { rows: rows.map((r) => ({ ...(r.app as ApplicationRecord), candidate: r.candidate })), total: Number(totalRow?.n ?? 0) };
  }

  // ───────── stage events ─────────
  async insertStageEvent(row: typeof applicationStageEvents.$inferInsert): Promise<void> {
    await this.db.client.insert(applicationStageEvents).values(row);
  }

  async stageEvents(tenantId: string, applicationId: string): Promise<StageEventRow[]> {
    const rows = await this.db.client
      .select()
      .from(applicationStageEvents)
      .where(and(eq(applicationStageEvents.tenantId, tenantId), eq(applicationStageEvents.applicationId, applicationId)))
      .orderBy(asc(applicationStageEvents.at));
    return rows as StageEventRow[];
  }

  // ───────── notes ─────────
  async insertNote(row: typeof notes.$inferInsert): Promise<NoteRow> {
    const [r] = await this.db.client.insert(notes).values(row).returning();
    return r as NoteRow;
  }

  async notesOf(tenantId: string, applicationId: string, kinds?: NoteKind[]): Promise<NoteRow[]> {
    const rows = await this.db.client
      .select()
      .from(notes)
      .where(
        and(eq(notes.tenantId, tenantId), eq(notes.applicationId, applicationId), kinds ? inArray(notes.kind, kinds) : undefined),
      )
      .orderBy(desc(notes.createdAt));
    return rows as NoteRow[];
  }
}

/** `%` and `_` typed by a person are literal characters, not wildcards. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
