import type { Template, TemplateSet } from './types';
import { MESSAGE_CODES as C } from '../notification-kinds';

// Draft wording: the temple should review Bengali and Hindi text before real use (docs/architecture.md section 9).
const by: Record<string, string> = { PRESIDENT: 'मंदिर अध्यक्ष', GURU: 'गुरु कार्यालय' };
const response: Record<string, string> = {
  ACCEPTED: 'को स्वीकार किया है',
  WAIT: 'से प्रतीक्षा करने को कहा है',
  DECLINED: 'को स्वीकार नहीं किया',
};
const document: Record<string, string> = {
  SHELTER_ACCEPTANCE: 'आश्रय स्वीकृति पत्र',
  EXAM_RESULT: 'परीक्षा परिणाम',
  COURSE_CERTIFICATE: 'पाठ्यक्रम प्रमाणपत्र',
  ESSAY: 'निबंध',
  OATH: 'शपथ-पत्र',
  BIO_DATA: 'बायो-डेटा',
  OTHER: 'दस्तावेज़',
};
const word = (table: Record<string, string>, key: string | undefined): string => (key && table[key]) || key || '';
const msg = (subject: string, body: string, sms = subject): ReturnType<Template> => ({ subject, body, sms });

export const hi: TemplateSet = {
  [C.welcome]: () =>
    msg(
      'दीक्षा कार्यालय में आपका स्वागत है',
      'हरे कृष्ण।\n\nआपके मंदिर ने आपका दीक्षा-पथ तैयार कर दिया है। अगले चरण देखने के लिए इस ईमेल पते या फ़ोन नंबर से साइन इन करें।',
      'हरे कृष्ण। आपका दीक्षा-पथ तैयार है। अगले चरण देखने के लिए साइन इन करें।',
    ),
  [C.mentorAssigned]: (p) =>
    msg(`${p.candidateName} को आपके साथ जोड़ा गया है`, `${p.candidateName} को जोड़ा गया है और आप उनके मेंटर हैं। आगे क्या चाहिए, यह देखने के लिए फ़ाइल खोलें।`),
  [C.fileWaiting]: (p) =>
    msg(`एक फ़ाइल प्रतीक्षा में है: ${p.candidateName}`, `${p.candidateName} की फ़ाइल जमा हो गई है और आपके निर्णय की प्रतीक्षा में है।`, `आपके निर्णय की प्रतीक्षा में फ़ाइल: ${p.candidateName}।`),
  [C.sentBackStaff]: (p) =>
    msg(
      `फ़ाइल वापस भेजी गई: ${p.candidateName}`,
      `अध्यक्ष ने ${p.candidateName} की फ़ाइल आपको वापस भेज दी है।\n\nकारण: ${p.reason}`,
      `अध्यक्ष ने ${p.candidateName} की फ़ाइल वापस भेजी है।`,
    ),
  [C.sentBackSelf]: (p) =>
    msg(
      'आपकी फ़ाइल को और तैयारी चाहिए',
      `आपकी फ़ाइल और तैयारी के लिए वापस भेजी गई है।\n\nकारण: ${p.reason}\n\nकृपया अपने मेंटर से बात करें।`,
      'आपकी दीक्षा फ़ाइल और तैयारी के लिए वापस भेजी गई है। कृपया अपने मेंटर से बात करें।',
    ),
  [C.approvedStaff]: (p) =>
    msg(`स्वीकृत: ${p.candidateName}`, `अध्यक्ष ने ${p.candidateName} की फ़ाइल स्वीकृत कर दी है। अब यह गुरु कार्यालय को जाएगी।`, `अध्यक्ष ने ${p.candidateName} की फ़ाइल स्वीकृत की है।`),
  [C.approvedSelf]: () =>
    msg(
      'आपकी फ़ाइल स्वीकृत हुई',
      'हरे कृष्ण। मंदिर अध्यक्ष ने आपकी फ़ाइल स्वीकृत कर दी है। अब यह गुरु कार्यालय के उत्तर के लिए जाएगी।',
      'हरे कृष्ण। अध्यक्ष ने आपकी दीक्षा फ़ाइल स्वीकृत की है।',
    ),
  [C.declinedStaff]: (p) =>
    msg(
      `स्वीकृत नहीं: ${p.candidateName}`,
      `${p.candidateName} की फ़ाइल ${word(by, p.by)} द्वारा अस्वीकार की गई है।${p.reason ? `\n\nकारण: ${p.reason}` : ''}`,
      `${p.candidateName} की फ़ाइल ${word(by, p.by)} द्वारा अस्वीकार की गई है।`,
    ),
  [C.declinedSelf]: (p) =>
    msg(
      'आपकी फ़ाइल पर एक सूचना',
      `${word(by, p.by)} ने इस समय आपकी फ़ाइल स्वीकृत नहीं की है। आगे के मार्ग के बारे में कृपया अपने मेंटर से बात करें।`,
      'आपकी दीक्षा फ़ाइल पर एक सूचना है। कृपया अपने मेंटर से बात करें।',
    ),
  [C.guruResponseStaff]: (p) =>
    msg(
      `गुरु का उत्तर: ${p.candidateName}`,
      `गुरु कार्यालय ने ${p.candidateName} ${word(response, p.response)}।`,
      `गुरु कार्यालय ने ${p.candidateName} ${word(response, p.response)}।`,
    ),
  [C.guruResponseSelf]: () =>
    msg('गुरु का उत्तर आ गया है', 'गुरु कार्यालय ने आपकी फ़ाइल का उत्तर दिया है। पढ़ने के लिए साइन इन करें।', 'आपकी फ़ाइल पर गुरु का उत्तर आ गया है। पढ़ने के लिए साइन इन करें।'),
  [C.documentUploaded]: (p) =>
    msg(`दस्तावेज़ जोड़ा गया (${word(document, p.documentType)}): ${p.candidateName}`, `${p.candidateName} की फ़ाइल में दस्तावेज़ जोड़ा गया: ${word(document, p.documentType)}।`),
  [C.ceremonyCompletedStaff]: (p) =>
    msg(`दीक्षा संपन्न: ${p.candidateName}`, `${p.candidateName} ने ${p.date} को दीक्षा ग्रहण की। हरे कृष्ण!`),
  [C.ceremonyCompletedSelf]: (p) =>
    msg(
      'आपकी दीक्षा पर बधाई',
      `हरे कृष्ण। आपकी दीक्षा ${p.date} को दर्ज की गई। आपकी सेवा निरंतर बढ़ती रहे।`,
      `हरे कृष्ण। आपकी दीक्षा ${p.date} को दर्ज की गई।`,
    ),
  [C.monthlyNoteDue]: (p) =>
    msg(
      `मासिक नोट बाकी (${p.count})`,
      `आपके ${p.count} प्रत्याशियों का मासिक नोट बाकी है, जैसे ${p.names}। कृपया प्रत्याशी की फ़ाइल से नोट लिखें।`,
      `आपके ${p.count} प्रत्याशियों का मासिक नोट बाकी है।`,
    ),
  [C.filesWaiting]: (p) =>
    msg(
      `निर्णय की प्रतीक्षा में फ़ाइलें (${p.count})`,
      `${p.count} फ़ाइल(ें) 7 दिन से अधिक समय से आपके निर्णय की प्रतीक्षा में हैं। सबसे पुरानी ${p.oldestDays} दिन से प्रतीक्षा में है।`,
      `${p.count} फ़ाइल(ें) 7 दिन से अधिक समय से आपके निर्णय की प्रतीक्षा में हैं।`,
    ),
};
