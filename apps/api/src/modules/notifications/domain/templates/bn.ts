import type { Template, TemplateSet } from './types';
import { MESSAGE_CODES as C } from '../notification-kinds';

// Draft wording: the temple should review Bengali and Hindi text before real use (docs/architecture.md section 9).
const by: Record<string, string> = { PRESIDENT: 'মন্দির সভাপতি', GURU: 'গুরুদেবের কার্যালয়' };
const response: Record<string, string> = {
  ACCEPTED: 'গ্রহণ করেছে',
  WAIT: 'অপেক্ষা করতে বলেছে',
  DECLINED: 'গ্রহণ করেনি',
};
const document: Record<string, string> = {
  SHELTER_ACCEPTANCE: 'আশ্রয় গ্রহণের পত্র',
  EXAM_RESULT: 'পরীক্ষার ফলাফল',
  COURSE_CERTIFICATE: 'কোর্সের সনদ',
  ESSAY: 'প্রবন্ধ',
  OATH: 'শপথপত্র',
  BIO_DATA: 'বায়ো-ডাটা',
  OTHER: 'নথি',
};
const word = (table: Record<string, string>, key: string | undefined): string => (key && table[key]) || key || '';
const msg = (subject: string, body: string, sms = subject): ReturnType<Template> => ({ subject, body, sms });

