import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/** Reports unexpected errors (non-HTTP or 5xx) to Sentry, then lets Nest answer the client as usual. */
@Catch()
export class SentryFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (!(exception instanceof HttpException) || exception.getStatus() >= 500) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
