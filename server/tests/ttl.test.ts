import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';
import { holdSweeperService } from '../src/services/hold-sweeper.service.js';

describe('TTL & AUTO-RELEASE TEST: Deterministic Expiry & Lazy Evaluation', () => {
  let customerToken: string;
  let eventId: string;
  let seatId: string;

  beforeAll(async () => {
    await seed();

    const authRes = await request(app)
      .post('/api/auth/demo-login')
      .send({ role: 'CUSTOMER', email: 'ttl_tester@cineconcert.io' });
    customerToken = authRes.body.token;

    // Pick Dune event which has plenty of AVAILABLE seats
    const event = db.prepare(`SELECT id FROM events WHERE title LIKE '%Dune%'`).get() as { id: string };
    eventId = event.id;

    const seat = db.prepare(`
      SELECT seat_id FROM event_seats WHERE event_id = ? AND status = 'AVAILABLE' LIMIT 1
    `).get(eventId) as { seat_id: string };
    seatId = seat.seat_id;
  });

  it('places a hold with a short 2-second TTL and asserts initial HELD state', async () => {
    const res = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId,
        seatIds: [seatId],
        ttlSeconds: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.holdId).toBeDefined();

    // Verify seat is HELD in database
    const seatRecord = db.prepare(`
      SELECT status FROM event_seats WHERE event_id = ? AND seat_id = ?
    `).get(eventId, seatId) as { status: string };
    expect(seatRecord.status).toBe('HELD');
  });

  it('lazily expires the hold when seat map is fetched after TTL without waiting for sweeper', async () => {
    // Wait 2.2 seconds to ensure TTL has expired
    await new Promise(resolve => setTimeout(resolve, 2200));

    // Request seat map (triggers lazy inline expiry check)
    const mapRes = await request(app).get(`/api/events/${eventId}/seats`);
    expect(mapRes.status).toBe(200);

    const targetSeat = mapRes.body.seats.find((s: any) => s.seatId === seatId);
    expect(targetSeat).toBeDefined();
    expect(targetSeat.status).toBe('AVAILABLE');

    // Database verification: hold is marked EXPIRED and seat is AVAILABLE
    const dbSeat = db.prepare(`
      SELECT status, current_hold_id FROM event_seats WHERE event_id = ? AND seat_id = ?
    `).get(eventId, seatId) as { status: string; current_hold_id: string | null };
    expect(dbSeat.status).toBe('AVAILABLE');
    expect(dbSeat.current_hold_id).toBeNull();
  });

  it('background sweeper automatically expires active holds and frees seats', async () => {
    // Place another hold with 1s TTL
    const res = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId,
        seatIds: [seatId],
        ttlSeconds: 1,
      });

    expect(res.status).toBe(201);
    const holdId = res.body.holdId;

    // Wait 1.5 seconds
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Manually invoke sweeper tick
    holdSweeperService.sweep();

    const hold = db.prepare(`SELECT status FROM seat_holds WHERE id = ?`).get(holdId) as { status: string };
    expect(hold.status).toBe('EXPIRED');

    const dbSeat = db.prepare(`
      SELECT status, current_hold_id FROM event_seats WHERE event_id = ? AND seat_id = ?
    `).get(eventId, seatId) as { status: string; current_hold_id: string | null };
    expect(dbSeat.status).toBe('AVAILABLE');
    expect(dbSeat.current_hold_id).toBeNull();
  });
});
