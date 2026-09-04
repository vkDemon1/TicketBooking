import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';

describe('GATE CHECK-IN & ANTI-FRAUD REDEMPTION TEST SUITE', () => {
  let validBookingRef: string;
  let validSignature: string;
  let eventId: string;
  let aliceToken: string;

  beforeAll(async () => {
    await seed();

    const authRes = await request(app).post('/api/auth/login').send({ email: 'alice@cineconcert.io', password: 'password123' });
    aliceToken = authRes.body.token;

    const booking = db.prepare(`SELECT id, event_id, booking_reference, qr_signature, is_redeemed FROM bookings WHERE status = 'CONFIRMED' LIMIT 1`).get() as any;
    validBookingRef = booking.booking_reference;
    validSignature = booking.qr_signature;
    eventId = booking.event_id;
  });

  it('1. Successfully checks in a valid ticket at the gate', async () => {
    const checkInRes = await request(app)
      .post('/api/bookings/check-in')
      .send({
        bookingReference: validBookingRef,
        signature: validSignature,
        gateStaffName: 'Gate Staff North Door',
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.success).toBe(true);
    expect(checkInRes.body.status).toBe('CHECKED_IN');
    expect(checkInRes.body.redeemedBy).toBe('Gate Staff North Door');
    expect(checkInRes.body.redeemedAt).toBeDefined();
    expect(checkInRes.body.seats.length).toBeGreaterThan(0);

    // Verify database row
    const row = db.prepare('SELECT is_redeemed, redeemed_at, redeemed_by FROM bookings WHERE booking_reference = ?').get(validBookingRef) as any;
    expect(row.is_redeemed).toBe(1);
    expect(row.redeemed_by).toBe('Gate Staff North Door');
    expect(row.redeemed_at).toBeTruthy();
  });

  it('2. Verification endpoint reflects REDEEMED status after check-in', async () => {
    const verifyRes = await request(app)
      .get(`/api/bookings/verify/${validBookingRef}?signature=${validSignature}`);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe('REDEEMED');
    expect(verifyRes.body.isRedeemed).toBe(true);
    expect(verifyRes.body.redeemedBy).toBe('Gate Staff North Door');
    expect(verifyRes.body.message).toContain('already redeemed');
  });

  it('3. Anti-Fraud: Re-scanning already redeemed ticket returns HTTP 409 Conflict', async () => {
    const duplicateRes = await request(app)
      .post('/api/bookings/check-in')
      .send({
        bookingReference: validBookingRef,
        signature: validSignature,
        gateStaffName: 'Gate Staff South Door',
      });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.success).toBe(false);
    expect(duplicateRes.body.status).toBe('ALREADY_REDEEMED');
    expect(duplicateRes.body.message).toContain('already redeemed');
    expect(duplicateRes.body.redeemedAt).toBeDefined();
  });

  it('4. Rejects check-in for counterfeit / forged signature', async () => {
    const fakeSignature = 'deadbeef00000000000000000000000000000000000000000000000000000000';
    const forgedRes = await request(app)
      .post('/api/bookings/check-in')
      .send({
        bookingReference: validBookingRef,
        signature: fakeSignature,
      });

    expect(forgedRes.status).toBe(400);
    expect(forgedRes.body.success).toBe(false);
    expect(forgedRes.body.status).toBe('INVALID');
  });

  it('5. Gate stats endpoint reports accurate attendance counts', async () => {
    const statsRes = await request(app)
      .get(`/api/bookings/gate-stats/${eventId}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.eventId).toBe(eventId);
    expect(statsRes.body.totalTicketsSold).toBeGreaterThan(0);
    expect(statsRes.body.totalCheckedIn).toBeGreaterThan(0);
    expect(statsRes.body.checkInRate).toBeGreaterThan(0);
    expect(statsRes.body.recentCheckIns.length).toBeGreaterThan(0);
    expect(statsRes.body.recentCheckIns[0].bookingReference).toBe(validBookingRef);
  });

  it('6. Concurrency Anti-Fraud: Simultaneous gate scans for same ticket allows strictly 1 check-in', async () => {
    // Create a new booking for Charlie to test concurrent scanning
    const charlieAuth = await request(app).post('/api/auth/login').send({ email: 'charlie@cineconcert.io', password: 'password123' });
    const charlieToken = charlieAuth.body.token;

    // Hold an available seat
    const eventSeats = db.prepare(`SELECT seat_id FROM event_seats WHERE event_id = ? AND status = 'AVAILABLE' LIMIT 1`).get(eventId) as any;
    const holdRes = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ eventId, seatIds: [eventSeats.seat_id] });

    const checkoutRes = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ holdId: holdRes.body.holdId });

    const newBookingRef = checkoutRes.body.booking.bookingReference;
    const newSignature = checkoutRes.body.booking.signature;

    // Fire 5 concurrent check-in requests
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/bookings/check-in')
          .send({
            bookingReference: newBookingRef,
            signature: newSignature,
            gateStaffName: `Gate Agent #${i + 1}`,
          })
      )
    );

    const successCount = results.filter(r => r.status === 200).length;
    const conflictCount = results.filter(r => r.status === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);
  });
});