export const bn: TemplateSet = {
  [C.welcome]: () =>
    msg(
      'দীক্ষা কার্যালয়ে স্বাগতম',
      'হরে কৃষ্ণ।\n\nআপনার মন্দির আপনার দীক্ষার পথ প্রস্তুত করেছে। পরবর্তী ধাপগুলি দেখতে এই ইমেল ঠিকানা বা ফোন নম্বর দিয়ে সাইন ইন করুন।',
      'হরে কৃষ্ণ। আপনার দীক্ষার পথ প্রস্তুত। পরবর্তী ধাপ দেখতে সাইন ইন করুন।',
    ),
  [C.mentorAssigned]: (p) =>
    msg(`${p.candidateName}-কে আপনার অধীনে নিযুক্ত করা হয়েছে`, `${p.candidateName}-কে যুক্ত করা হয়েছে এবং আপনি তাঁর মেন্টর। এরপর কী প্রয়োজন তা দেখতে ফাইলটি খুলুন।`),
  [C.fileWaiting]: (p) =>
    msg(`একটি ফাইল অপেক্ষায়: ${p.candidateName}`, `${p.candidateName}-এর ফাইল জমা দেওয়া হয়েছে এবং আপনার সিদ্ধান্তের অপেক্ষায় আছে।`, `আপনার সিদ্ধান্তের অপেক্ষায় একটি ফাইল: ${p.candidateName}।`),
  [C.sentBackStaff]: (p) =>
    msg(
      `ফাইল ফেরত পাঠানো হয়েছে: ${p.candidateName}`,
      `সভাপতি ${p.candidateName}-এর ফাইল আপনার কাছে ফেরত পাঠিয়েছেন।\n\nকারণ: ${p.reason}`,
      `সভাপতি ${p.candidateName}-এর ফাইল ফেরত পাঠিয়েছেন।`,
    ),
  [C.sentBackSelf]: (p) =>
    msg(
      'আপনার ফাইলে আরও প্রস্তুতি প্রয়োজন',
      `আপনার ফাইল আরও প্রস্তুতির জন্য ফেরত পাঠানো হয়েছে।\n\nকারণ: ${p.reason}\n\nঅনুগ্রহ করে আপনার মেন্টরের সঙ্গে কথা বলুন।`,
      'আপনার দীক্ষার ফাইল আরও প্রস্তুতির জন্য ফেরত পাঠানো হয়েছে। অনুগ্রহ করে মেন্টরের সঙ্গে কথা বলুন।',
    ),
  [C.approvedStaff]: (p) =>
    msg(`অনুমোদিত: ${p.candidateName}`, `সভাপতি ${p.candidateName}-এর ফাইল অনুমোদন করেছেন। এখন এটি গুরুদেবের কার্যালয়ে যাবে।`, `সভাপতি ${p.candidateName}-এর ফাইল অনুমোদন করেছেন।`),
  [C.approvedSelf]: () =>
    msg(
      'আপনার ফাইল অনুমোদিত হয়েছে',
      'হরে কৃষ্ণ। মন্দির সভাপতি আপনার ফাইল অনুমোদন করেছেন। এখন এটি গুরুদেবের কার্যালয়ের উত্তরের জন্য যাবে।',
      'হরে কৃষ্ণ। সভাপতি আপনার দীক্ষার ফাইল অনুমোদন করেছেন।',
    ),
  [C.declinedStaff]: (p) =>
    msg(
      `অনুমোদিত হয়নি: ${p.candidateName}`,
      `${p.candidateName}-এর ফাইল ${word(by, p.by)} কর্তৃক প্রত্যাখ্যাত হয়েছে।${p.reason ? `\n\nকারণ: ${p.reason}` : ''}`,
      `${p.candidateName}-এর ফাইল ${word(by, p.by)} কর্তৃক প্রত্যাখ্যাত হয়েছে।`,
    ),
  [C.declinedSelf]: (p) =>
    msg(
      'আপনার ফাইল সম্পর্কে একটি হালনাগাদ',
      `${word(by, p.by)} এই মুহূর্তে আপনার ফাইল অনুমোদন করেননি। এগিয়ে যাওয়ার পথ নিয়ে অনুগ্রহ করে আপনার মেন্টরের সঙ্গে কথা বলুন।`,
      'আপনার দীক্ষার ফাইল সম্পর্কে একটি হালনাগাদ আছে। অনুগ্রহ করে মেন্টরের সঙ্গে কথা বলুন।',
    ),
  [C.guruResponseStaff]: (p) =>
    msg(
      `গুরুদেবের উত্তর: ${p.candidateName}`,
      `গুরুদেবের কার্যালয় ${p.candidateName}-কে ${word(response, p.response)}।`,
      `গুরুদেবের কার্যালয় ${p.candidateName}-কে ${word(response, p.response)}।`,
    ),
  [C.guruResponseSelf]: () =>
    msg('গুরুদেবের উত্তর এসেছে', 'গুরুদেবের কার্যালয় আপনার ফাইলের উত্তর দিয়েছে। পড়তে সাইন ইন করুন।', 'আপনার ফাইলের উপর গুরুদেবের উত্তর এসেছে। পড়তে সাইন ইন করুন।'),
  [C.documentUploaded]: (p) =>
    msg(`নতুন ${word(document, p.documentType)}: ${p.candidateName}`, `${p.candidateName}-এর ফাইলে একটি ${word(document, p.documentType)} আপলোড করা হয়েছে।`),
  [C.ceremonyCompletedStaff]: (p) =>
    msg(`দীক্ষা সম্পন্ন: ${p.candidateName}`, `${p.candidateName} ${p.date} তারিখে দীক্ষা গ্রহণ করেছেন। হরে কৃষ্ণ!`),
  [C.ceremonyCompletedSelf]: (p) =>
    msg(
      'আপনার দীক্ষার অভিনন্দন',
      `হরে কৃষ্ণ। আপনার দীক্ষা ${p.date} তারিখে নথিভুক্ত হয়েছে। আপনার সেবা উত্তরোত্তর বৃদ্ধি পাক।`,
      `হরে কৃষ্ণ। আপনার দীক্ষা ${p.date} তারিখে নথিভুক্ত হয়েছে।`,
    ),
  [C.monthlyNoteDue]: (p) =>
    msg(
      `মাসিক নোট বাকি (${p.count})`,
      `আপনার ${p.count} জন প্রার্থীর মাসিক নোট বাকি আছে, যেমন ${p.names}। অনুগ্রহ করে প্রার্থীর ফাইল থেকে নোটটি লিখুন।`,
      `আপনার ${p.count} জন প্রার্থীর মাসিক নোট বাকি আছে।`,
    ),
  [C.filesWaiting]: (p) =>
    msg(
      `সিদ্ধান্তের অপেক্ষায় ফাইল (${p.count})`,
      `${p.count}টি ফাইল ৭ দিনেরও বেশি সময় ধরে আপনার সিদ্ধান্তের অপেক্ষায় আছে। সবচেয়ে পুরোনোটি ${p.oldestDays} দিন ধরে অপেক্ষায়।`,
      `${p.count}টি ফাইল ৭ দিনের বেশি আপনার সিদ্ধান্তের অপেক্ষায় আছে।`,
    ),
};
