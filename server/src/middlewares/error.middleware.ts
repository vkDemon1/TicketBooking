import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
      details: err.details || null,
    });
    return;
  }

  logger.error('Unhandled Server Error:', err);

  res.status(500).json({
    error: 'Internal server error occurred.',
    statusCode: 500,
  });
}
