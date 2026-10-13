import { mfaEnrolResponse, sessionResponse, type SessionResponse } from '@iskcon/contracts';
import { request } from './request';

export const authApi = {
  /** Always 202, whether or not the account exists (no account enumeration). */
  requestCode: (identifier: string) =>
    request<{ accepted: true }>('/auth/otp/request', { method: 'POST', body: { identifier }, skipAuthRedirect: true }),
  verifyCode: (identifier: string, code: string): Promise<SessionResponse> =>
    request('/auth/otp/verify', { method: 'POST', body: { identifier, code }, schema: sessionResponse, skipAuthRedirect: true }),
  session: (): Promise<SessionResponse> => request('/auth/session', { schema: sessionResponse }),
  logout: () => request<void>('/auth/logout', { method: 'POST', skipAuthRedirect: true }),
  mfaEnrol: () => request('/auth/mfa/enrol', { method: 'POST', schema: mfaEnrolResponse, skipAuthRedirect: true }),
  mfaConfirmEnrol: (code: string): Promise<SessionResponse> =>
    request('/auth/mfa/enrol/confirm', { method: 'POST', body: { code }, schema: sessionResponse, skipAuthRedirect: true }),
  mfaVerify: (code: string): Promise<SessionResponse> =>
    request('/auth/mfa/verify', { method: 'POST', body: { code }, schema: sessionResponse, skipAuthRedirect: true }),
};
