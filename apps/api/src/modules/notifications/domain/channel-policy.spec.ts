import { selectChannels, wantedChannels } from './channel-policy';
import { NOTIFICATION_KINDS } from './notification-kinds';

describe('channel policy', () => {
  const both = { email: 'a@example.org', phone: '+919800000001' };

  it('gives every kind a policy that includes the in-app inbox', () => {
    for (const kind of NOTIFICATION_KINDS) expect(wantedChannels(kind)).toContain('IN_APP');
  });

  it('uses all channels for time-critical kinds and in-app plus e-mail for informational ones', () => {
    expect(selectChannels('SENT_BACK', both, true)).toEqual(['IN_APP', 'EMAIL', 'SMS']);
    expect(selectChannels('DOCUMENT_UPLOADED', both, true)).toEqual(['IN_APP', 'EMAIL']);
  });

  it('keeps only the channels the person can be reached on', () => {
    expect(selectChannels('SENT_BACK', { email: 'a@example.org', phone: null }, true)).toEqual(['IN_APP', 'EMAIL']);
    expect(selectChannels('SENT_BACK', { email: null, phone: '+919800000001' }, true)).toEqual(['IN_APP', 'SMS']);
    expect(selectChannels('SENT_BACK', { email: null, phone: null }, true)).toEqual(['IN_APP']);
  });

  it('drops SMS when the deployment has no SMS gateway', () => {
    expect(selectChannels('SENT_BACK', both, false)).toEqual(['IN_APP', 'EMAIL']);
  });
});
