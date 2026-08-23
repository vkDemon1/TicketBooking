import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { HoldSweeperService } from '../services/hold-sweeper.service.js';
import { WaitlistService, OfferResult } from '../services/waitlist.service.js';
import { QrService } from '../services/qr.service.js';
import { emailService } from '../services/email.service.js';
import { socketService } from '../services/socket.service.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError, GoneError } from '../utils/errors.js';

export class BookingController {
  /**
   * Atomically hold seats with configurable TTL
   */
  static async holdSeats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { eventId, seatIds, ttlSeconds } = req.body;

      if (!eventId || !Array.isArray(seatIds) || seatIds.length === 0) {
        throw new BadRequestError('eventId and seatIds array are required.');
      }

      const holdTtl = typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : env.HOLD_TTL_SECONDS;
      const now = new Date();
      const expiresAtIso = new Date(now.getTime() + holdTtl * 1000).toISOString();
      const holdId = uuidv4();

      const holdTxn = db.transaction((evtId: string, uId: string, sIds: string[], hId: string, expIso: string) => {
        // 1. Lazy cleanup for this event
        HoldSweeperService.expireHoldsInlineForEvent(evtId);

        // 2. Validate event exists
        const event = db.prepare('SELECT id FROM events WHERE id = ?').get(evtId);
        if (!event) {
          throw new NotFoundError('Event not found.');
        }

        // 3. Fetch all requested event_seats
        const placeholders = sIds.map(() => '?').join(',');
        const seats = db.prepare(`
          SELECT es.id, es.seat_id, es.status, es.current_hold_id
          FROM event_seats es
          WHERE es.event_id = ? AND es.seat_id IN (${placeholders})
        `).all(evtId, ...sIds) as Array<{ id: string; seat_id: string; status: string; current_hold_id: string }>;

        if (seats.length !== sIds.length) {
          throw new NotFoundError('One or more requested seats do not exist for this event.');
        }

        // 4. Verify all seats are strictly AVAILABLE
        for (const s of seats) {
          if (s.status !== 'AVAILABLE') {
            throw new ConflictError(`Seat ${s.seat_id} is no longer available (current status: ${s.status}).`);
          }
        }

        // 5. Insert seat_holds record
        db.prepare(`
          INSERT INTO seat_holds (id, event_id, user_id, seat_ids_json, expires_at, status)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE')
        `).run(hId, evtId, uId, JSON.stringify(sIds), expIso);

        // 6. Update event_seats to HELD
        db.prepare(`
          UPDATE event_seats
          SET status = 'HELD', current_hold_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND seat_id IN (${placeholders})
        `).run(hId, evtId, ...sIds);

        return { holdId: hId, expiresAt: expIso, seatIds: sIds, eventId: evtId };
      });

      // Execute explicitly using immediate transaction variant
      const result = holdTxn.immediate(eventId, req.user.userId, seatIds, holdId, expiresAtIso);

      // Post-commit: broadcast socket event
      socketService.broadcastSeatUpdate(eventId, 'SEATS_HELD', {
        seatIds,
        expiresAt: expiresAtIso,
      });

