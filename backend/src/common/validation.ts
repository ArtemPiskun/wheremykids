import { ParseUUIDPipe } from '@nestjs/common';
import { AppError } from './errors';

/** UUID path param pipe that responds with the API error shape instead of Nest's default. */
export const UuidParam = new ParseUUIDPipe({
  exceptionFactory: () => AppError.badRequest('INVALID_ID', 'Identifier must be a UUID'),
});
