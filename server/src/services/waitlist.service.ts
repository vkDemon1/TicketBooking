import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { socketService } from './socket.service.js';
import { emailService } from './email.service.js';
import { logger } from '../utils/logger.js';

export interface OfferResult {
  offerId: string;
  claimToken: string;
  userEmail: string;
  userName: string;
  eventId: string;
  seatIds: string[];
}

export class WaitlistService {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  /**
   * Allocate a set of released seats of a given category for an event
   * using category-based ordered queue with oldest-satisfiable allocation.
   * MUST be executed inside an active BEGIN IMMEDIATE transaction or via this method.
   */
  static processReleasedSeatsForCategory(
    eventId: string,
    category: string,
    seatIds: string[]
  ): OfferResult[] {
    let unallocatedSeats = [...seatIds];
    const generatedOffers: OfferResult[] = [];

    // Query active WAITING entries in FIFO order
    const waitlistEntries = db.prepare(`
      SELECT we.id, we.event_id, we.user_id, we.seat_category, we.seat_count, we.created_at,
             u.email as user_email, u.name as user_name
      FROM waitlist_entries we
      JOIN users u ON we.user_id = u.id
      WHERE we.event_id = ? AND we.seat_category = ? AND we.status = 'WAITING'
      ORDER BY we.created_at ASC
    `).all(eventId, category) as any[];

    for (const entry of waitlistEntries) {
      if (unallocatedSeats.length === 0) break;

      // Oldest-satisfiable policy: only allocate if entire requested seat_count can be fulfilled
      if (entry.seat_count <= unallocatedSeats.length) {
        const assignedSeats = unallocatedSeats.slice(0, entry.seat_count);
        unallocatedSeats = unallocatedSeats.slice(entry.seat_count);

        const offerId = uuidv4();
        const claimToken = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + env.WAITLIST_OFFER_TTL_SECONDS * 1000).toISOString();

        // Create waitlist offer
        db.prepare(`
          INSERT INTO waitlist_offers (id, waitlist_entry_id, event_id, user_id, seat_ids_json, claim_token, expires_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).run(offerId, entry.id, eventId, entry.user_id, JSON.stringify(assignedSeats), claimToken, expiresAt);

        // Update waitlist entry to OFFERED
        db.prepare(`UPDATE waitlist_entries SET status = 'OFFERED' WHERE id = ?`).run(entry.id);

        // Mark seats WAITLIST_HELD
        const placeholders = assignedSeats.map(() => '?').join(',');
        db.prepare(`
          UPDATE event_seats
          SET status = 'WAITLIST_HELD', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = ? AND seat_id IN (${placeholders})
        `).run(eventId, ...assignedSeats);

        generatedOffers.push({
          offerId,
          claimToken,
          userEmail: entry.user_email,
          userName: entry.user_name,
          eventId,
          seatIds: assignedSeats,
        });
      }
    }

    // Any remaining seats with no satisfiable waitlist demand revert to AVAILABLE
    if (unallocatedSeats.length > 0) {
      const placeholders = unallocatedSeats.map(() => '?').join(',');
      db.prepare(`
        UPDATE event_seats
        SET status = 'AVAILABLE', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ? AND seat_id IN (${placeholders})
      `).run(eventId, ...unallocatedSeats);
    }

    return generatedOffers;
  }

  /**
   * Sweeps expired waitlist offers and cascades to next eligible users in line
   */
  public sweep(): void {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const nowIso = new Date().toISOString();

      // Quick read check
      const check = db.prepare(`
        SELECT COUNT(*) as count FROM waitlist_offers
        WHERE status = 'PENDING' AND expires_at <= ?
      `).get(nowIso) as { count: number };

      if (check && check.count > 0) {
        const cascadeTxn = db.transaction((currentTimestamp: string) => {
          const expiredOffers = db.prepare(`
            SELECT o.id, o.waitlist_entry_id, o.event_id, o.user_id, o.seat_ids_json,
                   we.seat_category
            FROM waitlist_offers o
            JOIN waitlist_entries we ON o.waitlist_entry_id = we.id
            WHERE o.status = 'PENDING' AND o.expires_at <= ?
          `).all(currentTimestamp) as Array<{
            id: string;
            waitlist_entry_id: string;
            event_id: string;
            user_id: string;
            seat_ids_json: string;
            seat_category: string;
          }>;

          const newOffers: OfferResult[] = [];
          const fullyReleasedByEvent = new Map<string, string[]>();

          for (const offer of expiredOffers) {
            const seatIds: string[] = JSON.parse(offer.seat_ids_json);

            // Mark offer EXPIRED
            db.prepare(`UPDATE waitlist_offers SET status = 'EXPIRED' WHERE id = ?`).run(offer.id);

            // Mark waitlist entry EXPIRED
            db.prepare(`UPDATE waitlist_entries SET status = 'EXPIRED' WHERE id = ?`).run(offer.waitlist_entry_id);

            // Cascade released seats to next in line
            const cascaded = WaitlistService.processReleasedSeatsForCategory(
              offer.event_id,
              offer.seat_category,
              seatIds
            );

            newOffers.push(...cascaded);

            // Check if any seats reverted to AVAILABLE
            const placeholders = seatIds.map(() => '?').join(',');
            const availableSeats = db.prepare(`
              SELECT seat_id FROM event_seats
              WHERE event_id = ? AND seat_id IN (${placeholders}) AND status = 'AVAILABLE'
            `).all(offer.event_id, ...seatIds) as Array<{ seat_id: string }>;

            if (availableSeats.length > 0) {
              if (!fullyReleasedByEvent.has(offer.event_id)) {
                fullyReleasedByEvent.set(offer.event_id, []);
              }
              fullyReleasedByEvent.get(offer.event_id)!.push(...availableSeats.map(s => s.seat_id));
            }
          }

          return { newOffers, fullyReleasedByEvent, expiredOffersCount: expiredOffers.length };
        });

        const { newOffers, fullyReleasedByEvent, expiredOffersCount } = cascadeTxn.immediate(nowIso);

        logger.info(`[Waitlist Sweeper] Expired ${expiredOffersCount} unclaimed offers, created ${newOffers.length} cascaded offers.`);

        // Post-commit notifications
        for (const offer of newOffers) {
          emailService.sendWaitlistOffer(offer.offerId).catch(err => logger.error('Cascade email error:', err));
          socketService.broadcastSeatUpdate(offer.eventId, 'WAITLIST_OFFER_CREATED', {
            offerId: offer.offerId,
            seatIds: offer.seatIds,
          });
        }

        for (const [eventId, seatIds] of fullyReleasedByEvent.entries()) {
          socketService.broadcastSeatUpdate(eventId, 'SEATS_RELEASED', { seatIds });
        }
      }
    } catch (err) {
      logger.error('[Waitlist Sweeper] Error during offer sweep:', err);
    } finally {
      this.isSweeping = false;
    }
  }

  public start(intervalMs = 3000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), intervalMs);
    logger.info(`[Waitlist Sweeper] Started background waitlist offer cascade worker (cadence: ${intervalMs}ms)`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const waitlistService = new WaitlistService();
