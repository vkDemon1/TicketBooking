import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export class AuthController {
  /**
   * Public Registration (strictly creates CUSTOMER accounts)
   */
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        throw new BadRequestError('Email, password, and name are required.');
      }

      if (password.length < 6) {
        throw new BadRequestError('Password must be at least 6 characters.');
      }

      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
      if (existingUser) {
        throw new BadRequestError('An account with this email already exists.');
      }

      const id = uuidv4();
      const passwordHash = await bcrypt.hash(password, 10);
      const role = 'CUSTOMER'; // Security rule: public registration is ALWAYS CUSTOMER

      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, email.toLowerCase(), passwordHash, name, role);

      const user = { userId: id, email: email.toLowerCase(), name, role };
      const token = jwt.sign(user, env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({
        message: 'Account registered successfully.',
        user: { id, email: email.toLowerCase(), name, role },
        token,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Login with email and password
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new BadRequestError('Email and password are required.');
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
      if (!user) {
        throw new UnauthorizedError('Invalid email or password.');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid email or password.');
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

      res.json({
        message: 'Logged in successfully.',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get current authenticated user profile
   */
  static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated.');
      }

      const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.userId) as any;
      if (!user) {
        throw new UnauthorizedError('User account not found.');
      }

      res.json({ user });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Demo fast login switcher for evaluators (configurable via ENABLE_DEMO_LOGIN)
   */
  static async demoLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!env.ENABLE_DEMO_LOGIN) {
        throw new ForbiddenError('Demo login switcher is disabled in this environment.');
      }

      const { role = 'CUSTOMER', email } = req.body;

      let user: any;
      if (email) {
        user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
      } else {
        user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
      }

      if (!user) {
        // Fallback seed user on the fly if DB not yet seeded
        const id = uuidv4();
        const demoEmail = email || `demo_${role.toLowerCase()}@cineconcert.io`;
        const demoName = `Demo ${role}`;
        const hash = await bcrypt.hash('password123', 10);

        db.prepare(`
          INSERT INTO users (id, email, password_hash, name, role)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, demoEmail, hash, demoName, role);

        user = { id, email: demoEmail, name: demoName, role };
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

      res.json({
        message: `Switched to demo account: ${user.name} (${user.role})`,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
}
