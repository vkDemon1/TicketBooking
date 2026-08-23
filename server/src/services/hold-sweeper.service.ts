import { db, runImmediateTransaction } from '../config/db.js';
import { socketService } from './socket.service.js';
import { logger } from '../utils/logger.js';

export class HoldSweeperService {
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  /**
   * Check and lazily expire active holds for a specific event inline before read/hold operations.
   * Optimizes by checking count first before acquiring an immediate write lock.
   */
  static expireHoldsInlineForEvent(eventId: string): string[] {
    const nowIso = new Date().toISOString();

    // Fast check: are there expired holds for this event?
    const check = db.prepare(`
      SELECT COUNT(*) as count FROM seat_holds
      WHERE event_id = ? AND status = 'ACTIVE' AND expires_at <= ?
    `).get(eventId, nowIso) as { count: number };

    if (!check || check.count === 0) {
      return [];
    }

    const expireTxn = db.transaction((evtId: string, currentTimestamp: string) => {
      const expiredHolds = db.prepare(`
        SELECT id, seat_ids_json FROM seat_holds
        WHERE event_id = ? AND status = 'ACTIVE' AND expires_at <= ?
      `).all(evtId, currentTimestamp) as Array<{ id: string; seat_ids_json: string }>;

      const releasedSeatIds: string[] = [];

      for (const hold of expiredHolds) {
        const seatIds: string[] = JSON.parse(hold.seat_ids_json);
        if (seatIds.length > 0) {
          const placeholders = seatIds.map(() => '?').join(',');
          db.prepare(`
            UPDATE event_seats
            SET status = 'AVAILABLE', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE event_id = ? AND seat_id IN (${placeholders}) AND current_hold_id = ?
          `).run(evtId, ...seatIds, hold.id);

          releasedSeatIds.push(...seatIds);
        }

        db.prepare(`UPDATE seat_holds SET status = 'EXPIRED' WHERE id = ?`).run(hold.id);
      }

      return releasedSeatIds;
    });

    const releasedSeats = expireTxn.immediate(eventId, nowIso);

    if (releasedSeats.length > 0) {
      socketService.broadcastSeatUpdate(eventId, 'SEATS_RELEASED', { seatIds: releasedSeats });
    }

    return releasedSeats;
  }

  /**
   * Sweeps all expired holds across all events synchronously in an IMMEDIATE transaction
   */
  public sweep(): void {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const nowIso = new Date().toISOString();

      // Quick read check
      const check = db.prepare(`
        SELECT COUNT(*) as count FROM seat_holds
        WHERE status = 'ACTIVE' AND expires_at <= ?
      `).get(nowIso) as { count: number };

      if (check && check.count > 0) {
        const sweepTxn = db.transaction((currentTimestamp: string) => {
          const expiredHolds = db.prepare(`
            SELECT id, event_id, seat_ids_json FROM seat_holds
            WHERE status = 'ACTIVE' AND expires_at <= ?
          `).all(currentTimestamp) as Array<{ id: string; event_id: string; seat_ids_json: string }>;

          const releasedByEvent = new Map<string, string[]>();

          for (const hold of expiredHolds) {
            const seatIds: string[] = JSON.parse(hold.seat_ids_json);
            if (seatIds.length > 0) {
              const placeholders = seatIds.map(() => '?').join(',');
              db.prepare(`
                UPDATE event_seats
                SET status = 'AVAILABLE', current_hold_id = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE event_id = ? AND seat_id IN (${placeholders}) AND current_hold_id = ?
              `).run(hold.event_id, ...seatIds, hold.id);

              if (!releasedByEvent.has(hold.event_id)) {
                releasedByEvent.set(hold.event_id, []);
              }
              releasedByEvent.get(hold.event_id)!.push(...seatIds);
            }

            db.prepare(`UPDATE seat_holds SET status = 'EXPIRED' WHERE id = ?`).run(hold.id);
          }

          return releasedByEvent;
        });

        const releasedMap = sweepTxn.immediate(nowIso);

        for (const [eventId, seatIds] of releasedMap.entries()) {
          logger.info(`[TTL Sweeper] Auto-released ${seatIds.length} expired seats for event ${eventId}`);
          socketService.broadcastSeatUpdate(eventId, 'SEATS_RELEASED', { seatIds });
        }
      }
    } catch (err) {
      logger.error('[TTL Sweeper] Error during hold sweep:', err);
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Start 3-second recurring interval
   */
  public start(intervalMs = 3000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), intervalMs);
    logger.info(`[TTL Sweeper] Started background hold cleanup worker (cadence: ${intervalMs}ms)`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const holdSweeperService = new HoldSweeperService();
