import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';
import { waitlistService } from '../src/services/waitlist.service.js';

describe('WAITLIST CASCADE TEST: Cancellation, Auto-Assignment & Cascading Offers', () => {
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let eventId: string;
  let aliceBookingId: string;

  beforeAll(async () => {
    await seed();

    // Login Alice (who holds a demo booking for Interstellar VIP seats A1-A2)
    const aRes = await request(app).post('/api/auth/login').send({ email: 'alice@cineconcert.io', password: 'password123' });
    aliceToken = aRes.body.token;

    // Login Bob (who is #1 on waitlist for VIP - 2 seats)
    const bRes = await request(app).post('/api/auth/login').send({ email: 'bob@cineconcert.io', password: 'password123' });
    bobToken = bRes.body.token;

    // Login Charlie (who is #2 on waitlist for VIP - 1 seat)
    const cRes = await request(app).post('/api/auth/login').send({ email: 'charlie@cineconcert.io', password: 'password123' });
    charlieToken = cRes.body.token;

    // Find Alice's booking
    const booking = db.prepare(`SELECT id, event_id FROM bookings WHERE user_id = ? AND status = 'CONFIRMED' LIMIT 1`).get(aRes.body.user.id) as any;
    aliceBookingId = booking.id;
    eventId = booking.event_id;
  });

  it('Alice cancels her booking -> VIP seats transition to WAITLIST_HELD and Bob receives an offer', async () => {
    const cancelRes = await request(app)
      .post(`/api/bookings/${aliceBookingId}/cancel`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.waitlistOffersCreated).toBe(1);

    // Verify Bob's waitlist entry is now OFFERED
    const bobEntry = db.prepare(`
      SELECT we.*, wo.id as offer_id, wo.claim_token, wo.status as offer_status
      FROM waitlist_entries we
      JOIN users u ON we.user_id = u.id
      JOIN waitlist_offers wo ON wo.waitlist_entry_id = we.id
      WHERE u.email = 'bob@cineconcert.io' AND we.event_id = ?
    `).get(eventId) as any;

    expect(bobEntry).toBeDefined();
    expect(bobEntry.status).toBe('OFFERED');
    expect(bobEntry.offer_status).toBe('PENDING');
    expect(bobEntry.claim_token).toBeDefined();

    // Verify seats are in WAITLIST_HELD status
    const seats = db.prepare(`
      SELECT status FROM event_seats WHERE event_id = ? AND seat_id IN (
        SELECT bs.seat_id FROM booking_seats bs WHERE bs.booking_id = ?
      )
    `).all(eventId, aliceBookingId) as Array<{ status: string }>;

    for (const s of seats) {
      expect(s.status).toBe('WAITLIST_HELD');
    }
  });

  it('Simulate Bob letting offer expire -> Sweeper cascades seat offer to Charlie', async () => {
    // Manually force Bob's offer expiration date into the past for deterministic testing
    db.prepare(`
      UPDATE waitlist_offers
      SET expires_at = datetime('now', '-10 seconds')
      WHERE status = 'PENDING'
    `).run();

    // Run waitlist sweeper
    waitlistService.sweep();

    // Assert Bob's offer is now EXPIRED
    const bobOffers = db.prepare(`
      SELECT wo.status FROM waitlist_offers wo
      JOIN waitlist_entries we ON wo.waitlist_entry_id = we.id
      JOIN users u ON we.user_id = u.id
      WHERE u.email = 'bob@cineconcert.io'
    `).all() as Array<{ status: string }>;
    expect(bobOffers.every(o => o.status === 'EXPIRED')).toBe(true);

    // Assert Charlie now has an active PENDING offer!
    const charlieEntry = db.prepare(`
      SELECT we.*, wo.id as offer_id, wo.claim_token, wo.status as offer_status
      FROM waitlist_entries we
      JOIN users u ON we.user_id = u.id
      JOIN waitlist_offers wo ON wo.waitlist_entry_id = we.id
      WHERE u.email = 'charlie@cineconcert.io' AND we.event_id = ?
    `).get(eventId) as any;

    expect(charlieEntry).toBeDefined();
    expect(charlieEntry.status).toBe('OFFERED');
    expect(charlieEntry.offer_status).toBe('PENDING');
  });

  it('Charlie successfully claims his offer -> Booking is confirmed and seat becomes BOOKED', async () => {
    // Fetch Charlie's claim token
    const charlieOffer = db.prepare(`
      SELECT wo.claim_token
      FROM waitlist_offers wo
      JOIN waitlist_entries we ON wo.waitlist_entry_id = we.id
      JOIN users u ON we.user_id = u.id
      WHERE u.email = 'charlie@cineconcert.io' AND wo.status = 'PENDING'
    `).get() as { claim_token: string };

    expect(charlieOffer).toBeDefined();

    const claimRes = await request(app)
      .post('/api/waitlist/claim')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ token: charlieOffer.claim_token });

    expect(claimRes.status).toBe(201);
    expect(claimRes.body.booking.bookingReference).toBeDefined();
    expect(claimRes.body.booking.qrCode).toBeDefined();

    // Verify database state: offer is ACCEPTED, entry is CONVERTED, and booking exists
    const offerRecord = db.prepare(`SELECT status FROM waitlist_offers WHERE claim_token = ?`).get(charlieOffer.claim_token) as { status: string };
    expect(offerRecord.status).toBe('ACCEPTED');

    const entryRecord = db.prepare(`
      SELECT we.status FROM waitlist_entries we
      JOIN users u ON we.user_id = u.id
      WHERE u.email = 'charlie@cineconcert.io'
    `).get() as { status: string };
    expect(entryRecord.status).toBe('CONVERTED');
  });
});
