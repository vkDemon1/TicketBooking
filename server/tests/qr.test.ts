import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';

describe('QR VERIFICATION TEST: Cryptographic Validation & Booking States', () => {
  let validBookingRef: string;
  let validSignature: string;
  let aliceToken: string;

  beforeAll(async () => {
    await seed();

    const authRes = await request(app).post('/api/auth/login').send({ email: 'alice@cineconcert.io', password: 'password123' });
    aliceToken = authRes.body.token;

    const booking = db.prepare(`SELECT booking_reference, qr_signature FROM bookings WHERE status = 'CONFIRMED' LIMIT 1`).get() as any;
    validBookingRef = booking.booking_reference;
    validSignature = booking.qr_signature;
  });

  it('verifies a valid ticket QR payload using canonical GET endpoint and returns VALID status', async () => {
    const res = await request(app)
      .get(`/api/bookings/verify/${validBookingRef}?signature=${validSignature}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VALID');
    expect(res.body.bookingReference).toBe(validBookingRef);
    expect(res.body.attendee).toBeDefined();
    expect(res.body.event).toBeDefined();
  });

  it('rejects a counterfeit ticket QR with forged signature and returns INVALID', async () => {
    const fakeSignature = 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';

    const res = await request(app)
      .get(`/api/bookings/verify/${validBookingRef}?signature=${fakeSignature}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('INVALID');
    expect(res.body.message).toContain('mismatch');
  });

  it('reports CANCELLED status when a cancelled ticket is verified', async () => {
    // Cancel the booking
    const booking = db.prepare(`SELECT id FROM bookings WHERE booking_reference = ?`).get(validBookingRef) as any;
    await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const res = await request(app)
      .get(`/api/bookings/verify/${validBookingRef}?signature=${validSignature}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.message).toContain('CANCELLED');
  });
});
