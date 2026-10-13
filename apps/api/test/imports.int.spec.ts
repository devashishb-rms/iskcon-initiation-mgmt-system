import archiver from 'archiver';
import ExcelJS from 'exceljs';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { CONSENT_VERSION, importRow } from '@iskcon/contracts';
import { candidates, importJobs, userRoles, users } from '../src/database/schema';
import { buildWorld, type Client, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: CONSENT_VERSION };
const fixture = readFileSync(join(__dirname, 'fixtures/imports/aspirants.csv'));
const HEADINGS = 'name,phone,email,groupName,mentorName,guruName,track,shelterDate,practiceSince';
const csv = (...lines: string[]): Buffer => Buffer.from([HEADINGS, ...lines].join('\n'), 'utf8');

describe('spreadsheet import (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
  });
  afterAll(() => w.close());
  beforeEach(() => w.clock.reset());

  type Setup = Awaited<ReturnType<typeof setup>>;

  /** A temple with a mentor and a guru the fixture refers to, and someone who already exists. */
  async function setup() {
    const t = await w.newTenant();
    const mentorU = await w.newUser(t, { name: 'Mohan Biswas', email: 'mohan@example.org', roles: ['MENTOR'] });
    const adminU = await w.newUser(t, { name: 'Admin', roles: ['ADMIN'] });
    await w.newUser(t, { name: 'Already Here', email: 'existing@example.org', roles: ['CANDIDATE'] });
    const admin = await w.signIn(t, adminU);
    const guru = (await admin.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body as { id: string };
    return { t, mentorU, adminU, admin, guru };
  }

  const upload = (client: Client, content: Buffer, filename = 'aspirants.csv', contentType?: string) =>
    client.raw('post', '/imports').attach('file', content, { filename, ...(contentType ? { contentType } : {}) });

  async function preview(s: Setup, content: Buffer = fixture, filename = 'aspirants.csv') {
    const res = await upload(s.admin, content, filename).expect(201);
    return res.body as {
      id: string;
      filename: string;
      totals: { rows: number; ok: number; warnings: number; errors: number };
      results: Array<{ line: number; status: string; messages: Array<{ code: string; params?: Record<string, unknown> }>; row: Record<string, string> }>;
    };
  }
  const resultAt = (p: Awaited<ReturnType<typeof preview>>, line: number) => p.results.find((r) => r.line === line)!;
  const codes = (p: Awaited<ReturnType<typeof preview>>, line: number) => resultAt(p, line).messages.map((m) => m.code);

  async function countCandidates(s: Setup): Promise<number> {
    return (await w.db.select({ id: candidates.id }).from(candidates).where(eq(candidates.tenantId, s.t.id))).length;
  }
  async function candidateNamed(s: Setup, name: string) {
    const [row] = await w.db.select().from(candidates).where(and(eq(candidates.tenantId, s.t.id), eq(candidates.name, name)));
    return row;
  }
  async function zipOf(files: Record<string, Buffer>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, done) {
        chunks.push(chunk);
        done();
      },
    });
    const archive = archiver('zip', { zlib: { level: 9 } });
    const finished = new Promise<void>((resolve, reject) => {
      sink.on('finish', resolve);
      archive.on('error', reject);
    });
    archive.pipe(sink);
    for (const [name, content] of Object.entries(files)) archive.append(content, { name });
    await archive.finalize();
    await finished;
    return Buffer.concat(chunks);
  }

  // ───────────────────────── access ─────────────────────────

  it('is for the administrator only', async () => {
    const s = await setup();
    const roles = ['COMMITTEE', 'MENTOR', 'PRESIDENT', 'CANDIDATE'] as const;
    for (const role of roles) {
      const person = await w.newUser(s.t, { roles: [role] });
      const client = await w.signIn(s.t, person);
      await client.get('/imports/template.csv').expect(403);
      await upload(client, fixture).expect(403);
      await client.post(`/imports/${randomUUID()}/commit`, { consent }).expect(403);
    }
    await w.anonymous(s.t).get('/imports/template.csv').expect(401);
    await s.admin.get('/imports/template.csv').expect(200);
  });

  // ───────────────────────── template ─────────────────────────

  it('serves a template with the contract\'s headings, one example row and a byte-order mark', async () => {
    const s = await setup();
    const res = await s.admin.get('/imports/template.csv').buffer(true).parse((r, cb) => {
      const parts: Buffer[] = [];
      r.on('data', (c: Buffer) => parts.push(c));
      r.on('end', () => cb(null, Buffer.concat(parts)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // eslint-disable-next-line no-irregular-whitespace -- the byte-order mark is what is being stripped
    const lines = body.toString('utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split(',')).toEqual(Object.keys(importRow.shape));
    expect(lines[1]).toContain('Ananya Sen');
  });

  it('accepts its own template filled in', async () => {
    const s = await setup();
    const rows = ['name,phone,email,groupName,mentorName,guruName,track,shelterDate,practiceSince', 'Ananya Sen,9800000000,ananya@example.org,Sunday group,Mohan Biswas,HH Test Swami,FIRST,2025-03-01,2024-01-10'];
    const p = await preview(s, Buffer.from(rows.join('\n')));
    expect(p.totals).toMatchObject({ rows: 1, errors: 0 });
  });

  // ───────────────────────── preview ─────────────────────────

  describe('preview', () => {
    it('checks every row of a CSV and creates nothing', async () => {
      const s = await setup();
      const before = await countCandidates(s);
      const p = await preview(s);

      expect(p.filename).toBe('aspirants.csv');
      expect(p.totals).toEqual({ rows: 12, ok: 2, warnings: 5, errors: 5 });
      expect(p.results.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      expect(resultAt(p, 2)).toMatchObject({ status: 'OK', messages: [] });
      expect(resultAt(p, 3)).toMatchObject({ status: 'OK', messages: [] });
      // The sheet's dates and codes are normalised: day-first dates, lower-case track, phone with spaces.
      expect(resultAt(p, 3).row).toMatchObject({ phone: '+919830022222', mentorName: 'MOHAN@example.org' });
      expect(resultAt(p, 4).row).toMatchObject({ track: 'FIRST', shelterDate: '2025-03-14', practiceSince: '2024-01-10' });
      expect(codes(p, 4)).toEqual(['import.practiceSince.notApplied']);

      expect(resultAt(p, 5)).toMatchObject({ status: 'ERROR' });
      expect(codes(p, 5)).toEqual(['import.email.invalid']);
      expect(resultAt(p, 6).messages).toEqual([{ code: 'import.mentor.unknown', params: { value: 'Nobody Here' } }]);
      expect(resultAt(p, 7).messages).toEqual([{ code: 'import.guru.unknown', params: { value: 'HH Nobody' } }]);
      expect(codes(p, 8)).toEqual(['import.cell.formulaLike']);
      expect(resultAt(p, 9)).toMatchObject({ status: 'WARNING' });
      expect(resultAt(p, 9).messages).toEqual([{ code: 'import.duplicate.inFile', params: { field: 'phone', line: 2 } }]);
      expect(resultAt(p, 10).messages).toEqual([{ code: 'import.duplicate.existing', params: { field: 'email' } }]);
      expect(resultAt(p, 11).messages).toEqual([{ code: 'import.date.future', params: { field: 'shelterDate' } }]);
      expect(codes(p, 12)).toEqual(['import.contact.missing']);
      expect(codes(p, 13)).toEqual(['import.track.invalid']);

      // Nothing was created: no people, no logins.
      expect(await countCandidates(s)).toBe(before);
      const logins = await w.db.select({ email: users.email }).from(users).where(eq(users.tenantId, s.t.id));
      expect(logins.map((l) => l.email)).not.toContain('radharani@example.org');
    });

    it('keeps Bengali and Hindi names exactly as written', async () => {
      const s = await setup();
      const p = await preview(s);
      expect(resultAt(p, 2).row).toMatchObject({ name: 'রাধারাণী দাস', groupName: 'নিউটাউন সঙ্গ' });
      expect(resultAt(p, 3).row).toMatchObject({ name: 'हिमांशु शर्मा', groupName: 'दिल्ली संग' });
    });

    it('reads an xlsx: numbers as text, dates as dates, formulas as their text and never their result', async () => {
      const s = await setup();
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Aspirants');
      sheet.addRow(HEADINGS.split(','));
      sheet.addRow(['কৃষ্ণা দেবী', 9830011111, 'krishna@example.org', '', 'Mohan Biswas', 'HH Test Swami', 'FIRST', new Date(Date.UTC(2025, 2, 1)), '']);
      sheet.addRow([{ formula: 'A2&"x"', result: 'Harmless Result' }, 9830022222, '', '', '', '', '', '', '']);
      sheet.addRow(['=1+1', 9830033333, '', '', '', '', '', '', '']);
      sheet.addRow(['', '', '', '', '', '', '', '', '']);
      sheet.addRow(['Trailing Person', 9830044444, '', '', '', '', '', '', '']);
      const p = await preview(s, Buffer.from(await book.xlsx.writeBuffer()), 'aspirants.xlsx');

      expect(p.totals).toEqual({ rows: 4, ok: 2, warnings: 2, errors: 0 });
      expect(resultAt(p, 2)).toMatchObject({ status: 'OK', row: { name: 'কৃষ্ণা দেবী', phone: '+919830011111', shelterDate: '2025-03-01' } });
      // The formula cell's text, not "Harmless Result".
      expect(resultAt(p, 3).row.name).toBe('=A2&"x"');
      expect(codes(p, 3)).toEqual(['import.cell.formulaLike']);
      expect(resultAt(p, 4).row.name).toBe('=1+1');
      // Blank rows are skipped but line numbers still match the sheet.
      expect(resultAt(p, 6).row.name).toBe('Trailing Person');
    });

    it('keeps cells that look like formulas as plain text, and stores them as they are', async () => {
      const s = await setup();
      const evil = '=HYPERLINK("http://evil.example","click")';
      const p = await preview(s, csv(`"=HYPERLINK(""http://evil.example"",""click"")",9830066666,,,,,,,`, '@SUM(1+1),9830077788,,,,,,,'));
      expect(p.totals).toMatchObject({ rows: 2, errors: 0, warnings: 2 });
      expect(resultAt(p, 2).row.name).toBe(evil);
      expect(codes(p, 2)).toEqual(['import.cell.formulaLike']);
      expect(codes(p, 3)).toEqual(['import.cell.formulaLike']);
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      expect((await candidateNamed(s, evil))?.name).toBe(evil);
    });

    it('matches a mentor by e-mail or exact name, and says when it cannot', async () => {
      const s = await setup();
      await w.newUser(s.t, { name: 'Twin Mentor', email: 'twin1@example.org', roles: ['MENTOR'] });
      await w.newUser(s.t, { name: 'Twin Mentor', email: 'twin2@example.org', roles: ['MENTOR'] });
      const retired = await w.newUser(s.t, { name: 'Retired Mentor', email: 'retired@example.org', roles: ['MENTOR'] });
      await w.db.update(users).set({ active: false }).where(eq(users.id, retired.id));
      const p = await preview(
        s,
        csv(
          'By Name,9830010001,,,Mohan Biswas,,,,',
          'By Email,9830010002,,,mohan@example.org,,,,',
          'By Twin,9830010003,,,Twin Mentor,,,,',
          'By Twin Email,9830010004,,,twin2@example.org,,,,',
          'By Part,9830010005,,,Mohan,,,,',
          'By Retired,9830010006,,,Retired Mentor,,,,',
          'By Student,9830010007,,,existing@example.org,,,,',
        ),
      );
      expect(codes(p, 2)).toEqual([]);
      expect(codes(p, 3)).toEqual([]);
      expect(codes(p, 4)).toEqual(['import.mentor.ambiguous']);
      expect(codes(p, 5)).toEqual([]);
      expect(codes(p, 6)).toEqual(['import.mentor.unknown']);
      expect(codes(p, 7)).toEqual(['import.mentor.unknown']);
      // Only people with the mentor role count, whatever the e-mail.
      expect(codes(p, 8)).toEqual(['import.mentor.unknown']);
    });

    it('records the preview in the audit log', async () => {
      const s = await setup();
      const p = await preview(s);
      const audit = (await s.admin.get('/audit?action=import.previewed').expect(200)).body;
      expect(audit.items).toHaveLength(1);
      expect(audit.items[0]).toMatchObject({
        actorName: 'Admin',
        entityType: 'import',
        entityId: p.id,
        detail: { importJobId: p.id, filename: 'aspirants.csv', rows: 12, ok: 2, warnings: 5, errors: 5 },
      });
    });

    it('stores only what the commit needs, under the temple, and nothing for another temple to see', async () => {
      const s = await setup();
      const other = await setup();
      const p = await preview(s);
      const [job] = await w.db.select().from(importJobs).where(eq(importJobs.id, p.id));
      expect(job).toMatchObject({ tenantId: s.t.id, status: 'PREVIEWED', filename: 'aspirants.csv', createdById: s.adminU.id });
      expect((job!.rows as unknown[]).length).toBe(12);
      await other.admin.post(`/imports/${p.id}/commit`, { consent }).expect(404);
      await other.admin.post(`/imports/${randomUUID()}/commit`, { consent }).expect(404);
    });
  });

  // ───────────────────────── refusals ─────────────────────────

  describe('files that are refused', () => {
    it('refuses a file over 5 MB', async () => {
      const s = await setup();
      const big = Buffer.concat([csv(), Buffer.from('x'.repeat(5 * 1024 * 1024 + 10))]);
      const res = await upload(s.admin, big).expect(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('accepts 2000 rows and refuses 2001', async () => {
      const s = await setup();
      const rows = (n: number) => Array.from({ length: n }, (_, i) => `Person ${i + 1},,p${i + 1}@example.org,,,,,,`);
      const ok = await preview(s, csv(...rows(2000)));
      expect(ok.totals).toEqual({ rows: 2000, ok: 2000, warnings: 0, errors: 0 });
      const res = await upload(s.admin, csv(...rows(2001))).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors[0]).toMatchObject({ path: 'file', code: 'TOO_MANY_ROWS', params: { max: 2000 } });
    });

    it('refuses by content, not by name', async () => {
      const s = await setup();
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
      const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
      const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]);
      const latin1 = Buffer.from('name,phone\nRenée,9830011111\n', 'latin1');
      const text = csv('Plain Person,9830011111,,,,,,,');

      for (const [content, filename] of [
        [png, 'aspirants.csv'],
        [pdf, 'aspirants.csv'],
        [exe, 'aspirants.xlsx'],
        [latin1, 'aspirants.csv'],
        [Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(100, 7)]), 'aspirants.xlsx'], // looks like a zip, is not one
        [text, 'aspirants.txt'], // right content, wrong name
        [text, 'aspirants.xls'],
        [text, 'aspirants'],
      ] as Array<[Buffer, string]>) {
        const res = await upload(s.admin, content, filename).expect(415);
        expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
      }
      // An xlsx that is really a text file under another name is read as what it is.
      const renamed = await upload(s.admin, text, 'renamed.xlsx').expect(201);
      expect(renamed.body.totals.rows).toBe(1);
    });

    it('refuses a zip that is not a workbook and one that would unpack to far too much', async () => {
      const s = await setup();
      const notWorkbook = await zipOf({ 'readme.txt': Buffer.from('hello') });
      await upload(s.admin, notWorkbook, 'aspirants.xlsx').expect(415);

      // 60 MB of zeros compresses to a few kilobytes: a zip bomb in miniature.
      const bomb = await zipOf({ 'xl/worksheets/sheet1.xml': Buffer.alloc(60 * 1024 * 1024) });
      expect(bomb.length).toBeLessThan(1024 * 1024);
      const res = await upload(s.admin, bomb, 'aspirants.xlsx').expect(415);
      expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('refuses a sheet with no name column, no rows, or no file', async () => {
      const s = await setup();
      const noName = await upload(s.admin, Buffer.from('phone,email\n9830011111,a@example.org\n')).expect(400);
      expect(noName.body.errors[0]).toMatchObject({ path: 'file', code: 'MISSING_COLUMN', params: { column: 'name' } });
      const headerOnly = await upload(s.admin, csv()).expect(400);
      expect(headerOnly.body.errors[0].code).toBe('NO_ROWS');
      const blank = await upload(s.admin, Buffer.from('\n\n  \n')).expect(400);
      expect(blank.body.errors[0].code).toBe('NO_ROWS');
      const none = await s.admin.raw('post', '/imports').expect(400);
      expect(none.body.errors[0].code).toBe('FILE_REQUIRED');
    });

    it('understands friendly headings in any order and ignores columns it does not know', async () => {
      const s = await setup();
      const p = await preview(s, Buffer.from('Mobile,Full Name,Notes,Group\n9830011111,Ananya Sen,ignore me,Sunday group\n'));
      expect(p.totals).toMatchObject({ rows: 1, errors: 0 });
      expect(resultAt(p, 2).row).toMatchObject({ name: 'Ananya Sen', phone: '+919830011111', groupName: 'Sunday group' });
    });
  });

  // ───────────────────────── commit ─────────────────────────

  describe('commit', () => {
    it('refuses without the confirmation that consent was collected, and creates nothing', async () => {
      const s = await setup();
      const p = await preview(s);
      const before = await countCandidates(s);
      for (const body of [{}, { consent: {} }, { consent: { accepted: false, version: CONSENT_VERSION } }, { consent: { version: CONSENT_VERSION } }, { consent: { accepted: true } }]) {
        const res = await s.admin.post(`/imports/${p.id}/commit`, body).expect(400);
        expect(res.body.errors[0].code).toBe('CONSENT_REQUIRED');
      }
      const old = await s.admin.post(`/imports/${p.id}/commit`, { consent: { accepted: true, version: 'old' } }).expect(400);
      expect(old.body.errors[0]).toMatchObject({ path: 'consent.version', code: 'CONSENT_REQUIRED' });
      expect(await countCandidates(s)).toBe(before);
      // The job was not used up by the refusals.
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
    });

    it('creates the valid rows with consent, mentor and guru, and reports what it skipped', async () => {
      const s = await setup();
      const p = await preview(s);
      const res = await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      expect(res.body).toMatchObject({ created: 5, skipped: 7 });
      expect(res.body.created + res.body.skipped).toBe(p.totals.rows);
      const reasons = Object.fromEntries(res.body.skippedRows.map((r: { line: number; code: string }) => [r.line, r.code]));
      expect(reasons).toEqual({
        5: 'import.email.invalid',
        6: 'import.mentor.unknown',
        7: 'import.guru.unknown',
        9: 'import.duplicate.inFile',
        10: 'import.duplicate.existing',
        11: 'import.date.future',
        13: 'import.track.invalid',
      });

      // Each created person has recorded consent, their mentor, and a login where there is a contact.
      const radha = (await candidateNamed(s, 'রাধারাণী দাস'))!;
      expect(radha).toMatchObject({ consentVersion: CONSENT_VERSION, mentorId: s.mentorU.id, groupName: 'নিউটাউন সঙ্গ', phone: '+919830011111', email: 'radharani@example.org' });
      expect(radha.consentAt).toBeInstanceOf(Date);
      expect(radha.userId).not.toBeNull();
      const [login] = await w.db.select().from(userRoles).where(eq(userRoles.userId, radha.userId!));
      expect(login!.role).toBe('CANDIDATE');
      expect((await candidateNamed(s, 'हिमांशु शर्मा'))).toMatchObject({ mentorId: s.mentorU.id, phone: '+919830022222' });
      expect((await candidateNamed(s, 'Gopal Krishna'))).toMatchObject({ mentorId: s.mentorU.id });
      expect((await candidateNamed(s, 'No Contact'))).toMatchObject({ userId: null, groupName: 'Sunday group', consentVersion: CONSENT_VERSION });
      for (const notCreated of ['Bad Email', 'Unknown Mentor', 'Unknown Guru', 'Existing Person', 'Future Shelter', 'Bad Track']) {
        expect(await candidateNamed(s, notCreated)).toBeUndefined();
      }
      expect(await countCandidates(s)).toBe(5);

      // The guru and the shelter date are on the file, and the person is in the SHELTER stage.
      const list = (await s.admin.get('/candidates?pageSize=50').expect(200)).body.items as Array<{ name: string; applicationId: string; stage: string; guru: { name: string } | null; mentor: { name: string } | null }>;
      const byName = Object.fromEntries(list.map((i) => [i.name, i]));
      expect(byName['রাধারাণী দাস']).toMatchObject({ stage: 'SHELTER', guru: { name: 'HH Test Swami' }, mentor: { name: 'Mohan Biswas' } });
      expect(byName['Gopal Krishna']).toMatchObject({ stage: 'SHELTER', guru: { name: 'HH Test Swami' } });
      expect(byName['हिमांशु शर्मा']).toMatchObject({ stage: 'ASPIRING', guru: null });
      const detail = (await s.admin.get(`/applications/${byName['Gopal Krishna']!.applicationId}`).expect(200)).body;
      expect(detail.facts).toMatchObject({ shelterDate: '2025-03-14', practiceSince: null });
    });

    it('audits the commit with the job id and consent version, and each person created', async () => {
      const s = await setup();
      const p = await preview(s);
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);

      const committed = (await s.admin.get('/audit?action=import.committed').expect(200)).body.items;
      expect(committed).toHaveLength(1);
      expect(committed[0]).toMatchObject({
        actorName: 'Admin',
        entityId: p.id,
        detail: { importJobId: p.id, consentVersion: CONSENT_VERSION, created: 5, skipped: 7, filename: 'aspirants.csv' },
      });
      const rowsAudit = (await s.admin.get('/audit?action=import.row-created&pageSize=50').expect(200)).body.items;
      expect(rowsAudit).toHaveLength(5);
      expect(rowsAudit.every((a: { applicationId: string | null; detail: { importJobId: string } }) => a.applicationId && a.detail.importJobId === p.id)).toBe(true);
      expect((await s.admin.get('/audit?action=candidate.created&pageSize=50').expect(200)).body.items).toHaveLength(5);
    });

    it('drops the personal data of the job once it is committed', async () => {
      const s = await setup();
      const p = await preview(s);
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      const [job] = await w.db.select().from(importJobs).where(eq(importJobs.id, p.id));
      expect(job).toMatchObject({ status: 'COMMITTED', rows: [] });
      expect(job!.committedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(job!.summary)).not.toContain('radharani');
      expect(job!.summary).toMatchObject({ created: 5, skipped: 7, consentVersion: CONSENT_VERSION });
    });

    it('refuses a second commit with 409', async () => {
      const s = await setup();
      const p = await preview(s);
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      const again = await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(409);
      expect(again.body).toMatchObject({ code: 'CONFLICT', params: { reason: 'ALREADY_COMMITTED' } });
      expect(await countCandidates(s)).toBe(5);
    });

    it('lets only one of two simultaneous commits through', async () => {
      const s = await setup();
      const p = await preview(s);
      const results = await Promise.all([s.admin.post(`/imports/${p.id}/commit`, { consent }), s.admin.post(`/imports/${p.id}/commit`, { consent })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await countCandidates(s)).toBe(5);
    });

    it('refuses to commit a preview older than 24 hours, and works just inside the limit', async () => {
      const s = await setup();
      const now = new Date();
      w.clock.set(now.toISOString());
      const ageJob = (id: string, ms: number) => w.db.update(importJobs).set({ createdAt: new Date(now.getTime() - ms) }).where(eq(importJobs.id, id));

      const stale = await preview(s, csv('Stale Person,9830012001,,,,,,,'));
      await ageJob(stale.id, 24 * 3_600_000 + 1000);
      const res = await s.admin.post(`/imports/${stale.id}/commit`, { consent }).expect(409);
      expect(res.body).toMatchObject({ code: 'CONFLICT', params: { reason: 'EXPIRED' } });
      expect(await candidateNamed(s, 'Stale Person')).toBeUndefined();

      // The next preview empties expired ones of their personal data.
      const next = await preview(s, csv('Another,9830054321,,,,,,,'));
      expect(next.totals.rows).toBe(1);
      const [job] = await w.db.select().from(importJobs).where(eq(importJobs.id, stale.id));
      expect(job).toMatchObject({ status: 'PREVIEWED', rows: [] });
      // The fresh one is untouched.
      expect(((await w.db.select().from(importJobs).where(eq(importJobs.id, next.id)))[0]!.rows as unknown[]).length).toBe(1);

      // A preview made 23 hours 59 minutes ago can still be committed.
      const recent = await preview(s, csv('Recent Person,9830011122,,,,,,,'));
      await ageJob(recent.id, 24 * 3_600_000 - 60_000);
      await s.admin.post(`/imports/${recent.id}/commit`, { consent }).expect(201);
      expect(await candidateNamed(s, 'Recent Person')).toBeDefined();
    });

    it('skips someone who was added between the preview and the commit', async () => {
      const s = await setup();
      const p = await preview(s, csv('Late Duplicate,9830012000,late@example.org,,,,,,', 'Still New,9830013000,,,,,,,'));
      expect(p.totals).toMatchObject({ ok: 2 });
      await w.newUser(s.t, { name: 'Added Meanwhile', email: 'late@example.org', roles: ['CANDIDATE'] });
      const res = await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      expect(res.body).toMatchObject({ created: 1, skipped: 1, skippedRows: [{ line: 2, code: 'import.duplicate.existing', params: { field: 'email' } }] });
    });

    it('skips everyone already imported when the same file is uploaded again', async () => {
      const s = await setup();
      const first = await preview(s);
      await s.admin.post(`/imports/${first.id}/commit`, { consent }).expect(201);
      const second = await preview(s);
      expect(codes(second, 2)).toEqual(['import.duplicate.existing']);
      expect(codes(second, 3)).toEqual(['import.duplicate.existing']);
      const res = await s.admin.post(`/imports/${second.id}/commit`, { consent }).expect(201);
      // Only the person with no phone or e-mail has nothing to be recognised by.
      expect(res.body.created).toBe(1);
      expect(await countCandidates(s)).toBe(6);
    });

    it('lets one bad row fail without undoing the good ones, and without leaving half of itself behind', async () => {
      const s = await setup();
      // Both rows are fine today. The first records a shelter date of today.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const p = await preview(s, csv(`Doomed Row,9830017001,doomed@example.org,,,,FIRST,${today},`, 'Good Row,9830017002,good@example.org,,,,,,'));
      expect(p.totals).toMatchObject({ ok: 2, errors: 0 });
      // By the time of the commit the clock reads two days earlier, so the date is in the future
      // and the candidate service refuses it AFTER it created the person and their login.
      w.clock.set(new Date(Date.now() - 2 * 86_400_000).toISOString());
      const res = await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      expect(res.body).toMatchObject({ created: 1, skipped: 1, skippedRows: [{ line: 2, code: 'import.row.failed', params: { reason: 'DATE_IN_FUTURE' } }] });

      expect(await candidateNamed(s, 'Good Row')).toBeDefined();
      expect(await candidateNamed(s, 'Doomed Row')).toBeUndefined();
      const logins = (await w.db.select({ email: users.email }).from(users).where(eq(users.tenantId, s.t.id))).map((u) => u.email);
      expect(logins).toContain('good@example.org');
      expect(logins).not.toContain('doomed@example.org');
    });

    it('reports a row whose mentor stopped being a mentor after the preview, and still creates the others', async () => {
      const s = await setup();
      const p = await preview(s, csv('With Mentor,9830018001,,,Mohan Biswas,,,,', 'Without Mentor,9830018002,,,,,,,'));
      await w.db.update(users).set({ active: false }).where(eq(users.id, s.mentorU.id));
      const res = await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      expect(res.body).toMatchObject({ created: 1, skipped: 1, skippedRows: [{ line: 2, code: 'import.row.failed', params: { reason: 'NOT_A_MENTOR' } }] });
      expect(await candidateNamed(s, 'Without Mentor')).toBeDefined();
      expect(await candidateNamed(s, 'With Mentor')).toBeUndefined();
    });

    it('sends the new candidates\' welcome and the mentor\'s notice through the usual events', async () => {
      const s = await setup();
      const p = await preview(s, csv('Welcome Me,9830019001,welcome@example.org,,Mohan Biswas,,,,'));
      await s.admin.post(`/imports/${p.id}/commit`, { consent }).expect(201);
      const mentor = await w.signIn(s.t, { id: s.mentorU.id, name: s.mentorU.name, email: s.mentorU.email, phone: null, roles: ['MENTOR'] });
      // The events are delivered by the dispatcher; the test database is shared, so give it a moment.
      let kinds: string[] = [];
      for (let i = 0; i < 30 && !kinds.includes('MENTOR_ASSIGNED'); i += 1) {
        await w.dispatcher.drain(200);
        kinds = (await mentor.get('/notifications').expect(200)).body.items.map((n: { kind: string }) => n.kind);
        if (!kinds.includes('MENTOR_ASSIGNED')) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(kinds).toContain('MENTOR_ASSIGNED');
    });
  });

  it('keeps temples apart: people and mentors of another temple are neither duplicates nor mentors here', async () => {
    const a = await setup();
    const b = await setup();
    await w.newUser(b.t, { name: 'Only In B', email: 'only-in-b@example.org', roles: ['MENTOR'] });
    await w.newUser(a.t, { name: 'Only In A', email: 'only-in-a@example.org', roles: ['MENTOR'] });
    // Same contact details as a person who exists in temple A only.
    const inA = await preview(a, csv('Shared Phone,9830020001,shared@example.org,,Only In A,,,,'));
    await a.admin.post(`/imports/${inA.id}/commit`, { consent }).expect(201);
    const inB = await preview(b, csv('Shared Phone,9830020001,shared@example.org,,only-in-b@example.org,,,,', 'Wrong Temple,9830020002,,,Only In A,,,,'));
    expect(codes(inB, 2)).toEqual([]);
    expect(codes(inB, 3)).toEqual(['import.mentor.unknown']);
    const res = await b.admin.post(`/imports/${inB.id}/commit`, { consent }).expect(201);
    expect(res.body.created).toBe(1);
    expect(await countCandidates(a)).toBe(1);
    expect(await countCandidates(b)).toBe(1);
  });
});
