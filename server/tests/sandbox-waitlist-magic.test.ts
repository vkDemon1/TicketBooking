import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';
import { QrService } from '../src/services/qr.service.js';
import { WaitlistService } from '../src/services/waitlist.service.js';

describe('SANDBOX, QR VERIFICATION & WAITLIST MAGIC LINKS TEST SUITE', () => {
  beforeEach(async () => {
    await seed();
  });

  it('1. Pre-seeded booking creates valid QR and is immediately visible in sandbox', async () => {
    const res = await request(app).get('/api/sandbox/emails');
    expect(res.status).toBe(200);
    expect(res.body.emails).toBeDefined();
    expect(Array.isArray(res.body.emails)).toBe(true);
    expect(res.body.emails.length).toBeGreaterThan(0);

    const ticketEmail = res.body.emails.find((e: any) => e.template === 'TICKET_CONFIRMATION');
    expect(ticketEmail).toBeDefined();
    expect(ticketEmail.data.bookingReference).toMatch(/^BK-/);
    expect(ticketEmail.data.signature).toBeDefined();
    expect(ticketEmail.data.qrCode).toMatch(/^data:image\/png;base64,/);

    // Verify QR signature
    const isValid = QrService.verifySignature(ticketEmail.data.bookingReference, ticketEmail.data.signature);
    expect(isValid).toBe(true);
  });

  it('2. New booking creates QR data, logs email to sandbox, and verifies at gate', async () => {
    // Login as Bob
    const authRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@cineconcert.io', password: 'password123' });
    const token = authRes.body.token;

    // Fetch Dune 2 event
    const event = db.prepare("SELECT id FROM events WHERE title LIKE '%Dune%'").get() as { id: string };
    const availSeat = db.prepare("SELECT seat_id FROM event_seats WHERE event_id = ? AND status = 'AVAILABLE' LIMIT 1").get(event.id) as { seat_id: string };

    // Hold seat
    const holdRes = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId: event.id, seatIds: [availSeat.seat_id], ttlSeconds: 60 });
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.holdId;

    // Checkout
    const checkoutRes = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId });
    expect(checkoutRes.status).toBe(201);
    const bookingRef = checkoutRes.body.booking.bookingReference;
    expect(checkoutRes.body.booking.qrCode).toMatch(/^data:image\/png;base64,/);

    // Check sandbox for new ticket email
    const sandboxRes = await request(app).get('/api/sandbox/emails');
    const newTicket = sandboxRes.body.emails.find((e: any) => e.data?.bookingReference === bookingRef);
    expect(newTicket).toBeDefined();
    expect(newTicket.toEmail).toBe('bob@cineconcert.io');

    // Gate Verification
    const verifyRes = await request(app)
      .get(`/api/bookings/verify/${bookingRef}?signature=${newTicket.data.signature}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe('VALID');
    expect(verifyRes.body.bookingReference).toBe(bookingRef);

    // Gate Counterfeit Verification Test
    const fakeVerify = await request(app)
      .get(`/api/bookings/verify/${bookingRef}?signature=fake_counterfeit_signature_12345`);
    expect(fakeVerify.status).toBe(200);
    expect(fakeVerify.body.status).toBe('INVALID');
  });

  it('3. Cancellation generates waitlist offer, magic claim link in sandbox, and allows claiming', async () => {
    // Alice logs in and cancels her pre-seeded Interstellar booking
    const aliceAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@cineconcert.io', password: 'password123' });
    const aliceToken = aliceAuth.body.token;

    const aliceBooking = db.prepare("SELECT id, booking_reference, qr_signature FROM bookings WHERE user_id = ? AND status = 'CONFIRMED'").get(aliceAuth.body.user.id) as any;
    expect(aliceBooking).toBeDefined();

    // Cancel booking
    const cancelRes = await request(app)
      .post(`/api/bookings/${aliceBooking.id}/cancel`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.waitlistOffersCreated).toBe(1);

    // Verify cancelled QR code reports CANCELLED status
    const verifyCancelled = await request(app)
      .get(`/api/bookings/verify/${aliceBooking.booking_reference}?signature=${aliceBooking.qr_signature}`);
    expect(verifyCancelled.status).toBe(200);
    expect(verifyCancelled.body.status).toBe('CANCELLED');

    // Inspect sandbox for waitlist offer email sent to Bob
    const sandboxRes = await request(app).get('/api/sandbox/emails');
    const offerEmail = sandboxRes.body.emails.find((e: any) => e.template === 'WAITLIST_OFFER' && e.toEmail === 'bob@cineconcert.io');
    expect(offerEmail).toBeDefined();
    expect(offerEmail.data.claimToken).toBeDefined();
    expect(offerEmail.data.claimUrl).toContain('/events/');
    expect(offerEmail.data.claimUrl).toContain('/claim?token=');

    // Inspect offer by magic token
    const inspectOfferRes = await request(app)
      .get(`/api/waitlist/offer/${offerEmail.data.claimToken}`);
    expect(inspectOfferRes.status).toBe(200);
    expect(inspectOfferRes.body.offer.seats.length).toBe(2);

    // Bob logs in and claims offer
    const bobAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@cineconcert.io', password: 'password123' });

    const claimRes = await request(app)
      .post('/api/waitlist/claim')
      .set('Authorization', `Bearer ${bobAuth.body.token}`)
      .send({ token: offerEmail.data.claimToken });
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.booking.bookingReference).toBeDefined();

    // Verify Bob's new booking is now CONFIRMED
    const bobBookingRef = claimRes.body.booking.bookingReference;
    const verifyBob = await request(app).get(`/api/bookings/verify/${bobBookingRef}`);
    expect(verifyBob.body.status).toBe('VALID');
  });

  it('4. Expired waitlist offer cascades to next fan in line', async () => {
    // Alice cancels booking
    const alice = db.prepare("SELECT id FROM users WHERE email = 'alice@cineconcert.io'").get() as any;
    const booking = db.prepare("SELECT id FROM bookings WHERE user_id = ?").get(alice.id) as any;

    const aliceAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@cineconcert.io', password: 'password123' });

    await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${aliceAuth.body.token}`);

    // Backdate Bob's offer to expired
    db.prepare("UPDATE waitlist_offers SET expires_at = datetime('now', '-10 seconds') WHERE status = 'PENDING'").run();

    // Trigger sweeper
    const ws = new WaitlistService();
    ws.sweep();

    // Check sandbox for cascaded offer email sent to Charlie
    const sandboxRes = await request(app).get('/api/sandbox/emails');
    const charlieOffer = sandboxRes.body.emails.find((e: any) => e.template === 'WAITLIST_OFFER' && e.toEmail === 'charlie@cineconcert.io');
    expect(charlieOffer).toBeDefined();
    expect(charlieOffer.data.claimToken).toBeDefined();

    // Verify Bob's expired token can no longer be used
    const bobOffer = db.prepare("SELECT claim_token FROM waitlist_offers WHERE status = 'EXPIRED'").get() as any;
    const bobAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@cineconcert.io', password: 'password123' });

    const failedClaim = await request(app)
      .post('/api/waitlist/claim')
      .set('Authorization', `Bearer ${bobAuth.body.token}`)
      .send({ token: bobOffer.claim_token });
    expect([409, 410]).toContain(failedClaim.status); // 409 Conflict (status: EXPIRED) or 410 Gone
  });
});
