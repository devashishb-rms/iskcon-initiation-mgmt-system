import { and, eq } from 'drizzle-orm';
import { ApplicationWorkflow } from '../src/shared/application-ports';
import { auditLog, outboxEvents, users } from '../src/database/schema';
import { buildWorld, type Client, type TestUser, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: '2026-10-draft-1' };

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 1)]);

describe('documents (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
    w.clock.set('2026-10-14T06:00:00Z');
  });
  afterAll(() => w.close());

  async function userIdByEmail(tenantId: string, email: string): Promise<string> {
    const [u] = await w.db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.email, email)));
    return u!.id;
  }

  async function setup() {
    const t = await w.newTenant('Newtown Temple');
    const mentorU = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
    const otherMentorU = await w.newUser(t, { name: 'Other Mentor', roles: ['MENTOR'] });
    const committeeU = await w.newUser(t, { name: 'Committee', roles: ['COMMITTEE'] });
    const presidentU = await w.newUser(t, { name: 'President', roles: ['PRESIDENT'] });
    const adminU = await w.newUser(t, { name: 'Admin', roles: ['ADMIN'] });
    const [mentor, otherMentor, committee, president, admin] = await Promise.all(
      [mentorU, otherMentorU, committeeU, presidentU, adminU].map((u) => w.signIn(t, u)),
    );
    const add = async (name: string, email: string) => {
      const res = await committee!.post('/candidates', { name, email, mentorId: mentorU.id, consent }).expect(201);
      const user: TestUser = { id: await userIdByEmail(t.id, email), name, email, phone: null, roles: ['CANDIDATE'] };
      return { applicationId: res.body.applicationId as string, client: await w.signIn(t, user) };
    };
    const priya = await add('Priya Ghosh', 'priya@example.org');
    const sunita = await add('Sunita Roy', 'sunita@example.org');
    return { t, mentorU, mentor: mentor!, otherMentor: otherMentor!, committee: committee!, president: president!, admin: admin!, priya, sunita };
  }

  const upload = (c: Client, applicationId: string, file: Buffer, filename: string, type = 'ESSAY', mime?: string) =>
    c
      .raw('post', `/applications/${applicationId}/documents`)
      .field('type', type)
      .attach('file', file, { filename, ...(mime ? { contentType: mime } : {}) });

  it('lets a candidate upload to their own file and everyone with access list it', async () => {
    const s = await setup();
    const res = await upload(s.priya.client, s.priya.applicationId, PDF, 'essay.pdf').expect(201);
    expect(res.body).toMatchObject({ type: 'ESSAY', filename: 'essay.pdf', mime: 'application/pdf', sizeBytes: PDF.length, uploadedBy: 'Priya Ghosh' });
    expect(JSON.stringify(res.body)).not.toContain('storage');

    for (const who of [s.priya.client, s.mentor, s.committee, s.president]) {
      const list = (await who.get(`/applications/${s.priya.applicationId}/documents`).expect(200)).body;
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(res.body.id);
    }
    const detail = (await s.committee.get(`/applications/${s.priya.applicationId}`).expect(200)).body;
    expect(detail.documents.map((d: { id: string }) => d.id)).toEqual([res.body.id]);
    expect(detail.actions.canUpload).toBe(true);
    const timeline = (await s.committee.get(`/applications/${s.priya.applicationId}/timeline`).expect(200)).body;
    expect(timeline.find((e: { kind: string }) => e.kind === 'DOCUMENT')).toMatchObject({ actor: 'Priya Ghosh', summary: { code: 'timeline.document.uploaded', params: { type: 'ESSAY' } } });
  });

  it('writes an audit line and an outbox event, with a checksum but no file name', async () => {
    const s = await setup();
    const doc = (await upload(s.mentor, s.priya.applicationId, PDF, 'secret-name.pdf', 'OATH').expect(201)).body;
    const [line] = await w.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'document.uploaded')));
    expect(line).toMatchObject({ entityId: doc.id, applicationId: s.priya.applicationId, actorName: 'Mohan Biswas' });
    expect(line!.detail).toMatchObject({ type: 'OATH', mime: 'application/pdf', sizeBytes: PDF.length });
    expect((line!.detail as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(line!.detail)).not.toContain('secret-name');
    const events = await w.db.select().from(outboxEvents).where(and(eq(outboxEvents.tenantId, s.t.id), eq(outboxEvents.type, 'document.uploaded')));
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ applicationId: s.priya.applicationId, documentId: doc.id, type: 'OATH' });
  });

  it('feeds the checklist: the course certificate turns R-4 from unknown to met, and removing it undoes that', async () => {
    const s = await setup();
    const p = `/applications/${s.priya.applicationId}`;
    await s.committee.patch(`${p}/facts`, { courseComplete: true }).expect(200);
    const r4 = async () => (await s.committee.get(p).expect(200)).body.evaluation.items.find((i: { id: string }) => i.id === 'R-4');
    expect(await r4()).toMatchObject({ status: 'UNKNOWN', detail: { code: 'rule.R-4.detail.noCertificate' } });
    const doc = (await upload(s.mentor, s.priya.applicationId, PDF, 'course.pdf', 'COURSE_CERTIFICATE').expect(201)).body;
    expect(await r4()).toMatchObject({ status: 'MET', source: 'UPLOADED_CERTIFICATE' });
    await s.admin.delete(`/documents/${doc.id}`).expect(204);
    expect(await r4()).toMatchObject({ status: 'UNKNOWN' });
  });

  it('keeps one candidate out of another candidate\'s file and a mentor out of unassigned candidates', async () => {
    const s = await setup();
    await upload(s.sunita.client, s.priya.applicationId, PDF, 'x.pdf').expect(404);
    await s.sunita.client.get(`/applications/${s.priya.applicationId}/documents`).expect(404);
    const stranger = await upload(s.otherMentor, s.priya.applicationId, PDF, 'x.pdf').expect(404);
    expect(stranger.body.code).toBe('NOT_FOUND');
    // The president may read everything but has no upload permission.
    await upload(s.president, s.priya.applicationId, PDF, 'x.pdf').expect(403);
    const doc = (await upload(s.priya.client, s.priya.applicationId, PDF, 'mine.pdf').expect(201)).body;
    await s.sunita.client.get(`/documents/${doc.id}/file`).expect(404);
    await s.otherMentor.get(`/documents/${doc.id}/file`).expect(404);
    await s.sunita.client.delete(`/documents/${doc.id}`).expect(404);
  });

  it('decides the type by magic bytes, not by the name or the type the client claims', async () => {
    const s = await setup();
    // PNG bytes named .pdf and labelled as PDF: accepted as what it is.
    const png = (await upload(s.priya.client, s.priya.applicationId, PNG, 'scan.pdf', 'ESSAY', 'application/pdf').expect(201)).body;
    expect(png).toMatchObject({ mime: 'image/png', filename: 'scan.png' });
    // An executable renamed .pdf is refused.
    for (const [bytes, name, claimed] of [
      [EXE, 'invoice.pdf', 'application/pdf'],
      [Buffer.from('<html><script>alert(1)</script></html>'), 'page.pdf', 'application/pdf'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.png', 'image/png'],
      [Buffer.alloc(0), 'empty.pdf', 'application/pdf'],
    ] as const) {
      const res = await upload(s.priya.client, s.priya.applicationId, bytes as Buffer, name, 'ESSAY', claimed).expect(415);
      expect(res.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED', status: 415 });
    }
    expect((await s.priya.client.get(`/applications/${s.priya.applicationId}/documents`)).body).toHaveLength(1);
  });

  it('validates the document type field and the presence of a file', async () => {
    const s = await setup();
    const bad = await upload(s.priya.client, s.priya.applicationId, PDF, 'a.pdf', 'PASSPORT').expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    const none = await s.priya.client.raw('post', `/applications/${s.priya.applicationId}/documents`).field('type', 'ESSAY').expect(400);
    expect(none.body.errors[0]).toMatchObject({ path: 'file', code: 'FILE_REQUIRED' });
  });

  it('refuses a file over the size limit with a 413 problem', async () => {
    const s = await setup();
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 1024)]);
    const res = await upload(s.priya.client, s.priya.applicationId, big, 'big.pdf').expect(413);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
    expect((await s.priya.client.get(`/applications/${s.priya.applicationId}/documents`)).body).toHaveLength(0);
  });

  it('cleans file names: no path, no control characters, Bengali names kept', async () => {
    const s = await setup();
    const a = (await upload(s.priya.client, s.priya.applicationId, PDF, '../../etc/passwd.pdf').expect(201)).body;
    expect(a.filename).toBe('passwd.pdf');
    const b = (await upload(s.priya.client, s.priya.applicationId, PDF, 'শংসাপত্র.pdf').expect(201)).body;
    expect(b.filename).toBe('শংসাপত্র.pdf');
    const download = await s.priya.client.get(`/documents/${b.id}/file`).expect(200);
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''%E0%A6/);
  });

  it('streams the stored bytes with attachment, nosniff and no-store headers', async () => {
    const s = await setup();
    const doc = (await upload(s.priya.client, s.priya.applicationId, PNG, 'photo.png').expect(201)).body;
    for (const who of [s.priya.client, s.mentor, s.committee, s.president]) {
      const res = await who
        .get(`/documents/${doc.id}/file`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    }
    const inline = await s.priya.client.get(`/documents/${doc.id}/content`).expect(200);
    expect(inline.headers['content-disposition']).toContain('inline');
    expect(inline.headers['x-content-type-options']).toBe('nosniff');
    await w.anonymous(s.t).get(`/documents/${doc.id}/file`).expect(401);
    await s.priya.client.get('/documents/not-a-uuid/file').expect(400);
  });

  it('removes a document softly: only the uploader or an administrator, audited, gone from the list and the checklist', async () => {
    const s = await setup();
    const doc = (await upload(s.priya.client, s.priya.applicationId, PDF, 'course.pdf', 'COURSE_CERTIFICATE').expect(201)).body;
    await s.committee.delete(`/documents/${doc.id}`).expect(403);
    await s.mentor.delete(`/documents/${doc.id}`).expect(403);
    await s.priya.client.delete(`/documents/${doc.id}`).expect(204);
    await s.priya.client.delete(`/documents/${doc.id}`).expect(404);
    await s.priya.client.get(`/documents/${doc.id}/file`).expect(404);
    expect((await s.committee.get(`/applications/${s.priya.applicationId}/documents`)).body).toEqual([]);
    const lines = await w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'document.deleted')));
    expect(lines).toHaveLength(1);
    const timeline = (await s.committee.get(`/applications/${s.priya.applicationId}/timeline`)).body;
    expect(timeline.map((e: { summary: { code: string } }) => e.summary.code)).toEqual(expect.arrayContaining(['timeline.document.uploaded', 'timeline.document.removed']));

    const second = (await upload(s.mentor, s.priya.applicationId, PDF, 'oath.pdf', 'OATH').expect(201)).body;
    await s.admin.delete(`/documents/${second.id}`).expect(204);
  });

  it('makes documents read-only once the application is closed', async () => {
    const s = await setup();
    const doc = (await upload(s.priya.client, s.priya.applicationId, PDF, 'a.pdf').expect(201)).body;
    await w.asSystem(s.t, () => w.uow.run(() => w.app.get(ApplicationWorkflow).close(s.priya.applicationId, 'WITHDRAWN', 'left')));
    const res = await upload(s.priya.client, s.priya.applicationId, PDF, 'b.pdf').expect(409);
    expect(res.body.code).toBe('CONFLICT');
    await s.priya.client.delete(`/documents/${doc.id}`).expect(409);
    // Still readable.
    await s.priya.client.get(`/documents/${doc.id}/file`).expect(200);
    expect((await s.committee.get(`/applications/${s.priya.applicationId}/documents`)).body).toHaveLength(1);
    const detail = (await s.committee.get(`/applications/${s.priya.applicationId}`)).body;
    expect(detail.actions.canUpload).toBe(false);
  });

  it('shows canUpload only to people who can add documents to that file', async () => {
    const s = await setup();
    const flags = async (c: Client) => (await c.get(`/applications/${s.priya.applicationId}`).expect(200)).body.actions.canUpload;
    expect(await flags(s.priya.client)).toBe(true);
    expect(await flags(s.mentor)).toBe(true);
    expect(await flags(s.committee)).toBe(true);
    expect(await flags(s.president)).toBe(false);
  });

  it('keeps temples apart', async () => {
    const one = await setup();
    const two = await setup();
    const doc = (await upload(one.priya.client, one.priya.applicationId, PDF, 'a.pdf').expect(201)).body;
    await two.committee.get(`/applications/${one.priya.applicationId}/documents`).expect(404);
    await upload(two.committee, one.priya.applicationId, PDF, 'x.pdf').expect(404);
    await two.committee.get(`/documents/${doc.id}/file`).expect(404);
    await two.admin.delete(`/documents/${doc.id}`).expect(404);
    expect((await one.committee.get(`/applications/${one.priya.applicationId}/documents`)).body).toHaveLength(1);
  });
});
