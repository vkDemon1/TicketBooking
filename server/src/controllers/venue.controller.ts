import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class VenueController {
  /**
   * List all venues with total capacity
   */
  static async listVenues(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const venues = db.prepare(`
        SELECT v.*, COUNT(s.id) as total_seats
        FROM venues v
        LEFT JOIN seats s ON v.id = s.venue_id AND s.is_active = 1
        GROUP BY v.id
        ORDER BY v.name ASC
      `).all();

      res.json({ venues });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single venue with complete seat layout grid
   */
  static async getVenueById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as any;
      if (!venue) {
        throw new NotFoundError('Venue not found.');
      }

      const seats = db.prepare(`
        SELECT id, venue_id, row_label, seat_number, category, is_active
        FROM seats
        WHERE venue_id = ?
        ORDER BY row_label ASC, seat_number ASC
      `).all(id);

      res.json({ venue, seats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new venue and generate its default seat grid layout [ADMIN ONLY]
   */
  static async createVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, address, city, type, rows, cols, customSeats } = req.body;

      if (!name || !address || !city || !type || !rows || !cols) {
        throw new BadRequestError('Name, address, city, type, rows, and cols are required.');
      }

      if (rows < 1 || rows > 26 || cols < 1 || cols > 40) {
        throw new BadRequestError('Rows must be 1-26 and columns must be 1-40.');
      }

      const venueId = uuidv4();

      const createVenueTxn = db.transaction(() => {
        db.prepare(`
          INSERT INTO venues (id, name, address, city, type, rows, cols)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(venueId, name, address, city, type, rows, cols);

        const insertSeat = db.prepare(`
          INSERT INTO seats (id, venue_id, row_label, seat_number, category, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        // If custom seat categories are provided, use them; otherwise auto-assign smart tiers
        if (Array.isArray(customSeats) && customSeats.length > 0) {
          for (const s of customSeats) {
            insertSeat.run(
              uuidv4(),
              venueId,
              s.row_label,
              s.seat_number,
              s.category || 'STANDARD',
              s.is_active !== undefined ? (s.is_active ? 1 : 0) : 1
            );
          }
        } else {
          // Generate default grid: Row A-Z
          for (let r = 0; r < rows; r++) {
            const rowLabel = String.fromCharCode(65 + r); // A, B, C...
            let defaultCategory = 'STANDARD';

            if (type === 'CINEMA') {
              if (r < Math.max(1, Math.floor(rows * 0.2))) defaultCategory = 'VIP';
              else if (r < Math.floor(rows * 0.6)) defaultCategory = 'PREMIUM';
              else defaultCategory = 'STANDARD';
            } else if (type === 'CONCERT_HALL') {
              if (r < Math.max(1, Math.floor(rows * 0.25))) defaultCategory = 'VIP';
              else if (r < Math.floor(rows * 0.7)) defaultCategory = 'PREMIUM';
              else defaultCategory = 'BALCONY';
            } else {
              // STADIUM
              if (r < 3) defaultCategory = 'VIP';
              else if (r < 8) defaultCategory = 'PREMIUM';
              else defaultCategory = 'STANDARD';
            }

            for (let c = 1; c <= cols; c++) {
              insertSeat.run(uuidv4(), venueId, rowLabel, c, defaultCategory, 1);
            }
          }
        }
      });

      createVenueTxn.immediate();

      const createdVenue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
      const seats = db.prepare('SELECT * FROM seats WHERE venue_id = ? ORDER BY row_label ASC, seat_number ASC').all(venueId);

      res.status(201).json({
        message: 'Venue and seat layout created successfully.',
        venue: createdVenue,
        seats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update seat categories / status in bulk [ADMIN ONLY]
   */
  static async updateSeats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { seats } = req.body; // Array of { id, category, is_active }

      if (!Array.isArray(seats) || seats.length === 0) {
        throw new BadRequestError('Seats array is required.');
      }

      const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(id);
      if (!venue) {
        throw new NotFoundError('Venue not found.');
      }

      const updateTxn = db.transaction(() => {
        const updateStmt = db.prepare(`
          UPDATE seats
          SET category = COALESCE(?, category),
              is_active = COALESCE(?, is_active)
          WHERE id = ? AND venue_id = ?
        `);

        for (const s of seats) {
          updateStmt.run(
            s.category || null,
            s.is_active !== undefined ? (s.is_active ? 1 : 0) : null,
            s.id,
            id
          );
        }
      });

      updateTxn.immediate();

      const updatedSeats = db.prepare('SELECT * FROM seats WHERE venue_id = ? ORDER BY row_label ASC, seat_number ASC').all(id);

      res.json({
        message: 'Venue seats updated successfully.',
        seats: updatedSeats,
      });
    } catch (err) {
      next(err);
    }
  }
}
