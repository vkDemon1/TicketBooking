import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { HoldSweeperService } from '../services/hold-sweeper.service.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export class EventController {
  /**
   * Public list of events with category/city/date/search filtering
   */
  static async listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, city, search, date } = req.query;

      let sql = `
        SELECT 
          e.*,
          v.name as venue_name, v.city as venue_city, v.type as venue_type,
          MIN(esp.price) as min_price,
          MAX(esp.price) as max_price,
          COUNT(es.id) as total_seats,
          SUM(CASE WHEN es.status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_seats
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN event_seat_pricing esp ON esp.event_id = e.id
        LEFT JOIN event_seats es ON es.event_id = e.id
        WHERE e.status = 'PUBLISHED'
      `;

      const params: any[] = [];

      if (category) {
        sql += ` AND e.category = ?`;
        params.push(String(category).toUpperCase());
      }

      if (city) {
        sql += ` AND LOWER(v.city) LIKE ?`;
        params.push(`%${String(city).toLowerCase()}%`);
      }

      if (search) {
        sql += ` AND (LOWER(e.title) LIKE ? OR LOWER(e.description) LIKE ? OR LOWER(v.name) LIKE ?)`;
        const q = `%${String(search).toLowerCase()}%`;
        params.push(q, q, q);
      }

      if (date) {
        sql += ` AND DATE(e.date_time) = DATE(?)`;
        params.push(String(date));
      }

      sql += `
        GROUP BY e.id
        ORDER BY e.date_time ASC
      `;

      const events = db.prepare(sql).all(...params);

      res.json({ events });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single event details with pricing per category
   */
  static async getEventById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const event = db.prepare(`
        SELECT 
          e.*,
          v.name as venue_name, v.address as venue_address, v.city as venue_city, v.type as venue_type,
          v.rows as venue_rows, v.cols as venue_cols,
          u.name as organizer_name
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        JOIN users u ON e.organizer_id = u.id
        WHERE e.id = ?
      `).get(id) as any;

      if (!event) {
        throw new NotFoundError('Event not found.');
      }

      const pricing = db.prepare(`
        SELECT seat_category, price
        FROM event_seat_pricing
        WHERE event_id = ?
        ORDER BY price DESC
      `).all(id);

      const seatStats = db.prepare(`
        SELECT 
          COUNT(*) as total_seats,
          SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_seats,
          SUM(CASE WHEN status = 'HELD' THEN 1 ELSE 0 END) as held_seats,
          SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) as booked_seats,
          SUM(CASE WHEN status = 'WAITLIST_HELD' THEN 1 ELSE 0 END) as waitlist_held_seats
        FROM event_seats
        WHERE event_id = ?
      `).get(id) as any;

      res.json({
        event,
        pricing,
        seatStats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Visual Seat Map Data: Single Source of Truth for Live Seat Statuses
   */
  static async getEventSeats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.userId;

      // 1. Lazy cleanup: check and expire any stale active holds for this event
      HoldSweeperService.expireHoldsInlineForEvent(id);

      // 2. Fetch all seats for this event with pricing and live status
      const seats = db.prepare(`
        SELECT 
          es.id as event_seat_id,
          es.seat_id,
          es.status,
          es.current_hold_id,
          s.row_label,
          s.seat_number,
          s.category,
          s.is_active,
          esp.price,
          sh.user_id as hold_user_id,
          sh.expires_at as hold_expires_at
        FROM event_seats es
        JOIN seats s ON es.seat_id = s.id
        JOIN events e ON es.event_id = e.id
        LEFT JOIN event_seat_pricing esp ON esp.event_id = es.event_id AND esp.seat_category = s.category
        LEFT JOIN seat_holds sh ON es.current_hold_id = sh.id AND sh.status = 'ACTIVE'
        WHERE es.event_id = ?
        ORDER BY s.row_label ASC, s.seat_number ASC
      `).all(id) as any[];

      // Mask other users' hold identifiers for privacy while allowing current user to identify their held seats
      const sanitizedSeats = seats.map(s => {
        const isMyHold = currentUserId && s.hold_user_id === currentUserId && s.status === 'HELD';
        return {
          eventSeatId: s.event_seat_id,
          seatId: s.seat_id,
          row: s.row_label,
          number: s.seat_number,
          category: s.category,
          price: s.price || 0,
          status: s.status,
          isActive: Boolean(s.is_active),
          isMyHold: Boolean(isMyHold),
          holdExpiresAt: isMyHold ? s.hold_expires_at : undefined,
        };
      });

      res.json({ seats: sanitizedSeats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create an Event with Category Pricing and Initialize Event Seats [ORGANIZER ONLY]
   */
  static async createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const {
        venue_id,
        title,
        description,
        category,
        banner_url,
        date_time,
        duration_mins,
        pricing, // Array of { seat_category, price }
      } = req.body;

      if (!venue_id || !title || !description || !category || !date_time || !duration_mins) {
        throw new BadRequestError('Venue, title, description, category, date_time, and duration_mins are required.');
      }

      if (!Array.isArray(pricing) || pricing.length === 0) {
        throw new BadRequestError('Category pricing array is required.');
      }

      const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(venue_id);
      if (!venue) {
        throw new NotFoundError('Selected venue does not exist.');
      }

      const baseSeats = db.prepare('SELECT id, category FROM seats WHERE venue_id = ? AND is_active = 1').all(venue_id) as Array<{ id: string; category: string }>;
      if (baseSeats.length === 0) {
        throw new BadRequestError('Selected venue has no active seats. Please configure the venue layout first.');
      }

      const eventId = uuidv4();

      const createEventTxn = db.transaction(() => {
        // 1. Insert Event
        db.prepare(`
          INSERT INTO events (id, organizer_id, venue_id, title, description, category, banner_url, date_time, duration_mins, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
        `).run(eventId, req.user!.userId, venue_id, title, description, category, banner_url || null, date_time, duration_mins);

        // 2. Insert Category Pricing
        const insertPricing = db.prepare(`
          INSERT INTO event_seat_pricing (id, event_id, seat_category, price)
          VALUES (?, ?, ?, ?)
        `);
        for (const p of pricing) {
          insertPricing.run(uuidv4(), eventId, p.seat_category, parseFloat(p.price));
        }

        // 3. Clone Base Venue Seats into event_seats
        const insertEventSeat = db.prepare(`
          INSERT INTO event_seats (id, event_id, seat_id, status)
          VALUES (?, ?, ?, 'AVAILABLE')
        `);
        for (const s of baseSeats) {
          insertEventSeat.run(uuidv4(), eventId, s.id);
        }
      });

      createEventTxn.immediate();

      const createdEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      res.status(201).json({
        message: 'Event created and seats initialized successfully.',
        event: createdEvent,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Organizer Dashboard Analytics & Event List [ORGANIZER ONLY]
   * Strictly calculates revenue from confirmed bookings (excludes cancelled bookings)
   */
  static async getOrganizerEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      // Query organizer events with confirmed revenue and ticket stats
      const events = db.prepare(`
        SELECT 
          e.*,
          v.name as venue_name, v.city as venue_city, v.type as venue_type,
          COUNT(DISTINCT es.id) as total_seats,
          SUM(CASE WHEN es.status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_seats,
          SUM(CASE WHEN es.status = 'BOOKED' THEN 1 ELSE 0 END) as booked_seats,
          SUM(CASE WHEN es.status = 'HELD' THEN 1 ELSE 0 END) as held_seats,
          SUM(CASE WHEN es.status = 'WAITLIST_HELD' THEN 1 ELSE 0 END) as waitlist_held_seats,
          (
            SELECT COUNT(DISTINCT b.id) 
            FROM bookings b 
            WHERE b.event_id = e.id AND b.status = 'CONFIRMED'
          ) as confirmed_bookings_count,
          (
            SELECT COUNT(bs.id)
            FROM bookings b
            JOIN booking_seats bs ON bs.booking_id = b.id
            WHERE b.event_id = e.id AND b.status = 'CONFIRMED'
          ) as confirmed_tickets_sold,
          (
            SELECT COUNT(bs.id)
            FROM bookings b
            JOIN booking_seats bs ON bs.booking_id = b.id
            WHERE b.event_id = e.id AND b.status = 'CONFIRMED' AND b.is_redeemed = 1
          ) as confirmed_tickets_checked_in,
          (
            SELECT COALESCE(SUM(bs.price_paid), 0)
            FROM bookings b
            JOIN booking_seats bs ON bs.booking_id = b.id
            WHERE b.event_id = e.id AND b.status = 'CONFIRMED'
          ) as total_revenue
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN event_seats es ON es.event_id = e.id
        WHERE e.organizer_id = ?
        GROUP BY e.id
        ORDER BY e.date_time DESC
      `).all(req.user.userId) as any[];

      // Aggregated summary totals
      const totalRevenue = events.reduce((sum, e) => sum + (e.total_revenue || 0), 0);
      const totalTicketsSold = events.reduce((sum, e) => sum + (e.confirmed_tickets_sold || 0), 0);
      const totalCheckedIn = events.reduce((sum, e) => sum + (e.confirmed_tickets_checked_in || 0), 0);
      const totalCapacity = events.reduce((sum, e) => sum + (e.total_seats || 0), 0);
      const overallOccupancy = totalCapacity > 0 ? (totalTicketsSold / totalCapacity) * 100 : 0;
      const overallCheckInRate = totalTicketsSold > 0 ? (totalCheckedIn / totalTicketsSold) * 100 : 0;

      res.json({
        summary: {
          totalRevenue,
          totalTicketsSold,
          totalCheckedIn,
          totalCapacity,
          overallOccupancy: parseFloat(overallOccupancy.toFixed(1)),
          overallCheckInRate: parseFloat(overallCheckInRate.toFixed(1)),
          eventsCount: events.length,
        },
        events,
      });
    } catch (err) {
      next(err);
    }
  }
}
