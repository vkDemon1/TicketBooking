import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';

export interface PromoCodeRecord {
  id: string;
  code: string;
  discount_type: 'PERCENTAGE' | 'FLAT';
  discount_value: number;
  min_order_amount: number;
  max_discount: number | null;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  event_id: string | null;
  is_active: number;
  created_at: string;
}

export class PromoController {
  /**
   * Validate a promo code against a cart and calculate discount
   * Public or Authenticated endpoint (used at checkout)
   */
  static async validate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, eventId, originalAmount } = req.body;

      if (!code || typeof code !== 'string') {
        throw new BadRequestError('Promo code is required.');
      }
      if (typeof originalAmount !== 'number' || originalAmount <= 0) {
        throw new BadRequestError('A valid originalAmount greater than 0 is required.');
      }

      const cleanCode = code.trim().toUpperCase();

      const promo = db.prepare(`
        SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE
      `).get(cleanCode) as PromoCodeRecord | undefined;

      if (!promo) {
        throw new NotFoundError(`Promo code '${cleanCode}' is invalid.`);
      }

      if (!promo.is_active) {
        throw new BadRequestError(`Promo code '${cleanCode}' is currently inactive.`);
      }

      const now = Date.now();
      if (promo.valid_from && new Date(promo.valid_from).getTime() > now) {
        throw new BadRequestError(`Promo code '${cleanCode}' is not active yet.`);
      }

      if (promo.valid_until && new Date(promo.valid_until).getTime() < now) {
        throw new BadRequestError(`Promo code '${cleanCode}' has expired.`);
      }

      if (promo.event_id && eventId && promo.event_id !== eventId) {
        throw new BadRequestError(`Promo code '${cleanCode}' is not applicable to this event.`);
      }

      if (originalAmount < promo.min_order_amount) {
        throw new BadRequestError(
          `Minimum order amount of $${promo.min_order_amount.toFixed(2)} required to use '${cleanCode}'.`
        );
      }

      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        throw new BadRequestError(`Promo code '${cleanCode}' usage limit has been reached.`);
      }

      // Compute discount
      let discountAmount = 0;
      if (promo.discount_type === 'PERCENTAGE') {
        discountAmount = (originalAmount * promo.discount_value) / 100;
        if (promo.max_discount !== null && discountAmount > promo.max_discount) {
          discountAmount = promo.max_discount;
        }
      } else if (promo.discount_type === 'FLAT') {
        discountAmount = Math.min(originalAmount, promo.discount_value);
      }

      // Round to 2 decimals
      discountAmount = Math.round(discountAmount * 100) / 100;
      const netAmount = Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100);

      res.json({
        valid: true,
        promoId: promo.id,
        code: promo.code,
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        maxDiscount: promo.max_discount,
        discountAmount,
        originalAmount,
        netAmount,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List all promo codes (Organizers and Admins)
   */
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      let promos: PromoCodeRecord[] = [];
      if (req.user.role === 'ADMIN') {
        promos = db.prepare(`
          SELECT p.*, e.title as event_title
          FROM promo_codes p
          LEFT JOIN events e ON p.event_id = e.id
          ORDER BY p.created_at DESC
        `).all() as any[];
      } else if (req.user.role === 'ORGANIZER') {
        promos = db.prepare(`
          SELECT p.*, e.title as event_title
          FROM promo_codes p
          LEFT JOIN events e ON p.event_id = e.id
          WHERE p.event_id IS NULL OR p.event_id IN (SELECT id FROM events WHERE organizer_id = ?)
          ORDER BY p.created_at DESC
        `).all(req.user.userId) as any[];
      } else {
        throw new ForbiddenError('Access forbidden.');
      }

      res.json({ promos });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new promo code (Organizers and Admins)
   */
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const {
        code,
        discountType,
        discountValue,
        minOrderAmount = 0,
        maxDiscount = null,
        maxUses = null,
        validFrom = null,
        validUntil = null,
        eventId = null,
      } = req.body;

      if (!code || typeof code !== 'string') {
        throw new BadRequestError('Code is required.');
      }
      if (!['PERCENTAGE', 'FLAT'].includes(discountType)) {
        throw new BadRequestError('discountType must be PERCENTAGE or FLAT.');
      }
      if (typeof discountValue !== 'number' || discountValue <= 0) {
        throw new BadRequestError('discountValue must be a positive number.');
      }
      if (discountType === 'PERCENTAGE' && (discountValue <= 0 || discountValue > 100)) {
        throw new BadRequestError('Percentage discount value must be between 1 and 100.');
      }

      const cleanCode = code.trim().toUpperCase();

      // Check if code already exists
      const existing = db.prepare('SELECT id FROM promo_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
      if (existing) {
        throw new ConflictError(`Promo code '${cleanCode}' already exists.`);
      }

      // If eventId provided and user is ORGANIZER, verify ownership
      if (eventId && req.user.role === 'ORGANIZER') {
        const event = db.prepare('SELECT id, organizer_id FROM events WHERE id = ?').get(eventId) as any;
        if (!event || event.organizer_id !== req.user.userId) {
          throw new ForbiddenError('You can only create promo codes for your own events.');
        }
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO promo_codes (
          id, code, discount_type, discount_value, min_order_amount,
          max_discount, max_uses, uses_count, valid_from, valid_until,
          event_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)
      `).run(
        id,
        cleanCode,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscount,
        maxUses,
        validFrom,
        validUntil,
        eventId
      );

      const created = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
      res.status(201).json({ message: 'Promo code created successfully.', promo: created });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Toggle active state of a promo code
   */
  static async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');
      const { id } = req.params;

      const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id) as PromoCodeRecord | undefined;
      if (!promo) throw new NotFoundError('Promo code not found.');

      if (req.user.role === 'ORGANIZER' && promo.event_id) {
        const event = db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(promo.event_id) as any;
        if (event && event.organizer_id !== req.user.userId) {
          throw new ForbiddenError('Unauthorized.');
        }
      }

      const newActive = promo.is_active ? 0 : 1;
      db.prepare('UPDATE promo_codes SET is_active = ? WHERE id = ?').run(newActive, id);

      res.json({ message: `Promo code ${newActive ? 'activated' : 'deactivated'}.`, isActive: newActive === 1 });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete a promo code
   */
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');
      const { id } = req.params;

      const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id) as PromoCodeRecord | undefined;
      if (!promo) throw new NotFoundError('Promo code not found.');

      if (req.user.role === 'ORGANIZER' && promo.event_id) {
        const event = db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(promo.event_id) as any;
        if (event && event.organizer_id !== req.user.userId) {
          throw new ForbiddenError('Unauthorized.');
        }
      }

      db.prepare('DELETE FROM promo_codes WHERE id = ?').run(id);
      res.json({ message: 'Promo code deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
}
