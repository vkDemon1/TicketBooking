import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { QrService } from '../services/qr.service.js';
import { emailService } from '../services/email.service.js';
import { socketService } from '../services/socket.service.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError, GoneError } from '../utils/errors.js';

export class WaitlistController {
  /**
   * Join Waitlist queue for a specific event and seat category
   */
  static async joinWaitlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { eventId, seatCategory, seatCount = 1 } = req.body;

      if (!eventId || !seatCategory) {
        throw new BadRequestError('eventId and seatCategory are required.');
      }

      const count = parseInt(String(seatCount), 10);
      if (isNaN(count) || count < 1 || count > 10) {
        throw new BadRequestError('seatCount must be a number between 1 and 10.');
      }

      // Validate event exists
      const event = db.prepare('SELECT id, title FROM events WHERE id = ?').get(eventId);
      if (!event) throw new NotFoundError('Event not found.');

      // Validate category pricing exists
      const pricing = db.prepare('SELECT price FROM event_seat_pricing WHERE event_id = ? AND seat_category = ?').get(eventId, seatCategory);
      if (!pricing) {
        throw new BadRequestError(`Category '${seatCategory}' is not offered for this event.`);
      }

      // Check for existing active waitlist entry (prevent duplicates)
      const existingEntry = db.prepare(`
        SELECT id, status FROM waitlist_entries
        WHERE event_id = ? AND user_id = ? AND seat_category = ? AND status IN ('WAITING', 'OFFERED')
      `).get(eventId, req.user.userId, seatCategory);

      if (existingEntry) {
        throw new ConflictError(`You already have an active waitlist entry for the ${seatCategory} category in this event.`);
      }

      const entryId = uuidv4();
      db.prepare(`
        INSERT INTO waitlist_entries (id, event_id, user_id, seat_category, seat_count, status)
        VALUES (?, ?, ?, ?, ?, 'WAITING')
      `).run(entryId, eventId, req.user.userId, seatCategory, count);

      // Compute position in queue
      const positionResult = db.prepare(`
        SELECT COUNT(*) as position FROM waitlist_entries
        WHERE event_id = ? AND seat_category = ? AND status = 'WAITING' AND created_at <= (
          SELECT created_at FROM waitlist_entries WHERE id = ?
        )
      `).get(eventId, seatCategory, entryId) as { position: number };

