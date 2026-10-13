import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Problem } from '@iskcon/contracts';
import { AppError } from './errors';
import { RequestContextService } from '../platform/tenancy/request-context';

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Sign in required',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  422: 'Not allowed in this state',
  429: 'Too many requests',
  500: 'Something went wrong',
};

/** One error format for the whole API. Internal details never reach the client. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  constructor(private readonly ctx: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const requestId = this.ctx.peek()?.requestId;

    let body: Problem;
    if (exception instanceof AppError) {
      body = {
        type: `urn:iskcon:problem:${exception.code.toLowerCase()}`,
        status: exception.status,
        code: exception.code,
        title: TITLES[exception.status] ?? 'Error',
        detail: exception.message,
        params: exception.params,
        errors: exception.errors,
        requestId,
      };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === 413 ? 'FILE_TOO_LARGE' : status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'VALIDATION_FAILED';
      body = {
        type: `urn:iskcon:problem:${code.toLowerCase()}`,
        status,
        code,
        title: TITLES[status] ?? 'Error',
        detail: exception.message,
        requestId,
      };
    } else {
      this.log.error({ err: exception, requestId, path: req.url }, 'Unhandled error');
      body = {
        type: 'urn:iskcon:problem:internal',
        status: 500,
        code: 'INTERNAL',
        title: TITLES[500]!,
        requestId,
      };
    }
    res.status(body.status).type('application/problem+json').json(body);
  }
}
