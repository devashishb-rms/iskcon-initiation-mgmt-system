import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@iskcon/contracts';
import { Unauthenticated } from '../../common/errors';

export interface AuthUser {
  id: string;
  name: string;
  roles: Role[];
  locale: string;
  sessionId: string;
  mfaVerified: boolean;
  mfaEnrolled: boolean;
}

/** Everything the code needs to know about the current request, without passing it by hand. */
export interface RequestContext {
  requestId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  user?: AuthUser;
  /** Set for work done by the system itself (outbox handlers, scheduled jobs). */
  system?: boolean;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }
  /** Same as `run` but keeps the surrounding context's request id for correlation. */
  runAsSystem<T>(tenantId: string, fn: () => T, requestId = `system-${Date.now()}`): T {
    return this.als.run({ requestId, tenantId, system: true }, fn);
  }
  peek(): RequestContext | undefined {
    return this.als.getStore();
  }
  current(): RequestContext {
    const c = this.als.getStore();
    if (!c) throw new Error('No request context. Code ran outside a request or a system job.');
    return c;
  }
  get tenantId(): string {
    return this.current().tenantId;
  }
  /** The signed-in person, or a 401. */
  user(): AuthUser {
    const u = this.current().user;
    if (!u) throw new Unauthenticated();
    return u;
  }
  setUser(user: AuthUser): void {
    this.current().user = user;
  }
}