      res.status(201).json({
        message: `Successfully joined waitlist for ${seatCategory} tier.`,
        entryId,
        eventId,
        seatCategory,
        seatCount: count,
        position: positionResult.position,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get current user's waitlist entries with queue positions and active offers
   */
  static async getMyEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const entries = db.prepare(`
        SELECT 
          we.id, we.event_id, we.seat_category, we.seat_count, we.status, we.created_at,
          e.title as event_title, e.date_time, e.banner_url,
          v.name as venue_name, v.city as venue_city,
          o.id as offer_id, o.claim_token, o.expires_at as offer_expires_at, o.status as offer_status, o.seat_ids_json
        FROM waitlist_entries we
        JOIN events e ON we.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN waitlist_offers o ON o.waitlist_entry_id = we.id AND o.status = 'PENDING'
        WHERE we.user_id = ?
        ORDER BY we.created_at DESC
      `).all(req.user.userId) as any[];

      const populated = entries.map(entry => {
        let position = 0;
        if (entry.status === 'WAITING') {
          const posResult = db.prepare(`
            SELECT COUNT(*) as count FROM waitlist_entries
            WHERE event_id = ? AND seat_category = ? AND status = 'WAITING' AND created_at <= ?
          `).get(entry.event_id, entry.seat_category, entry.created_at) as { count: number };
          position = posResult.count;
        }

        let offeredSeats: string[] = [];
        if (entry.seat_ids_json) {
          try {
            const seatIds: string[] = JSON.parse(entry.seat_ids_json);
            const placeholders = seatIds.map(() => '?').join(',');
            const seats = db.prepare(`
              SELECT row_label, seat_number FROM seats WHERE id IN (${placeholders})
            `).all(...seatIds) as any[];
            offeredSeats = seats.map(s => `${s.row_label}${s.seat_number}`);
          } catch {
            // Ignored
          }
        }

        return {
          id: entry.id,
          eventId: entry.event_id,
          eventTitle: entry.event_title,
          dateTime: entry.date_time,
          bannerUrl: entry.banner_url,
          venueName: entry.venue_name,
          venueCity: entry.venue_city,
          category: entry.seat_category,
          seatCount: entry.seat_count,
          status: entry.status,
          queuePosition: position,
          createdAt: entry.created_at,
          offer: entry.offer_id ? {
            offerId: entry.offer_id,
            claimToken: entry.claim_token,
            expiresAt: entry.offer_expires_at,
            seats: offeredSeats,
          } : null,
        };
      });

      res.json({ entries: populated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Inspect a Waitlist Offer by Magic Token (GET /api/waitlist/offer/:token)
   */
  static async getOfferByToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;

      const offer = db.prepare(`
        SELECT 
          o.id as offer_id, o.event_id, o.user_id, o.seat_ids_json, o.claim_token, o.expires_at, o.status,
          e.title as event_title, e.date_time, e.banner_url,
          v.name as venue_name, v.city as venue_city, v.address as venue_address,
          u.name as user_name, u.email as user_email
        FROM waitlist_offers o
        JOIN events e ON o.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        JOIN users u ON o.user_id = u.id
        WHERE o.claim_token = ?
      `).get(token) as any;

      if (!offer) {
        throw new NotFoundError('Waitlist offer not found.');
      }

      if (offer.status !== 'PENDING') {
        throw new GoneError(`This offer is no longer active (status: ${offer.status}).`);
      }

      const expiresAtDate = new Date(offer.expires_at);
      if (expiresAtDate.getTime() <= Date.now()) {
        throw new GoneError('This waitlist offer has expired.');
      }

      const seatIds: string[] = JSON.parse(offer.seat_ids_json);
      const placeholders = seatIds.map(() => '?').join(',');

      const seats = db.prepare(`
        SELECT s.id, s.row_label, s.seat_number, s.category, esp.price
        FROM seats s
        LEFT JOIN event_seat_pricing esp ON esp.event_id = ? AND esp.seat_category = s.category
        WHERE s.id IN (${placeholders})
      `).all(offer.event_id, ...seatIds) as any[];

      const totalAmount = seats.reduce((sum, s) => sum + (s.price || 0), 0);
      const remainingSeconds = Math.max(0, Math.floor((expiresAtDate.getTime() - Date.now()) / 1000));

      res.json({
        offer: {
          id: offer.offer_id,
          eventId: offer.event_id,
          eventTitle: offer.event_title,
          dateTime: offer.date_time,
          bannerUrl: offer.banner_url,
          venue: {
            name: offer.venue_name,
            address: offer.venue_address,
            city: offer.venue_city,
          },
          seats: seats.map(s => ({
            id: s.id,
            label: `${s.row_label}${s.seat_number}`,
            category: s.category,
            price: s.price || 0,
          })),
          totalAmount,
          expiresAt: offer.expires_at,
          remainingSeconds,
          userName: offer.user_name,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Atomically Claim Waitlist Offer (POST /api/waitlist/claim)
   */
  static async claimOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { token } = req.body;
      if (!token) throw new BadRequestError('Offer claim token is required.');

      const claimTxn = db.transaction((claimTok: string, uId: string) => {
        const offer = db.prepare('SELECT * FROM waitlist_offers WHERE claim_token = ?').get(claimTok) as any;
        if (!offer) throw new NotFoundError('Waitlist offer not found.');
        if (offer.user_id !== uId) throw new ForbiddenError('This offer belongs to a different user account.');
        if (offer.status !== 'PENDING') throw new ConflictError(`Offer is no longer pending (status: ${offer.status}).`);
        if (new Date(offer.expires_at).getTime() <= Date.now()) {
          throw new GoneError('Offer has expired.');
        }

        const seatIds: string[] = JSON.parse(offer.seat_ids_json);
        const placeholders = seatIds.map(() => '?').join(',');

        // Verify all event_seats are still WAITLIST_HELD
        const eventSeats = db.prepare(`
          SELECT es.id, es.seat_id, es.status, s.category, s.row_label, s.seat_number, esp.price
          FROM event_seats es
          JOIN seats s ON es.seat_id = s.id
          JOIN event_seat_pricing esp ON esp.event_id = es.event_id AND esp.seat_category = s.category
          WHERE es.event_id = ? AND es.seat_id IN (${placeholders})
        `).all(offer.event_id, ...seatIds) as any[];

        if (eventSeats.length !== seatIds.length) {
          throw new ConflictError('Mismatch in offered seats.');
        }

        for (const es of eventSeats) {
          if (es.status !== 'WAITLIST_HELD') {
            throw new ConflictError(`Seat ${es.row_label}${es.seat_number} is no longer reserved for this offer.`);
          }
        }

        const totalAmount = eventSeats.reduce((sum, s) => sum + (s.price || 0), 0);
        const bookingId = uuidv4();
        const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const qrSignature = QrService.generateSignature(bookingRef);
        const qrPayload = JSON.stringify({ bookingReference: bookingRef, signature: qrSignature });

        // Insert booking
        db.prepare(`
          INSERT INTO bookings (id, booking_reference, event_id, user_id, total_amount, status, qr_payload, qr_signature)
          VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
        `).run(bookingId, bookingRef, offer.event_id, uId, totalAmount, qrPayload, qrSignature);

        // Insert booking_seats
        const insertBookingSeat = db.prepare(`
          INSERT INTO booking_seats (id, booking_id, seat_id, price_paid)
          VALUES (?, ?, ?, ?)
        `);
        for (const es of eventSeats) {
          insertBookingSeat.run(uuidv4(), bookingId, es.seat_id, es.price);
        }

        // Transition event_seats: WAITLIST_HELD -> BOOKED
        db.prepare(`
          UPDATE event_seats
          SET status = 'BOOKED', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND seat_id IN (${placeholders})
        `).run(offer.event_id, ...seatIds);

        // Transition waitlist_offers: PENDING -> ACCEPTED
        db.prepare(`UPDATE waitlist_offers SET status = 'ACCEPTED' WHERE id = ?`).run(offer.id);

        // Transition waitlist_entries: OFFERED -> CONVERTED
        db.prepare(`UPDATE waitlist_entries SET status = 'CONVERTED' WHERE id = ?`).run(offer.waitlist_entry_id);

        return {
          bookingId,
          bookingReference: bookingRef,
          qrSignature,
          totalAmount,
          eventId: offer.event_id,
          seatIds,
          seats: eventSeats.map(s => `${s.row_label}${s.seat_number}`),
        };
      });

      const result = claimTxn.immediate(token, req.user.userId);

      // Post-commit notifications
      socketService.broadcastSeatUpdate(result.eventId, 'SEATS_BOOKED', { seatIds: result.seatIds });
      emailService.sendBookingConfirmation(result.bookingId).catch(err => logger.error('Email dispatch error:', err));

      const qrDataUrl = await QrService.generateDataUrl({
        bookingReference: result.bookingReference,
        signature: result.qrSignature,
      });

      res.status(201).json({
        message: 'Waitlist offer claimed and booking confirmed successfully!',
        booking: {
          id: result.bookingId,
          bookingReference: result.bookingReference,
          totalAmount: result.totalAmount,
          seats: result.seats,
          qrCode: qrDataUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
