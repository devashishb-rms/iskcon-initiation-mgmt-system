import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { notifications, outboxEvents, processedEvents, users } from '../src/database/schema';
import { DeliveryWorker, RemindersJob } from '../src/modules/notifications';
import { jobLockName } from '../src/modules/notifications/domain/job-lock';
import { SmsGateway } from '../src/platform/delivery/gateways';
import { EventBus } from '../src/platform/events/event-bus';
import { EVENTS } from '../src/shared/events';
import { buildWorld, type TestUser, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: '2026-10-draft-1' };
const DAY = 86_400_000;

describe('notifications (integration)', () => {
  let w: TestWorld;
  let bus: EventBus;
  let worker: DeliveryWorker;
  let reminders: RemindersJob;

  beforeAll(async () => {
    w = await buildWorld();
    bus = w.app.get(EventBus);
    worker = w.app.get(DeliveryWorker);
    reminders = w.app.get(RemindersJob);
  });
  afterAll(() => w.close());
  beforeEach(() => {
    w.clock.reset();
    w.mail.clear();
    jest.restoreAllMocks();
  });

  type Setup = Awaited<ReturnType<typeof setup>>;

  /** A temple with every role, and one candidate (with a login) assigned to the mentor. */
  async function setup() {
    const t = await w.newTenant();
    const mentor = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
    const otherMentor = await w.newUser(t, { name: 'Other Mentor', roles: ['MENTOR'] });
    const committee1 = await w.newUser(t, { name: 'Committee One', roles: ['COMMITTEE'] });
    const committee2 = await w.newUser(t, { name: 'Committee Two', roles: ['COMMITTEE'] });
    const president1 = await w.newUser(t, { name: 'President One', roles: ['PRESIDENT'] });
    const president2 = await w.newUser(t, { name: 'President Two', roles: ['PRESIDENT'] });
    const admin = await w.newUser(t, { name: 'Admin', roles: ['ADMIN'] });
    const committeeClient = await w.signIn(t, committee1);
    const created = (
      await committeeClient
        .post('/candidates', { name: 'Ananya Sen', email: `ananya-${Math.random().toString(36).slice(2, 8)}@example.org`, mentorId: mentor.id, consent })
        .expect(201)
    ).body as { candidateId: string; applicationId: string };
    const [candidateLogin] = await w.db.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.name, 'Ananya Sen')));
    const candidate: TestUser = { id: candidateLogin!.id, name: 'Ananya Sen', email: candidateLogin!.email!, phone: null, roles: ['CANDIDATE'] };
    // The creation itself sent a welcome and a mentor notice; most tests start from a clean slate.
    await drainAll(t);
    await w.db.delete(notifications).where(eq(notifications.tenantId, t.id));
    w.mail.clear(); // the sign-in code mail is not what these tests look at
    return { t, mentor, otherMentor, committee1, committee2, president1, president2, admin, committeeClient, candidate, ...created };
  }

  /**
   * Delivers the outbox events of one temple and waits until none is pending. The test database is
   * shared, so another run may hold some of these events for a moment (the dispatcher skips locked rows).
   */
  async function drainAll(t: { id: string }): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      await w.dispatcher.drain(200);
      const pending = await w.db.select({ id: outboxEvents.id }).from(outboxEvents).where(and(eq(outboxEvents.tenantId, t.id), eq(outboxEvents.status, 'PENDING')));
      if (!pending.length) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Outbox events stayed pending');
  }

  async function publish(s: Pick<Setup, 't'>, type: string, payload: Record<string, unknown>): Promise<void> {
    await w.asSystem(s.t, () => w.uow.run(() => bus.publish(type, payload)));
    await drainAll(s.t);
  }

  async function rows(s: Pick<Setup, 't'>, filter: { userId?: string; channel?: 'IN_APP' | 'EMAIL' | 'SMS'; kind?: string } = {}) {
    const all = await w.db.select().from(notifications).where(eq(notifications.tenantId, s.t.id)).orderBy(asc(notifications.createdAt), asc(notifications.id));
    return all.filter((r) => (!filter.userId || r.userId === filter.userId) && (!filter.channel || r.channel === filter.channel) && (!filter.kind || r.kind === filter.kind));
  }

  /** Who got an in-app notification of this kind. */
  async function recipientsOf(s: Pick<Setup, 't'>, kind: string): Promise<string[]> {
    return (await rows(s, { channel: 'IN_APP', kind })).map((r) => r.userId).sort();
  }
  const ids = (...people: Array<{ id: string }>): string[] => people.map((p) => p.id).sort();
  const messageOf = (r: { payload: unknown }) => (r.payload as { message: { code: string; params: Record<string, string | number> } }).message;

  /** Sends everything that is due, until nothing is. */
  async function deliverAll(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      const r = await worker.deliverPending(200);
      if (r.sent + r.retrying + r.failed === 0) return;
    }
  }

  // ───────────────────────── the subscribed events ─────────────────────────

  describe('who is told about each event', () => {
    it('welcomes a new candidate with a login and tells the assigned mentor', async () => {
      const t = await w.newTenant();
      const mentor = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
      const committee = await w.newUser(t, { roles: ['COMMITTEE'] });
      const client = await w.signIn(t, committee);
      const { applicationId } = (await client.post('/candidates', { name: 'Ananya Sen', email: 'ananya@example.org', mentorId: mentor.id, consent }).expect(201)).body;
      await drainAll(t);

      const [candidateLogin] = await w.db.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.email, 'ananya@example.org')));
      expect(await recipientsOf({ t }, 'WELCOME')).toEqual([candidateLogin!.id]);
      expect(await recipientsOf({ t }, 'MENTOR_ASSIGNED')).toEqual([mentor.id]);
      const mentorRow = (await rows({ t }, { channel: 'IN_APP', kind: 'MENTOR_ASSIGNED' }))[0]!;
      expect(messageOf(mentorRow)).toEqual({ code: 'notification.mentorAssigned', params: { candidateName: 'Ananya Sen' } });
      expect(mentorRow.payload).toMatchObject({ link: `/applications/${applicationId}` });
      // The committee member who created the candidate hears nothing about it.
      expect((await rows({ t })).some((r) => r.userId === committee.id)).toBe(false);
    });

    it('does not welcome a candidate who has no login', async () => {
      const t = await w.newTenant();
      const mentor = await w.newUser(t, { roles: ['MENTOR'] });
      const committee = await w.newUser(t, { roles: ['COMMITTEE'] });
      const client = await w.signIn(t, committee);
      await client.post('/candidates', { name: 'No Login', mentorId: mentor.id, createLogin: false, consent }).expect(201);
      await drainAll(t);
      expect(await recipientsOf({ t }, 'WELCOME')).toEqual([]);
      expect(await recipientsOf({ t }, 'MENTOR_ASSIGNED')).toEqual([mentor.id]);
    });

    it('tells every active president that a file is waiting, and nobody else', async () => {
      const s = await setup();
      const retired = await w.newUser(s.t, { name: 'Former President', roles: ['PRESIDENT'] });
      await w.db.update(users).set({ active: false }).where(eq(users.id, retired.id));
      await publish(s, EVENTS.applicationSubmitted, { applicationId: s.applicationId });
      expect(await recipientsOf(s, 'APPLICATION_SUBMITTED')).toEqual(ids(s.president1, s.president2));
      const row = (await rows(s, { userId: s.president1.id, channel: 'IN_APP' }))[0]!;
      expect(messageOf(row)).toEqual({ code: 'notification.fileWaiting', params: { candidateName: 'Ananya Sen' } });
      expect(row.payload).toMatchObject({ link: '/queue' });
    });

    it('sends a returned file back to the mentor and the candidate, with the reason, and not to the committee', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'Please complete the essay.' });
      expect(await recipientsOf(s, 'SENT_BACK')).toEqual(ids(s.mentor, s.candidate));
      const mentorMsg = messageOf((await rows(s, { userId: s.mentor.id, channel: 'IN_APP' }))[0]!);
      expect(mentorMsg).toEqual({ code: 'notification.sentBack.staff', params: { candidateName: 'Ananya Sen', reason: 'Please complete the essay.' } });
      const candidateMsg = messageOf((await rows(s, { userId: s.candidate.id, channel: 'IN_APP' }))[0]!);
      expect(candidateMsg).toEqual({ code: 'notification.sentBack.self', params: { reason: 'Please complete the essay.' } });
    });

    it('tells the committee, the mentor and the candidate about an approval, never the person who approved', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      expect(await recipientsOf(s, 'APPROVED')).toEqual(ids(s.committee1, s.committee2, s.mentor, s.candidate));

      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));
      // A second approval, this time published by someone who is also on the committee.
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId, actorId: s.committee2.id });
      expect(await recipientsOf(s, 'APPROVED')).toEqual(ids(s.committee1, s.mentor, s.candidate));
      expect(await rows(s, { userId: s.committee2.id })).toHaveLength(0);
    });

    it('tells the mentor and committee why a file was declined, but gives the candidate no reason', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationDeclined, { applicationId: s.applicationId, by: 'GURU', reason: 'Not at this time.' });
      expect(await recipientsOf(s, 'DECLINED')).toEqual(ids(s.mentor, s.committee1, s.committee2, s.candidate));
      const staff = messageOf((await rows(s, { userId: s.committee1.id, channel: 'IN_APP' }))[0]!);
      expect(staff).toEqual({ code: 'notification.declined.staff', params: { candidateName: 'Ananya Sen', by: 'GURU', reason: 'Not at this time.' } });
      const self = messageOf((await rows(s, { userId: s.candidate.id, channel: 'IN_APP' }))[0]!);
      expect(self).toEqual({ code: 'notification.declined.self', params: { by: 'GURU' } });
      expect(JSON.stringify((await rows(s, { userId: s.candidate.id })).map((r) => r.payload))).not.toContain('Not at this time');
    });

    it('tells committee, mentor and candidate about the guru\'s answer, except the person who recorded it', async () => {
      const s = await setup();
      await publish(s, EVENTS.guruResponded, { applicationId: s.applicationId, response: 'ACCEPTED', actorId: s.committee1.id });
      expect(await recipientsOf(s, 'GURU_RESPONSE')).toEqual(ids(s.committee2, s.mentor, s.candidate));
      expect(messageOf((await rows(s, { userId: s.mentor.id, channel: 'IN_APP' }))[0]!).params).toEqual({ candidateName: 'Ananya Sen', response: 'ACCEPTED' });
    });

    it('tells only the assigned mentor about an upload, and not when the mentor uploaded it', async () => {
      const s = await setup();
      await publish(s, EVENTS.documentUploaded, { applicationId: s.applicationId, documentId: randomUUID(), type: 'ESSAY', actorId: s.candidate.id });
      expect(await recipientsOf(s, 'DOCUMENT_UPLOADED')).toEqual([s.mentor.id]);
      expect(messageOf((await rows(s, { channel: 'IN_APP' }))[0]!).params).toEqual({ candidateName: 'Ananya Sen', documentType: 'ESSAY' });

      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));
      await publish(s, EVENTS.documentUploaded, { applicationId: s.applicationId, documentId: randomUUID(), type: 'ESSAY', actorId: s.mentor.id });
      expect(await rows(s)).toHaveLength(0);
    });

    it('congratulates each initiated candidate with a login and tells their mentor about each of them', async () => {
      const s = await setup();
      // A second candidate, without a login, with the same mentor.
      const second = (await s.committeeClient.post('/candidates', { name: 'Bimal Das', mentorId: s.mentor.id, createLogin: false, consent }).expect(201)).body;
      await drainAll(s.t);
      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));

      await publish(s, EVENTS.ceremonyCompleted, { ceremonyId: randomUUID(), applicationIds: [s.applicationId, second.applicationId], date: '2026-10-10' });
      expect(await recipientsOf(s, 'CEREMONY_COMPLETED')).toEqual(ids(s.mentor, s.mentor, s.candidate));
      const candidateMsg = messageOf((await rows(s, { userId: s.candidate.id, channel: 'IN_APP' }))[0]!);
      expect(candidateMsg).toEqual({ code: 'notification.ceremonyCompleted.self', params: { date: '2026-10-10' } });
      const mentorNames = (await rows(s, { userId: s.mentor.id, channel: 'IN_APP' })).map((r) => messageOf(r).params.candidateName).sort();
      expect(mentorNames).toEqual(['Ananya Sen', 'Bimal Das']);
    });

    it('ignores an event about an application that no longer exists, and does not notify an inactive mentor', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: randomUUID() });
      expect(await rows(s)).toHaveLength(0);
      await w.db.update(users).set({ active: false }).where(eq(users.id, s.mentor.id));
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'x' });
      expect(await recipientsOf(s, 'SENT_BACK')).toEqual([s.candidate.id]);
    });

    it('is idempotent when an event is delivered again', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      const before = await rows(s);
      expect(before.length).toBeGreaterThan(0);

      // Delivering again does nothing because the dispatcher remembers the handler ran.
      await drainAll(s.t);
      expect(await rows(s)).toHaveLength(before.length);

      // Even if that memory is lost and the event is replayed, the dedupe key stops a duplicate.
      const events = await w.db.select().from(outboxEvents).where(and(eq(outboxEvents.tenantId, s.t.id), eq(outboxEvents.type, EVENTS.applicationApproved)));
      await w.db.delete(processedEvents).where(inArray(processedEvents.eventId, events.map((e) => e.id)));
      await w.db.update(outboxEvents).set({ status: 'PENDING' }).where(inArray(outboxEvents.id, events.map((e) => e.id)));
      await drainAll(s.t);
      expect(await rows(s)).toHaveLength(before.length);
    });

    it('creates a notification again for a new event of the same type (a file sent back twice)', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'first' });
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'second' });
      expect((await rows(s, { userId: s.mentor.id, channel: 'IN_APP' })).map((r) => messageOf(r).params.reason)).toEqual(['first', 'second']);
    });

    it('follows a real submission from the mentor to the president', async () => {
      const s = await setup();
      const mentor = await w.signIn(s.t, s.mentor);
      const admin = await w.signIn(s.t, s.admin);
      const guru = (await admin.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body;
      const p = `/applications/${s.applicationId}`;
      await s.committeeClient.post(`${p}/advance`, { to: 'SHELTER', shelterDate: '2025-03-01' }).expect(201);
      await s.committeeClient.post(`${p}/advance`, { to: 'PREPARING' }).expect(201);
      await s.committeeClient.patch(`${p}/guru`, { guruId: guru.id }).expect(200);
      await mentor.post(`${p}/submit`, { readinessNote: 'Ready.' }).expect(201);
      await drainAll(s.t);
      expect(await recipientsOf(s, 'APPLICATION_SUBMITTED')).toEqual(ids(s.president1, s.president2));
    });
  });

  // ───────────────────────── channels ─────────────────────────

  describe('channel selection', () => {
    async function oneMentorWith(contact: { email: string | null; phone: string | null }, kind: 'DOCUMENT_UPLOADED' | 'SENT_BACK') {
      const s = await setup();
      await w.db.update(users).set({ email: contact.email, phone: contact.phone }).where(eq(users.id, s.mentor.id));
      if (kind === 'SENT_BACK') await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'r' });
      else await publish(s, EVENTS.documentUploaded, { applicationId: s.applicationId, documentId: randomUUID(), type: 'ESSAY' });
      return (await rows(s, { userId: s.mentor.id })).map((r) => r.channel).sort();
    }

    it('uses in-app and e-mail for informational kinds, whatever phone the person has', async () => {
      expect(await oneMentorWith({ email: 'm1@example.org', phone: null }, 'DOCUMENT_UPLOADED')).toEqual(['EMAIL', 'IN_APP']);
      expect(await oneMentorWith({ email: 'm2@example.org', phone: '+919800000002' }, 'DOCUMENT_UPLOADED')).toEqual(['EMAIL', 'IN_APP']);
    });

    it('uses every channel for time-critical kinds, but only those the person can be reached on', async () => {
      expect(await oneMentorWith({ email: 'm3@example.org', phone: '+919800000003' }, 'SENT_BACK')).toEqual(['EMAIL', 'IN_APP', 'SMS']);
      expect(await oneMentorWith({ email: 'm4@example.org', phone: null }, 'SENT_BACK')).toEqual(['EMAIL', 'IN_APP']);
      expect(await oneMentorWith({ email: null, phone: '+919800000005' }, 'SENT_BACK')).toEqual(['IN_APP', 'SMS']);
      expect(await oneMentorWith({ email: null, phone: null }, 'SENT_BACK')).toEqual(['IN_APP']);
    });

    it('skips SMS when the deployment has no SMS gateway configured', async () => {
      const gateway = w.app.get(SmsGateway) as { enabled: boolean };
      gateway.enabled = false;
      try {
        expect(await oneMentorWith({ email: 'm6@example.org', phone: '+919800000006' }, 'SENT_BACK')).toEqual(['EMAIL', 'IN_APP']);
      } finally {
        gateway.enabled = true;
      }
    });

    it('marks the in-app copy delivered at once and leaves e-mail and SMS for the worker', async () => {
      const s = await setup();
      await w.db.update(users).set({ phone: '+919800000007' }).where(eq(users.id, s.mentor.id));
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'r' });
      const byChannel = Object.fromEntries((await rows(s, { userId: s.mentor.id })).map((r) => [r.channel, r.status]));
      expect(byChannel).toEqual({ IN_APP: 'SENT', EMAIL: 'PENDING', SMS: 'PENDING' });
    });
  });

  // ───────────────────────── delivery ─────────────────────────

  describe('delivery', () => {
    it('sends the e-mail and the SMS in the recipient\'s language: Bengali, Hindi, and English as the fallback', async () => {
      const s = await setup();
      await w.db.update(users).set({ locale: 'bn', phone: '+919800000011' }).where(eq(users.id, s.mentor.id));
      await w.db.update(users).set({ locale: 'hi' }).where(eq(users.id, s.committee1.id));
      await w.db.update(users).set({ locale: 'ta' }).where(eq(users.id, s.committee2.id));
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      await deliverAll();

      const mail = (to: string) => w.mail.sent.find((m) => m.channel === 'EMAIL' && m.to === to)!;
      expect(mail(s.mentor.email).subject).toBe('অনুমোদিত: Ananya Sen');
      expect(mail(s.mentor.email).text).toContain('সভাপতি Ananya Sen-এর ফাইল অনুমোদন করেছেন');
      expect(mail(s.committee1.email).subject).toBe('स्वीकृत: Ananya Sen');
      expect(mail(s.committee1.email).text).toContain('अध्यक्ष ने Ananya Sen की फ़ाइल स्वीकृत कर दी है');
      // Tamil is not offered: English.
      expect(mail(s.committee2.email).subject).toBe('Approved: Ananya Sen');
      // The link points into the web app.
      expect(mail(s.mentor.email).text).toMatch(/http:\/\/localhost:3000\/applications\/[0-9a-f-]{36}$/);
      expect((await rows(s, { channel: 'EMAIL' })).every((r) => r.status === 'SENT' && r.attempts === 1 && r.sentAt)).toBe(true);
    });

    it('renders Bengali and Hindi SMS and includes the send-back reason only in e-mail', async () => {
      const s = await setup();
      await w.db.update(users).set({ locale: 'hi', phone: '+919800000012' }).where(eq(users.id, s.mentor.id));
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'Secret detail' });
      await deliverAll();
      const sms = w.mail.sent.find((m) => m.channel === 'SMS' && m.to === '+919800000012')!;
      expect(sms.text).toBe('अध्यक्ष ने Ananya Sen की फ़ाइल वापस भेजी है।');
      expect(sms.text).not.toContain('Secret detail');
      const email = w.mail.sent.find((m) => m.channel === 'EMAIL' && m.to === s.mentor.email)!;
      expect(email.text).toContain('Secret detail');
    });

    it('keeps names and reasons from injecting markup, line breaks or mail headers', async () => {
      const s = await setup();
      const evil = (await s.committeeClient.post('/candidates', { name: 'Eve <b>Bold</b>\r\nBcc: x@example.org', mentorId: s.mentor.id, createLogin: false, consent }).expect(201)).body;
      await drainAll(s.t);
      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));
      await publish(s, EVENTS.applicationSentBack, { applicationId: evil.applicationId, reason: '<script>alert(1)</script>\r\nBcc: attacker@example.org\n\nSecond paragraph' });
      await deliverAll();
      const email = w.mail.sent.find((m) => m.channel === 'EMAIL' && m.to === s.mentor.email)!;
      expect(email.subject).toBe('File sent back: Eve bBold/b Bcc: x@example.org');
      expect(email.text).not.toContain('<');
      expect(email.text).toContain('Reason: scriptalert(1)/script Bcc: attacker@example.org Second paragraph');
      // Only the link is on a line of its own: no injected extra lines in the body.
      expect(email.text.split('\n').filter(Boolean)).toHaveLength(3);
    });

    it('retries a failing send with back-off and gives up as FAILED after five attempts', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      const target = s.mentor.email;
      const original = w.mail.send.bind(w.mail);
      const send = jest.spyOn(w.mail, 'send').mockImplementation(async (m) => {
        if (m.to === target) throw new Error('SMTP unavailable');
        return original(m);
      });
      const row = async () => (await rows(s, { userId: s.mentor.id, channel: 'EMAIL' }))[0]!;

      w.clock.set('2026-10-14T06:00:00Z');
      await deliverAll();
      let r = await row();
      expect(r).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'SMTP unavailable' });
      const firstRetry = new Date((r.payload as { retry: { at: string } }).retry.at).getTime();
      expect(firstRetry - w.clock.now().getTime()).toBe(60_000);

      // Not due yet: nothing is attempted.
      const calls = send.mock.calls.length;
      await deliverAll();
      expect(send.mock.calls.length).toBe(calls);
      expect((await row()).attempts).toBe(1);

      // Back-off grows: 1, 4, 16, 64 minutes.
      const waits = [4, 16, 64];
      for (const [i, minutes] of waits.entries()) {
        w.clock.advanceMinutes(i === 0 ? 1 : waits[i - 1]!);
        await deliverAll();
        r = await row();
        expect(r.attempts).toBe(i + 2);
        if (r.status === 'PENDING') {
          expect(new Date((r.payload as { retry: { at: string } }).retry.at).getTime() - w.clock.now().getTime()).toBe(minutes * 60_000);
        }
      }
      expect(r).toMatchObject({ status: 'PENDING', attempts: 4 });
      w.clock.advanceMinutes(64);
      await deliverAll();
      r = await row();
      expect(r).toMatchObject({ status: 'FAILED', attempts: 5, lastError: 'SMTP unavailable' });
      expect((r.payload as { retry?: unknown }).retry).toBeUndefined();

      // A failed notification is not tried again, and its in-app copy was never affected.
      const afterFailed = send.mock.calls.length;
      w.clock.advanceMinutes(24 * 60);
      await deliverAll();
      expect(send.mock.calls.length).toBe(afterFailed);
      expect((await rows(s, { userId: s.mentor.id, channel: 'IN_APP' }))[0]!.status).toBe('SENT');
    });

    it('delivers on a later attempt after a transient failure', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      const original = w.mail.send.bind(w.mail);
      let failures = 1;
      jest.spyOn(w.mail, 'send').mockImplementation(async (m) => {
        if (m.to === s.mentor.email && failures-- > 0) throw new Error('timeout');
        return original(m);
      });
      w.clock.set('2026-10-14T06:00:00Z');
      await deliverAll();
      w.clock.advanceMinutes(2);
      await deliverAll();
      const r = (await rows(s, { userId: s.mentor.id, channel: 'EMAIL' }))[0]!;
      expect(r).toMatchObject({ status: 'SENT', attempts: 2, lastError: null });
      expect(w.mail.sent.filter((m) => m.to === s.mentor.email)).toHaveLength(1);
    });

    it('fails at once, without retrying, when the person became inactive or lost their address', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      await w.db.update(users).set({ active: false }).where(eq(users.id, s.mentor.id));
      await w.db.update(users).set({ email: null }).where(eq(users.id, s.committee1.id));
      await deliverAll();
      expect((await rows(s, { userId: s.mentor.id, channel: 'EMAIL' }))[0]).toMatchObject({ status: 'FAILED', lastError: 'RECIPIENT_UNAVAILABLE', attempts: 1 });
      expect((await rows(s, { userId: s.committee1.id, channel: 'EMAIL' }))[0]).toMatchObject({ status: 'FAILED', lastError: 'NO_ADDRESS' });
      expect(w.mail.sent.some((m) => m.to === s.mentor.email)).toBe(false);
    });

    it('leaves rows another worker has locked alone, and sends them once that worker is done', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationApproved, { applicationId: s.applicationId });
      const pool = (w.db as unknown as { $pool: Pool }).$pool;
      const otherWorker = await pool.connect();
      try {
        await otherWorker.query('BEGIN');
        await otherWorker.query("SELECT id FROM notifications WHERE tenant_id = $1 AND channel = 'EMAIL' FOR UPDATE", [s.t.id]);
        await deliverAll();
        expect(w.mail.sent.filter((m) => m.channel === 'EMAIL' && m.to === s.mentor.email)).toHaveLength(0);
        expect((await rows(s, { channel: 'EMAIL' })).every((r) => r.status === 'PENDING')).toBe(true);
        await otherWorker.query('COMMIT');
      } finally {
        otherWorker.release();
      }
      await deliverAll();
      await deliverAll();
      for (const person of [s.mentor, s.committee1, s.committee2, s.candidate]) {
        expect(w.mail.sent.filter((m) => m.channel === 'EMAIL' && m.to === person.email)).toHaveLength(1);
      }
    });
  });

  // ───────────────────────── the inbox ─────────────────────────

  describe('the inbox', () => {
    it('lists only the caller\'s own in-app notifications, newest first, with the unread count in a header', async () => {
      const s = await setup();
      w.clock.set('2026-10-14T06:00:00Z');
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'first' });
      w.clock.advanceMinutes(5);
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'second' });
      w.clock.reset();

      const mentor = await w.signIn(s.t, s.mentor);
      const res = await mentor.get('/notifications').expect(200);
      expect(res.headers['x-unread-count']).toBe('2');
      expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 2 });
      expect(res.body.items.map((i: { message: { params: { reason: string } } }) => i.message.params.reason)).toEqual(['second', 'first']);
      expect(res.body.items[0]).toMatchObject({
        kind: 'SENT_BACK',
        message: { code: 'notification.sentBack.staff' },
        link: `/applications/${s.applicationId}`,
        readAt: null,
      });
      expect(Object.keys(res.body.items[0]).sort()).toEqual(['createdAt', 'id', 'kind', 'link', 'message', 'readAt']);

      // The candidate sees their own two, not the mentor's; nobody else sees anything.
      const candidate = await w.signIn(s.t, s.candidate);
      const mine = await candidate.get('/notifications').expect(200);
      expect(mine.body.total).toBe(2);
      expect(mine.body.items.every((i: { message: { code: string } }) => i.message.code === 'notification.sentBack.self')).toBe(true);
      const committee = await w.signIn(s.t, s.committee2);
      const none = await committee.get('/notifications').expect(200);
      expect(none.body.total).toBe(0);
      expect(none.headers['x-unread-count']).toBe('0');

      // E-mail and SMS copies never appear in the inbox.
      expect((await rows(s, { userId: s.mentor.id })).length).toBeGreaterThan(2);
    });

    it('pages the list', async () => {
      const s = await setup();
      w.clock.set('2026-10-14T06:00:00Z');
      for (const reason of ['a', 'b', 'c']) {
        await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason });
        w.clock.advanceMinutes(1);
      }
      w.clock.reset();
      const mentor = await w.signIn(s.t, s.mentor);
      const page = (await mentor.get('/notifications?page=2&pageSize=2').expect(200)).body;
      expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(page.items.map((i: { message: { params: { reason: string } } }) => i.message.params.reason)).toEqual(['a']);
      await mentor.get('/notifications?pageSize=0').expect(400);
    });

    it('marks one notification read, once, and the unread count follows', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'r' });
      const mentor = await w.signIn(s.t, s.mentor);
      const [item] = (await mentor.get('/notifications').expect(200)).body.items;
      const readAt = new Date(Date.now() + 3_600_000);
      w.clock.set(readAt.toISOString());
      await mentor.post(`/notifications/${item.id}/read`).expect(204);
      const after = await mentor.get('/notifications').expect(200);
      expect(after.headers['x-unread-count']).toBe('0');
      expect(after.body.items[0].readAt).toBe(readAt.toISOString());

      // Reading again is fine and keeps the first read time.
      w.clock.set(new Date(readAt.getTime() + 600_000).toISOString());
      await mentor.post(`/notifications/${item.id}/read`).expect(204);
      expect((await mentor.get('/notifications').expect(200)).body.items[0].readAt).toBe(readAt.toISOString());
    });

    it('reads everything for the caller only, and refuses other people\'s notification ids with 404', async () => {
      const s = await setup();
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'r' });
      const mentor = await w.signIn(s.t, s.mentor);
      const candidate = await w.signIn(s.t, s.candidate);
      const theirs = (await candidate.get('/notifications').expect(200)).body.items[0];
      const emailRowId = (await rows(s, { userId: s.mentor.id, channel: 'EMAIL' }))[0]!.id;

      // Someone else's id, an e-mail row's id and a random id all look the same: not found.
      expect((await mentor.post(`/notifications/${theirs.id}/read`).expect(404)).body.code).toBe('NOT_FOUND');
      await mentor.post(`/notifications/${emailRowId}/read`).expect(404);
      await mentor.post(`/notifications/${randomUUID()}/read`).expect(404);
      await mentor.post('/notifications/not-a-uuid/read').expect(400);

      await mentor.post('/notifications/read-all').expect(204);
      expect((await mentor.get('/notifications').expect(200)).headers['x-unread-count']).toBe('0');
      // The candidate's notification is untouched.
      const still = await candidate.get('/notifications').expect(200);
      expect(still.headers['x-unread-count']).toBe('1');
      expect(still.body.items[0].readAt).toBeNull();
    });

    it('requires sign-in and keeps temples apart', async () => {
      const s = await setup();
      const other = await setup();
      await publish(s, EVENTS.applicationSentBack, { applicationId: s.applicationId, reason: 'r' });
      await w.anonymous(s.t).get('/notifications').expect(401);
      await w.anonymous(s.t).post('/notifications/read-all').expect(401);

      const mentor = await w.signIn(s.t, s.mentor);
      const id = (await mentor.get('/notifications').expect(200)).body.items[0].id;
      // A person of another temple cannot touch it, and has no notifications of their own from this event.
      const outsider = await w.signIn(other.t, other.mentor);
      await outsider.post(`/notifications/${id}/read`).expect(404);
      expect((await outsider.get('/notifications').expect(200)).body.total).toBe(0);
      expect(await rows(other)).toHaveLength(0);
      expect((await mentor.get('/notifications').expect(200)).headers['x-unread-count']).toBe('1');
    });
  });

  // ───────────────────────── reminders ─────────────────────────

  describe('daily reminders', () => {
    const monthly = (s: Pick<Setup, 't'>) => rows(s, { channel: 'IN_APP', kind: 'MONTHLY_NOTE_DUE' });
    const digests = (s: Pick<Setup, 't'>) => rows(s, { channel: 'IN_APP', kind: 'FILES_WAITING' });

    async function toPreparing(s: Setup, applicationId = s.applicationId) {
      const p = `/applications/${applicationId}`;
      await s.committeeClient.post(`${p}/advance`, { to: 'SHELTER', shelterDate: '2025-03-01' }).expect(201);
      await s.committeeClient.post(`${p}/advance`, { to: 'PREPARING' }).expect(201);
    }
    async function submitted(s: Setup) {
      const admin = await w.signIn(s.t, s.admin);
      const guru = (await admin.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body;
      await toPreparing(s);
      await s.committeeClient.patch(`/applications/${s.applicationId}/guru`, { guruId: guru.id }).expect(200);
      const mentor = await w.signIn(s.t, s.mentor);
      await mentor.post(`/applications/${s.applicationId}/submit`, { readinessNote: 'Ready.' }).expect(201);
      return mentor;
    }

    it('reminds a mentor about overdue monthly notes once a day and stops when a note is written', async () => {
      const s = await setup();
      await toPreparing(s);
      const second = (await s.committeeClient.post('/candidates', { name: 'Bimal Das', mentorId: s.mentor.id, createLogin: false, consent }).expect(201)).body;
      await toPreparing(s, second.applicationId);
      // A candidate of another mentor and one still ASPIRING are not this mentor's reminder.
      await s.committeeClient.post('/candidates', { name: 'Still Aspiring', mentorId: s.mentor.id, createLogin: false, consent }).expect(201);
      await drainAll(s.t);
      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));

      const first = await reminders.runForTenant(s.t);
      expect(first.find((r) => r.rule === 'monthly-note-due')).toMatchObject({ skipped: false, failed: false });
      const [row] = await monthly(s);
      expect(row).toMatchObject({ userId: s.mentor.id, kind: 'MONTHLY_NOTE_DUE' });
      expect(messageOf(row!).code).toBe('notification.monthlyNoteDue');
      expect(messageOf(row!).params).toMatchObject({ count: 2 });
      expect(String(messageOf(row!).params.names).split(', ').sort()).toEqual(['Ananya Sen', 'Bimal Das']);
      expect(await rows(s, { userId: s.mentor.id, channel: 'EMAIL', kind: 'MONTHLY_NOTE_DUE' })).toHaveLength(1);
      expect((await digests(s)).length).toBe(0);

      // The same day: nothing new, however often the job runs.
      const again = await reminders.runForTenant(s.t);
      expect(again.every((r) => r.created === 0)).toBe(true);
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(1);

      // The next day the reminder is due again.
      w.clock.set(new Date(w.clock.now().getTime() + DAY).toISOString());
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(2);

      // The mentor writes a note for one candidate. One is still overdue, so the next day brings a count of one.
      w.clock.reset();
      const mentor = await w.signIn(s.t, s.mentor);
      await mentor.post(`/applications/${s.applicationId}/notes`, { kind: 'MONTHLY', body: 'Doing well.' }).expect(201);
      w.clock.set(new Date(Date.now() + 2 * DAY).toISOString());
      await reminders.runForTenant(s.t);
      const latest = (await monthly(s)).at(-1)!;
      expect(messageOf(latest).params).toMatchObject({ count: 1, names: 'Bimal Das' });

      // With both notes written there is nothing to remind about.
      w.clock.reset();
      const mentor2 = await w.signIn(s.t, s.mentor);
      await mentor2.post(`/applications/${second.applicationId}/notes`, { kind: 'MONTHLY', body: 'Regular.' }).expect(201);
      w.clock.set(new Date(Date.now() + 3 * DAY).toISOString());
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(3);

      // Thirty-five days after the notes they are due again.
      w.clock.set(new Date(Date.now() + 37 * DAY).toISOString());
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(4);
      expect(messageOf((await monthly(s)).at(-1)!).params.count).toBe(2);
    });

    it('does not remind a mentor who has nobody in SHELTER or PREPARING, or other mentors\' candidates', async () => {
      const s = await setup();
      await toPreparing(s);
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(1);
      expect((await monthly(s))[0]!.userId).toBe(s.mentor.id);
      expect((await rows(s, { userId: s.otherMentor.id }))).toHaveLength(0);
    });

    it('sends the president a digest only when a file has waited in APPLIED for more than seven days', async () => {
      const s = await setup();
      w.clock.set('2026-10-14T06:00:00Z');
      await submitted(s);
      await drainAll(s.t);
      await w.db.delete(notifications).where(eq(notifications.tenantId, s.t.id));

      // Six days: too early.
      w.clock.set('2026-10-20T06:00:00Z');
      await reminders.runForTenant(s.t);
      expect(await digests(s)).toHaveLength(0);

      // Exactly seven days is not "more than seven".
      w.clock.set('2026-10-21T06:00:00Z');
      await reminders.runForTenant(s.t);
      expect(await digests(s)).toHaveLength(0);

      // Eight days: both presidents get a digest; the committee and the mentor do not.
      w.clock.set('2026-10-22T06:00:00Z');
      const report = await reminders.runForTenant(s.t);
      expect(report.find((r) => r.rule === 'files-waiting')!.created).toBe(4); // 2 presidents x (in-app + e-mail)
      expect((await digests(s)).map((r) => r.userId).sort()).toEqual(ids(s.president1, s.president2));
      expect(messageOf((await digests(s))[0]!)).toEqual({ code: 'notification.filesWaiting', params: { count: 1, oldestDays: 8 } });

      // Same day again: nothing. Next day: a fresh digest.
      await reminders.runForTenant(s.t);
      expect(await digests(s)).toHaveLength(2);
      w.clock.set('2026-10-23T06:00:00Z');
      await reminders.runForTenant(s.t);
      expect(await digests(s)).toHaveLength(4);
      expect(messageOf((await digests(s)).at(-1)!).params.oldestDays).toBe(9);

      // The digest is e-mailed like any other notification.
      await deliverAll();
      expect(w.mail.sent.some((m) => m.channel === 'EMAIL' && m.to === s.president1.email && /Files waiting/.test(m.subject ?? ''))).toBe(true);
    });

    it('uses the temple\'s calendar day, not UTC, to decide what "today" is', async () => {
      const s = await setup();
      await toPreparing(s);
      // 20:00 UTC on the 14th is 01:30 on the 15th in Kolkata; 17:00 UTC on the 14th is 22:30 on the 14th.
      w.clock.set('2026-10-14T17:00:00Z');
      await reminders.runForTenant(s.t);
      w.clock.set('2026-10-14T20:00:00Z');
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(2);
      w.clock.set('2026-10-14T21:00:00Z');
      await reminders.runForTenant(s.t);
      expect(await monthly(s)).toHaveLength(2);
    });

    it('does nothing while another instance holds the lock, then runs normally', async () => {
      const s = await setup();
      await toPreparing(s);
      const pool = (w.db as unknown as { $pool: Pool }).$pool;
      const other = await pool.connect();
      try {
        await other.query('BEGIN');
        await other.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [jobLockName('reminders:monthly-note-due', s.t.id)]);

        const blocked = await reminders.runForTenant(s.t);
        expect(blocked.find((r) => r.rule === 'monthly-note-due')).toMatchObject({ skipped: true, created: 0 });
        // The other rule has its own lock and is not held up.
        expect(blocked.find((r) => r.rule === 'files-waiting')).toMatchObject({ skipped: false });
        expect(await monthly(s)).toHaveLength(0);

        await other.query('COMMIT');
      } finally {
        other.release();
      }
      const free = await reminders.runForTenant(s.t);
      expect(free.find((r) => r.rule === 'monthly-note-due')).toMatchObject({ skipped: false });
      expect(await monthly(s)).toHaveLength(1);
    });

    it('does not let two simultaneous runs create the work twice', async () => {
      const s = await setup();
      await toPreparing(s);
      await Promise.all([reminders.runForTenant(s.t), reminders.runForTenant(s.t)]);
      expect(await monthly(s)).toHaveLength(1);
      expect(await rows(s, { channel: 'EMAIL', kind: 'MONTHLY_NOTE_DUE' })).toHaveLength(1);
    });

    it('reminds in each temple separately', async () => {
      const a = await setup();
      const b = await setup();
      await toPreparing(a);
      await reminders.runForTenant(a.t);
      await reminders.runForTenant(b.t);
      expect(await monthly(a)).toHaveLength(1);
      expect(await rows(b)).toHaveLength(0);
    });
  });
});