      res.status(201).json({
        message: 'Seats held successfully.',
        holdId: result.holdId,
        expiresAt: result.expiresAt,
        seatIds: result.seatIds,
        ttlSeconds: holdTtl,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Manually release an active hold (e.g. user closes checkout or navigates away)
   */
  static async releaseHold(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { holdId } = req.body;
      if (!holdId) throw new BadRequestError('holdId is required.');

      const releaseTxn = db.transaction((hId: string, uId: string) => {
        const hold = db.prepare('SELECT * FROM seat_holds WHERE id = ?').get(hId) as any;
        if (!hold) throw new NotFoundError('Hold record not found.');
        if (hold.user_id !== uId) throw new ForbiddenError('Unauthorized.');

        if (hold.status !== 'ACTIVE') {
          return { released: false, eventId: hold.event_id, seatIds: [] };
        }

        const seatIds: string[] = JSON.parse(hold.seat_ids_json);
        const placeholders = seatIds.map(() => '?').join(',');

        db.prepare(`
          UPDATE event_seats
          SET status = 'AVAILABLE', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND seat_id IN (${placeholders}) AND current_hold_id = ?
        `).run(hold.event_id, ...seatIds, hId);

        db.prepare(`UPDATE seat_holds SET status = 'RELEASED' WHERE id = ?`).run(hId);

        return { released: true, eventId: hold.event_id, seatIds };
      });

      const result = releaseTxn.immediate(holdId, req.user.userId);

      if (result.released && result.seatIds.length > 0) {
        socketService.broadcastSeatUpdate(result.eventId, 'SEATS_RELEASED', { seatIds: result.seatIds });
      }

      res.json({
        message: result.released ? 'Hold released successfully.' : 'Hold was not active.',
        released: result.released,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Atomically convert active hold to confirmed booking
   */
  static async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { holdId } = req.body;
      if (!holdId) throw new BadRequestError('holdId is required.');

      const checkoutTxn = db.transaction((hId: string, uId: string) => {
        const hold = db.prepare('SELECT * FROM seat_holds WHERE id = ?').get(hId) as any;
        if (!hold) throw new NotFoundError('Hold record not found.');
        if (hold.user_id !== uId) throw new ForbiddenError('Hold does not belong to authenticated user.');
        if (hold.status !== 'ACTIVE') throw new ConflictError(`Hold is not active (current status: ${hold.status}).`);
        if (new Date(hold.expires_at).getTime() <= Date.now()) {
          throw new GoneError('Hold has expired. Please re-select your seats.');
        }

        const seatIds: string[] = JSON.parse(hold.seat_ids_json);
        const placeholders = seatIds.map(() => '?').join(',');

        // Verify all event_seats are still HELD under this hold
        const eventSeats = db.prepare(`
          SELECT es.id, es.seat_id, es.status, es.current_hold_id, s.category, s.row_label, s.seat_number, esp.price
          FROM event_seats es
          JOIN seats s ON es.seat_id = s.id
          JOIN event_seat_pricing esp ON esp.event_id = es.event_id AND esp.seat_category = s.category
          WHERE es.event_id = ? AND es.seat_id IN (${placeholders})
        `).all(hold.event_id, ...seatIds) as any[];

        if (eventSeats.length !== seatIds.length) {
          throw new ConflictError('Mismatch in seat availability.');
        }

        for (const es of eventSeats) {
          if (es.status !== 'HELD' || es.current_hold_id !== hId) {
            throw new ConflictError(`Seat ${es.row_label}${es.seat_number} is no longer reserved under this session.`);
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
        `).run(bookingId, bookingRef, hold.event_id, uId, totalAmount, qrPayload, qrSignature);

        // Insert booking_seats
        const insertBookingSeat = db.prepare(`
          INSERT INTO booking_seats (id, booking_id, seat_id, price_paid)
          VALUES (?, ?, ?, ?)
        `);
        for (const es of eventSeats) {
          insertBookingSeat.run(uuidv4(), bookingId, es.seat_id, es.price);
        }

        // Transition event_seats: HELD -> BOOKED
        db.prepare(`
          UPDATE event_seats
          SET status = 'BOOKED', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND seat_id IN (${placeholders})
        `).run(hold.event_id, ...seatIds);

        // Transition seat_holds: ACTIVE -> CONVERTED
        db.prepare(`UPDATE seat_holds SET status = 'CONVERTED' WHERE id = ?`).run(hId);

        return {
          bookingId,
          bookingReference: bookingRef,
          qrSignature,
          totalAmount,
          eventId: hold.event_id,
          seatIds,
          seats: eventSeats.map(s => `${s.row_label}${s.seat_number}`),
        };
      });

      const result = checkoutTxn.immediate(holdId, req.user.userId);

      // Post-commit notifications
      socketService.broadcastSeatUpdate(result.eventId, 'SEATS_BOOKED', { seatIds: result.seatIds });
      emailService.sendBookingConfirmation(result.bookingId).catch(err => logger.error('Email dispatch error:', err));

      const qrDataUrl = await QrService.generateDataUrl({
        bookingReference: result.bookingReference,
        signature: result.qrSignature,
      });

      res.status(201).json({
        message: 'Booking confirmed successfully!',
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

  /**
   * Customer Booking History
   */
  static async getMyBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const bookings = db.prepare(`
        SELECT 
          b.id, b.booking_reference, b.total_amount, b.status, b.created_at, b.qr_payload, b.qr_signature,
          e.id as event_id, e.title as event_title, e.category as event_category, e.date_time, e.banner_url,
          v.name as venue_name, v.city as venue_city, v.address as venue_address
        FROM bookings b
        JOIN events e ON b.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `).all(req.user.userId) as any[];

      const populatedBookings = await Promise.all(
        bookings.map(async b => {
          const seats = db.prepare(`
            SELECT s.row_label, s.seat_number, s.category, bs.price_paid
            FROM booking_seats bs
            JOIN seats s ON bs.seat_id = s.id
            WHERE bs.booking_id = ?
          `).all(b.id) as any[];

          const qrDataUrl = await QrService.generateDataUrl({
            bookingReference: b.booking_reference,
            signature: b.qr_signature,
          });

          return {
            id: b.id,
            bookingReference: b.booking_reference,
            totalAmount: b.total_amount,
            status: b.status,
            createdAt: b.created_at,
            event: {
              id: b.event_id,
              title: b.event_title,
              category: b.event_category,
              dateTime: b.date_time,
              bannerUrl: b.banner_url,
              venue: {
                name: b.venue_name,
                city: b.venue_city,
                address: b.venue_address,
              },
            },
            seats: seats.map(s => ({
              label: `${s.row_label}${s.seat_number}`,
              row: s.row_label,
              number: s.seat_number,
              category: s.category,
              price: s.price_paid,
            })),
            qrCode: qrDataUrl,
            signature: b.qr_signature,
          };
        })
      );

      res.json({ bookings: populatedBookings });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Cancel Booking and Trigger Waitlist Cascading Offer Auto-Assignment
   */
  static async cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { id } = req.params;

      const cancelTxn = db.transaction((bId: string, uId: string) => {
        const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bId) as any;
        if (!booking) throw new NotFoundError('Booking not found.');
        if (booking.user_id !== uId) throw new ForbiddenError('Unauthorized.');
        if (booking.status !== 'CONFIRMED') throw new ConflictError('Booking is already cancelled.');

        const bookedSeats = db.prepare(`
          SELECT bs.seat_id, s.category, s.row_label, s.seat_number
          FROM booking_seats bs
          JOIN seats s ON bs.seat_id = s.id
          WHERE bs.booking_id = ?
        `).all(bId) as any[];

        // Mark booking CANCELLED
        db.prepare(`UPDATE bookings SET status = 'CANCELLED' WHERE id = ?`).run(bId);

        // Group released seats by category
        const releasedByCategory = new Map<string, string[]>();
        for (const s of bookedSeats) {
          if (!releasedByCategory.has(s.category)) releasedByCategory.set(s.category, []);
          releasedByCategory.get(s.category)!.push(s.seat_id);
        }

        const generatedOffers: OfferResult[] = [];
        const fullyReleasedSeats: string[] = [];

        // Process waitlist allocations for each category
        for (const [category, seatIds] of releasedByCategory.entries()) {
          const offers = WaitlistService.processReleasedSeatsForCategory(booking.event_id, category, seatIds);
          generatedOffers.push(...offers);

          // Find seats that reverted to AVAILABLE (no waitlist demand)
          const placeholders = seatIds.map(() => '?').join(',');
          const availableSeats = db.prepare(`
            SELECT seat_id FROM event_seats
            WHERE event_id = ? AND seat_id IN (${placeholders}) AND status = 'AVAILABLE'
          `).all(booking.event_id, ...seatIds) as any[];

          fullyReleasedSeats.push(...availableSeats.map(s => s.seat_id));
        }

        return {
          bookingId: bId,
          eventId: booking.event_id,
          generatedOffers,
          fullyReleasedSeats,
        };
      });

      const result = cancelTxn.immediate(id, req.user.userId);

      // Post-commit notifications
      for (const offer of result.generatedOffers) {
        emailService.sendWaitlistOffer(offer.offerId).catch(err => logger.error('Waitlist email error:', err));
        socketService.broadcastSeatUpdate(result.eventId, 'WAITLIST_OFFER_CREATED', {
          offerId: offer.offerId,
          seatIds: offer.seatIds,
        });
      }

      if (result.fullyReleasedSeats.length > 0) {
        socketService.broadcastSeatUpdate(result.eventId, 'SEATS_RELEASED', {
          seatIds: result.fullyReleasedSeats,
        });
      }

      res.json({
        message: 'Booking cancelled successfully. Released seats have been offered to the waitlist queue.',
        bookingId: result.bookingId,
        waitlistOffersCreated: result.generatedOffers.length,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Canonical Verification Endpoint: GET /api/bookings/verify/:bookingReference
   * Cryptographically validates HMAC-SHA256 signature (if provided in query ?signature=...) and checks database status.
   */
  static async getBookingByReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bookingReference } = req.params;
      const signature = (req.query.signature as string) || (req.body?.signature as string);

      if (!bookingReference) {
        res.status(400).json({
          status: 'INVALID',
          message: 'Booking reference is required.',
        });
        return;
      }

      // If signature is provided, verify HMAC-SHA256 with timing-safe comparison
      if (signature) {
        const isSignatureValid = QrService.verifySignature(bookingReference, signature);
        if (!isSignatureValid) {
          res.status(200).json({
            status: 'INVALID',
            bookingReference,
            message: 'Cryptographic signature mismatch! Ticket QR code is counterfeit or corrupted.',
          });
          return;
        }
      }

      // Query database
      const booking = db.prepare(`
        SELECT 
          b.id, b.booking_reference, b.total_amount, b.status, b.created_at, b.qr_signature,
          e.title as event_title, e.category as event_category, e.date_time,
          v.name as venue_name, v.city as venue_city, v.address as venue_address,
          u.name as attendee_name
        FROM bookings b
        JOIN events e ON b.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        JOIN users u ON b.user_id = u.id
        WHERE b.booking_reference = ?
      `).get(bookingReference) as any;

      if (!booking) {
        res.status(200).json({
          status: 'INVALID',
          bookingReference,
          message: 'Booking reference not found in system records.',
        });
        return;
      }

      const seats = db.prepare(`
        SELECT s.row_label, s.seat_number, s.category, bs.price_paid
        FROM booking_seats bs
        JOIN seats s ON bs.seat_id = s.id
        WHERE bs.booking_id = ?
      `).all(booking.id) as any[];

      const seatLabels = seats.map(s => `${s.row_label}${s.seat_number} (${s.category})`);

      if (booking.status === 'CANCELLED') {
        res.status(200).json({
          status: 'CANCELLED',
          bookingReference: booking.booking_reference,
          message: 'This booking has been CANCELLED and is no longer valid for admission.',
          event: {
            title: booking.event_title,
            category: booking.event_category,
            dateTime: booking.date_time,
            venue: `${booking.venue_name}, ${booking.venue_address}, ${booking.venue_city}`,
          },
          seats: seatLabels,
          signature: booking.qr_signature,
        });
        return;
      }

      if (booking.status === 'CONFIRMED') {
        res.status(200).json({
          status: 'VALID',
          message: 'Ticket verified successfully. Valid for admission.',
          bookingReference: booking.booking_reference,
          attendee: booking.attendee_name,
          totalAmount: booking.total_amount,
          createdAt: booking.created_at,
          event: {
            title: booking.event_title,
            category: booking.event_category,
            dateTime: booking.date_time,
            venue: `${booking.venue_name}, ${booking.venue_address}, ${booking.venue_city}`,
          },
          seats: seatLabels,
          signature: booking.qr_signature,
        });
        return;
      }

      res.status(200).json({
        status: 'INVALID',
        bookingReference,
        message: `Unknown ticket status: ${booking.status}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Compatibility Route: POST /api/bookings/verify
   */
  static async verifyTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { bookingReference, signature } = req.body;
    req.params.bookingReference = bookingReference;
    if (signature) req.query.signature = signature;
    return BookingController.getBookingByReference(req, res, next);
  }
}
