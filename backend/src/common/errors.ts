import { HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code that clients can switch on. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: HttpStatus,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): AppError {
    return new AppError(code, HttpStatus.BAD_REQUEST, message, details);
  }
  static unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required'): AppError {
    return new AppError(code, HttpStatus.UNAUTHORIZED, message);
  }
  static forbidden(code = 'FORBIDDEN', message = 'Access denied'): AppError {
    return new AppError(code, HttpStatus.FORBIDDEN, message);
  }
  static notFound(code = 'NOT_FOUND', message = 'Resource not found'): AppError {
    return new AppError(code, HttpStatus.NOT_FOUND, message);
  }
  static conflict(code: string, message: string): AppError {
    return new AppError(code, HttpStatus.CONFLICT, message);
  }
  static planLimit(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('PLAN_LIMIT_REACHED', HttpStatus.PAYMENT_REQUIRED, message, details);
  }
  static tooManyRequests(retryAfterSec: number): AppError {
    return new AppError('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'Too many requests', { retryAfterSec });
  }
}
