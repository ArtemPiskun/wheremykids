import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './errors';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retry = (body.error.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      if (retry) res.setHeader('Retry-After', String(retry));
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: { error: { code: exception.code, message: exception.message, details: exception.details } },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message: unknown }).message
          : exception.message;
      const code = status === HttpStatus.BAD_REQUEST ? 'VALIDATION_FAILED' : HttpStatus[status] ?? 'HTTP_ERROR';
      return {
        status,
        body: {
          error: {
            code,
            message: Array.isArray(message) ? 'Request validation failed' : String(message),
            details: Array.isArray(message) ? { fields: message } : undefined,
          },
        },
      };
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL', message: 'Internal server error' } },
    };
  }
}
