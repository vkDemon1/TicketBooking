export class HttpError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request', details?: any) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details?: any) {
    super(401, message, details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details?: any) {
    super(403, message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: any) {
    super(404, message, details);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict: Seat or resource unavailable', details?: any) {
    super(409, message, details);
  }
}

export class GoneError extends HttpError {
  constructor(message = 'Resource or offer has expired', details?: any) {
    super(410, message, details);
  }
}
