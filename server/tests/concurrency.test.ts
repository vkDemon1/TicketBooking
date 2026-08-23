import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';

describe('CONCURRENCY TEST: Simultaneous Seat Holds', () => {
  let eventId: string;
  let targetSeatId: string;
  let customerTokens: string[] = [];

  beforeAll(async () => {
    await seed();

    // Find Dune event and a specific AVAILABLE seat
    const event = db.prepare(`
      SELECT e.id FROM events e WHERE e.title LIKE '%Dune%'
    `).get() as { id: string };
    eventId = event.id;

    const seat = db.prepare(`
      SELECT es.seat_id FROM event_seats es
      WHERE es.event_id = ? AND es.status = 'AVAILABLE'
      LIMIT 1
    `).get(eventId) as { seat_id: string };
    targetSeatId = seat.seat_id;

    // Login 20 distinct customer accounts / demo logins
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ role: 'CUSTOMER', email: `race_user_${i}@cineconcert.io` });
      customerTokens.push(res.body.token);
    }
  });

  it('allows EXACTLY 1 winner and 19 HTTP 409 conflicts when 20 requests compete for the same seat', async () => {
    // Fire 20 simultaneous hold requests for targetSeatId
    const holdPromises = customerTokens.map(token =>
      request(app)
        .post('/api/bookings/hold')
        .set('Authorization', `Bearer ${token}`)
        .send({
          eventId,
          seatIds: [targetSeatId],
          ttlSeconds: 60,
        })
    );

    const responses = await Promise.all(holdPromises);

    const successResponses = responses.filter(r => r.status === 201 || r.status === 200);
    const conflictResponses = responses.filter(r => r.status === 409);

    // Strict assertions
    expect(successResponses.length).toBe(1);
    expect(conflictResponses.length).toBe(19);

    // Verify winner payload
    const winner = successResponses[0];
    expect(winner.body.holdId).toBeDefined();
    expect(winner.body.seatIds).toContain(targetSeatId);

    // Verify loser error messages
    for (const conflict of conflictResponses) {
      expect(conflict.body.error).toContain('no longer available');
    }

    // Direct database assertions
    const activeHolds = db.prepare(`
      SELECT * FROM seat_holds WHERE event_id = ? AND status = 'ACTIVE'
    `).all(eventId) as any[];
    
    // Exactly 1 hold record contains targetSeatId
    const matchingHolds = activeHolds.filter(h => h.seat_ids_json.includes(targetSeatId));
    expect(matchingHolds.length).toBe(1);

    // Exactly 1 event_seat in HELD status for targetSeatId
    const seatState = db.prepare(`
      SELECT status, current_hold_id FROM event_seats WHERE event_id = ? AND seat_id = ?
    `).get(eventId, targetSeatId) as { status: string; current_hold_id: string };

    expect(seatState.status).toBe('HELD');
    expect(seatState.current_hold_id).toBe(winner.body.holdId);
  });
});
