import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';

describe('BOOKING CONVERSION CONCURRENCY TEST', () => {
  let customerToken: string;
  let eventId: string;
  let seatId: string;
  let holdId: string;

  beforeAll(async () => {
    await seed();

    const authRes = await request(app)
      .post('/api/auth/demo-login')
      .send({ role: 'CUSTOMER', email: 'checkout_race@cineconcert.io' });
    customerToken = authRes.body.token;

    const event = db.prepare(`SELECT id FROM events WHERE title LIKE '%Dune%'`).get() as { id: string };
    eventId = event.id;

    // Pick an AVAILABLE seat with no previous booking records
    const seat = db.prepare(`
      SELECT es.seat_id FROM event_seats es
      WHERE es.event_id = ? AND es.status = 'AVAILABLE'
      AND es.seat_id NOT IN (SELECT seat_id FROM booking_seats)
      LIMIT 1
    `).get(eventId) as { seat_id: string };
    seatId = seat.seat_id;

    // Place an active hold
    const holdRes = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId,
        seatIds: [seatId],
        ttlSeconds: 60,
      });

    holdId = holdRes.body.holdId;
  });

  it('allows strictly 1 successful booking checkout and rejects simultaneous duplicate checkouts for the same hold', async () => {
    // Fire 5 concurrent checkout requests with the same holdId
    const checkoutRequests = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/bookings/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ holdId })
    );

    const responses = await Promise.all(checkoutRequests);

    const success = responses.filter(r => r.status === 201);
    const conflicts = responses.filter(r => r.status === 409);

    expect(success.length).toBe(1);
    expect(conflicts.length).toBe(4);

    // Verify hold status in database is CONVERTED
    const holdRecord = db.prepare(`SELECT status FROM seat_holds WHERE id = ?`).get(holdId) as { status: string };
    expect(holdRecord.status).toBe('CONVERTED');

    // Verify seat is BOOKED and exactly 1 booking exists
    const seatRecord = db.prepare(`
      SELECT status FROM event_seats WHERE event_id = ? AND seat_id = ?
    `).get(eventId, seatId) as { status: string };
    expect(seatRecord.status).toBe('BOOKED');

    const bookingsCount = db.prepare(`
      SELECT COUNT(*) as count FROM booking_seats WHERE seat_id = ?
    `).get(seatId) as { count: number };
    expect(bookingsCount.count).toBe(1);
  });
});
