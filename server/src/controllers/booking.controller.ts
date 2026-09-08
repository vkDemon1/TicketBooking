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
   * Atomically convert active hold to confirmed booking (with optional promo code)
   */
  static async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new ForbiddenError('Unauthorized.');

      const { holdId, promoCode } = req.body;
      if (!holdId) throw new BadRequestError('holdId is required.');

      const checkoutTxn = db.transaction((hId: string, uId: string, pCode?: string) => {
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

        const originalAmount = eventSeats.reduce((sum, s) => sum + (s.price || 0), 0);
        let discountAmount = 0;
        let promoCodeId: string | null = null;
        let appliedPromoCode: string | null = null;

        // Process Promo Code if provided
        if (pCode && typeof pCode === 'string' && pCode.trim().length > 0) {
          const cleanCode = pCode.trim().toUpperCase();
          const promo = db.prepare(`
            SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE
          `).get(cleanCode) as any;

          if (!promo) {
            throw new BadRequestError(`Promo code '${cleanCode}' is invalid.`);
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
          if (promo.event_id && promo.event_id !== hold.event_id) {
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

          // Calculate discount
          if (promo.discount_type === 'PERCENTAGE') {
            discountAmount = (originalAmount * promo.discount_value) / 100;
            if (promo.max_discount !== null && discountAmount > promo.max_discount) {
              discountAmount = promo.max_discount;
            }
          } else if (promo.discount_type === 'FLAT') {
            discountAmount = Math.min(originalAmount, promo.discount_value);
          }

          discountAmount = Math.round(discountAmount * 100) / 100;
          promoCodeId = promo.id;
          appliedPromoCode = promo.code;

          // Increment uses_count atomically inside transaction
          db.prepare('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ?').run(promo.id);
        }

        const totalAmount = Math.max(0, Math.round((originalAmount - discountAmount) * 100) / 100);
        const bookingId = uuidv4();
        const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const qrSignature = QrService.generateSignature(bookingRef);
        const qrPayload = JSON.stringify({ bookingReference: bookingRef, signature: qrSignature });

        // Insert booking with promo auditing
        db.prepare(`
          INSERT INTO bookings (
            id, booking_reference, event_id, user_id, total_amount, original_amount,
            discount_amount, promo_code_id, status, qr_payload, qr_signature
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
        `).run(
          bookingId,
          bookingRef,
          hold.event_id,
          uId,
          totalAmount,
          originalAmount,
          discountAmount,
          promoCodeId,
          qrPayload,
          qrSignature
        );

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
          originalAmount,
          discountAmount,
          appliedPromoCode,
          eventId: hold.event_id,
          seatIds,
          seats: eventSeats.map(s => `${s.row_label}${s.seat_number}`),
        };
      });

      const result = checkoutTxn.immediate(holdId, req.user.userId, promoCode);

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
          originalAmount: result.originalAmount,
          discountAmount: result.discountAmount,
          appliedPromoCode: result.appliedPromoCode,
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
          b.id, b.booking_reference, b.total_amount, b.original_amount, b.discount_amount,
          b.promo_code_id, p.code as promo_code, b.status, b.created_at, b.qr_payload, b.qr_signature,
          e.id as event_id, e.title as event_title, e.category as event_category, e.date_time, e.banner_url,
          v.name as venue_name, v.city as venue_city, v.address as venue_address
        FROM bookings b
        JOIN events e ON b.event_id = e.id
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN promo_codes p ON b.promo_code_id = p.id
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
            originalAmount: b.original_amount ?? b.total_amount,
            discountAmount: b.discount_amount ?? 0,
            promoCode: b.promo_code ?? null,
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
          b.is_redeemed, b.redeemed_at, b.redeemed_by,
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
          isRedeemed: false,
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
        const isRedeemed = Boolean(booking.is_redeemed);
        res.status(200).json({
          status: isRedeemed ? 'REDEEMED' : 'VALID',
          isRedeemed,
          redeemedAt: booking.redeemed_at,
          redeemedBy: booking.redeemed_by,
          message: isRedeemed
            ? `Ticket was already redeemed on ${new Date(booking.redeemed_at).toLocaleString()}${booking.redeemed_by ? ` by ${booking.redeemed_by}` : ''}.`
            : 'Ticket verified successfully. Valid for admission.',
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
   * Gate Check-In & Anti-Fraud Ticket Redemption: POST /api/bookings/check-in
   * Validates HMAC signature and atomically marks ticket as REDEEMED.
   * Rejects already redeemed tickets with HTTP 409 Conflict.
   */
  static async checkInTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let { bookingReference, signature, gateStaffName, qrPayload } = req.body;

      // If qrPayload is passed as JSON string
      if (qrPayload && (!bookingReference || !signature)) {
        try {
          const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
          if (parsed.bookingReference) bookingReference = parsed.bookingReference;
          if (parsed.signature) signature = parsed.signature;
        } catch {
          // Continue with raw bookingReference
        }
      }

      if (!bookingReference) {
        throw new BadRequestError('bookingReference is required for gate check-in.');
      }

      // Cryptographic signature check (if signature provided)
      if (signature) {
        const isSignatureValid = QrService.verifySignature(bookingReference, signature);
        if (!isSignatureValid) {
          res.status(400).json({
            success: false,
            status: 'INVALID',
            bookingReference,
            message: 'Cryptographic signature mismatch! Ticket QR code is counterfeit or corrupted.',
          });
          return;
        }
      }

      const staffIdentifier = gateStaffName || req.user?.name || (req.user ? `${req.user.email} (${req.user.role})` : 'Gate Terminal');

      const checkInTxn = db.transaction((ref: string, staff: string) => {
        const booking = db.prepare(`
          SELECT 
            b.id, b.booking_reference, b.event_id, b.total_amount, b.status, b.created_at, b.qr_signature,
            b.is_redeemed, b.redeemed_at, b.redeemed_by,
            e.title as event_title, e.category as event_category, e.date_time,
            v.name as venue_name, v.city as venue_city, v.address as venue_address,
            u.name as attendee_name, u.email as attendee_email
          FROM bookings b
          JOIN events e ON b.event_id = e.id
          JOIN venues v ON e.venue_id = v.id
          JOIN users u ON b.user_id = u.id
          WHERE b.booking_reference = ?
        `).get(ref) as any;

        if (!booking) {
          throw new NotFoundError('Booking reference not found in system records.');
        }

        if (booking.status === 'CANCELLED') {
          throw new BadRequestError('This ticket was CANCELLED and refunded. Admission denied.');
        }

        if (booking.is_redeemed === 1) {
          const errorObj: any = new ConflictError(
            `Ticket already redeemed on ${new Date(booking.redeemed_at).toLocaleString()}${booking.redeemed_by ? ` by ${booking.redeemed_by}` : ''}. Duplicate admission denied.`
          );
          errorObj.code = 'ALREADY_REDEEMED';
          errorObj.redeemedAt = booking.redeemed_at;
          errorObj.redeemedBy = booking.redeemed_by;
          errorObj.attendee = booking.attendee_name;
          errorObj.eventTitle = booking.event_title;
          throw errorObj;
        }

        const nowIso = new Date().toISOString();
        const updateRes = db.prepare(`
          UPDATE bookings
          SET is_redeemed = 1, redeemed_at = ?, redeemed_by = ?
          WHERE id = ? AND is_redeemed = 0 AND status = 'CONFIRMED'
        `).run(nowIso, staff, booking.id);

        if (Number(updateRes.changes) === 0) {
          throw new ConflictError('Concurrent check-in detected. Ticket was just checked in by another gate terminal.');
        }

        const seats = db.prepare(`
          SELECT s.row_label, s.seat_number, s.category, bs.price_paid
          FROM booking_seats bs
          JOIN seats s ON bs.seat_id = s.id
          WHERE bs.booking_id = ?
        `).all(booking.id) as any[];

        const seatLabels = seats.map(s => `${s.row_label}${s.seat_number} (${s.category})`);

        return {
          booking,
          seats: seatLabels,
          seatCount: seats.length,
          redeemedAt: nowIso,
          redeemedBy: staff,
        };
      });

      const result = checkInTxn.immediate(bookingReference.trim(), staffIdentifier);

      // Broadcast gate activity
      socketService.broadcastGateActivity(result.booking.event_id, {
        bookingReference: result.booking.booking_reference,
        attendee: result.booking.attendee_name,
        seats: result.seats,
        seatCount: result.seatCount,
        redeemedAt: result.redeemedAt,
        redeemedBy: result.redeemedBy,
        eventTitle: result.booking.event_title,
      });

      res.status(200).json({
        success: true,
        status: 'CHECKED_IN',
        message: 'Access Granted! Ticket redeemed successfully.',
        bookingReference: result.booking.booking_reference,
        attendee: result.booking.attendee_name,
        email: result.booking.attendee_email,
        redeemedAt: result.redeemedAt,
        redeemedBy: result.redeemedBy,
        event: {
          id: result.booking.event_id,
          title: result.booking.event_title,
          category: result.booking.event_category,
          dateTime: result.booking.date_time,
          venue: `${result.booking.venue_name}, ${result.booking.venue_address}, ${result.booking.venue_city}`,
        },
        seats: result.seats,
        seatCount: result.seatCount,
      });
    } catch (err: any) {
      if (err?.code === 'ALREADY_REDEEMED') {
        res.status(409).json({
          success: false,
          status: 'ALREADY_REDEEMED',
          message: err.message,
          redeemedAt: err.redeemedAt,
          redeemedBy: err.redeemedBy,
          attendee: err.attendee,
          eventTitle: err.eventTitle,
        });
        return;
      }
      next(err);
    }
  }

  /**
   * Gate Attendance Statistics for an Event: GET /api/bookings/gate-stats/:eventId
   */
  static async getEventGateStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { eventId } = req.params;

      const event = db.prepare('SELECT id, title, date_time FROM events WHERE id = ?').get(eventId) as any;
      if (!event) {
        throw new NotFoundError('Event not found.');
      }

      const confirmedBookings = db.prepare(`
        SELECT 
          b.id, b.booking_reference, b.is_redeemed, b.redeemed_at, b.redeemed_by,
          u.name as attendee_name,
          (SELECT COUNT(*) FROM booking_seats bs WHERE bs.booking_id = b.id) as seat_count
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.event_id = ? AND b.status = 'CONFIRMED'
        ORDER BY b.redeemed_at DESC, b.created_at DESC
      `).all(eventId) as any[];

      const totalBookings = confirmedBookings.length;
      const totalTicketsSold = confirmedBookings.reduce((sum, b) => sum + (b.seat_count || 0), 0);
      const redeemedBookings = confirmedBookings.filter(b => b.is_redeemed === 1);
      const totalCheckedIn = redeemedBookings.reduce((sum, b) => sum + (b.seat_count || 0), 0);
      const checkInRate = totalTicketsSold > 0 ? (totalCheckedIn / totalTicketsSold) * 100 : 0;

      const recentCheckIns = redeemedBookings.slice(0, 20).map(b => ({
        bookingReference: b.booking_reference,
        attendee: b.attendee_name,
        seatCount: b.seat_count,
        redeemedAt: b.redeemed_at,
        redeemedBy: b.redeemed_by,
      }));

      res.json({
        eventId,
        eventTitle: event.title,
        dateTime: event.date_time,
        totalBookings,
        totalTicketsSold,
        totalCheckedIn,
        checkInRate: parseFloat(checkInRate.toFixed(1)),
        recentCheckIns,
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
