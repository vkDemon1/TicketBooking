import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication token required.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired authentication token.');
  }
}

export function requireRole(...roles: Array<'ADMIN' | 'ORGANIZER' | 'CUSTOMER'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access forbidden: requires one of [${roles.join(', ')}] roles, but user has '${req.user.role}'.`
      );
    }

    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      req.user = payload;
    } catch {
      // Ignored for optional auth
    }
  }
  next();
}
