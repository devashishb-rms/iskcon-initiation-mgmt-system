import type { Template, TemplateSet } from './types';
import { MESSAGE_CODES as C } from '../notification-kinds';

const by: Record<string, string> = { PRESIDENT: 'the temple president', GURU: 'the guru\'s office' };
const response: Record<string, string> = {
  ACCEPTED: 'accepted the candidate',
  WAIT: 'asked the candidate to wait',
  DECLINED: 'declined the candidate',
};
const document: Record<string, string> = {
  SHELTER_ACCEPTANCE: 'shelter acceptance letter',
  EXAM_RESULT: 'exam result',
  COURSE_CERTIFICATE: 'course certificate',
  ESSAY: 'essay',
  OATH: 'oath',
  BIO_DATA: 'bio-data',
  OTHER: 'document',
};
const word = (table: Record<string, string>, key: string | undefined): string => (key && table[key]) || key || '';

const msg = (subject: string, body: string, sms = subject): ReturnType<Template> => ({ subject, body, sms });

export const en: TemplateSet = {
  [C.welcome]: () =>
    msg(
      'Welcome to the initiation office',
      'Hare Krishna.\n\nYour temple has set up your initiation path. Sign in with this email address or phone number to see your next steps.',
      'Hare Krishna. Your initiation path is ready. Sign in to see your next steps.',
    ),
  [C.mentorAssigned]: (p) =>
    msg(`${p.candidateName} has been assigned to you`, `${p.candidateName} has been added and you are the mentor. Open the file to see what is needed next.`),
  [C.fileWaiting]: (p) =>
    msg(`A file is waiting: ${p.candidateName}`, `The file of ${p.candidateName} has been submitted and is waiting for your decision.`, `A file is waiting for your decision: ${p.candidateName}.`),
  [C.sentBackStaff]: (p) =>
    msg(
      `File sent back: ${p.candidateName}`,
      `The president sent the file of ${p.candidateName} back to you.\n\nReason: ${p.reason}`,
      `File of ${p.candidateName} was sent back by the president.`,
    ),
  [C.sentBackSelf]: (p) =>
    msg(
      'Your file needs more work',
      `Your file was sent back for more preparation.\n\nReason: ${p.reason}\n\nPlease speak with your mentor.`,
      'Your initiation file was sent back for more preparation. Please speak with your mentor.',
    ),
  [C.approvedStaff]: (p) =>
    msg(`Approved: ${p.candidateName}`, `The president approved the file of ${p.candidateName}. It now goes to the guru's office.`, `File of ${p.candidateName} was approved by the president.`),
  [C.approvedSelf]: () =>
    msg('Your file was approved', 'Hare Krishna. The temple president approved your file. It now goes to the guru\'s office for their answer.', 'Hare Krishna. The president approved your initiation file.'),
  [C.declinedStaff]: (p) =>
    msg(
      `Not approved: ${p.candidateName}`,
      `The file of ${p.candidateName} was declined by ${word(by, p.by)}.${p.reason ? `\n\nReason: ${p.reason}` : ''}`,
      `File of ${p.candidateName} was declined by ${word(by, p.by)}.`,
    ),
  [C.declinedSelf]: (p) =>
    msg(
      'An update on your file',
      `Your file was not approved by ${word(by, p.by)} at this time. Please speak with your mentor about the way forward.`,
      'There is an update on your initiation file. Please speak with your mentor.',
    ),
  [C.guruResponseStaff]: (p) =>
    msg(
      `Guru's answer: ${p.candidateName}`,
      `The guru's office ${word(response, p.response)}: ${p.candidateName}.`,
      `Guru's office ${word(response, p.response)}: ${p.candidateName}.`,
    ),
  [C.guruResponseSelf]: () =>
    msg('The guru\'s answer has arrived', `The guru's office has answered your file. Sign in to read it.`, 'The guru\'s answer on your file has arrived. Sign in to read it.'),
  [C.documentUploaded]: (p) =>
    msg(`New ${word(document, p.documentType)}: ${p.candidateName}`, `A ${word(document, p.documentType)} was uploaded to the file of ${p.candidateName}.`),
  [C.ceremonyCompletedStaff]: (p) =>
    msg(`Initiated: ${p.candidateName}`, `${p.candidateName} received initiation on ${p.date}. Hare Krishna!`),
  [C.ceremonyCompletedSelf]: (p) =>
    msg('Congratulations on your initiation', `Hare Krishna. Your initiation was recorded on ${p.date}. May your service continue to grow.`, `Hare Krishna. Your initiation was recorded on ${p.date}.`),
  [C.monthlyNoteDue]: (p) =>
    msg(
      `Monthly notes due (${p.count})`,
      `A monthly note is due for ${p.count} of your candidates, among them ${p.names}. Please write it from the candidate's file.`,
      `Monthly notes are due for ${p.count} of your candidates.`,
    ),
  [C.filesWaiting]: (p) =>
    msg(
      `Files waiting for a decision (${p.count})`,
      `${p.count} file(s) have been waiting for your decision for more than 7 days. The oldest has waited ${p.oldestDays} days.`,
      `${p.count} file(s) are waiting for your decision for over 7 days.`,
    ),
};
