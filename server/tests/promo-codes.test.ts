import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/index.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/db/seed.js';

describe('PROMO CODES & DISCOUNT ENGINE TEST SUITE (PHASE 2A)', () => {
  let customerToken: string;
  let organizerToken: string;
  let eventId: string;

  beforeAll(async () => {
    await seed();

    // Login customer (alice)
    const custAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@cineconcert.io', password: 'password123' });
    customerToken = custAuth.body.token;

    // Login organizer (organizer1)
    const orgAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'organizer@cineconcert.io', password: 'password123' });
    organizerToken = orgAuth.body.token;

    const event = db.prepare('SELECT id FROM events LIMIT 1').get() as any;
    eventId = event.id;
  });

  it('1. Organizer can create a percentage promo code with max cap', async () => {
    const res = await request(app)
      .post('/api/promos')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        code: 'SUMMER20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 50,
        maxDiscount: 30,
        maxUses: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.promo.code).toBe('SUMMER20');
    expect(res.body.promo.discount_type).toBe('PERCENTAGE');
    expect(res.body.promo.discount_value).toBe(20);
    expect(res.body.promo.max_discount).toBe(30);
  });

  it('2. Organizer can create a flat discount promo code', async () => {
    const res = await request(app)
      .post('/api/promos')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        code: 'FLAT15',
        discountType: 'FLAT',
        discountValue: 15,
        minOrderAmount: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.promo.code).toBe('FLAT15');
    expect(res.body.promo.discount_type).toBe('FLAT');
    expect(res.body.promo.discount_value).toBe(15);
  });

  it('3. Validate endpoint correctly computes percentage discount with cap', async () => {
    // 20% of $100 = $20 discount (under $30 cap)
    const res1 = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'SUMMER20',
        originalAmount: 100,
      });

    expect(res1.status).toBe(200);
    expect(res1.body.valid).toBe(true);
    expect(res1.body.discountAmount).toBe(20);
    expect(res1.body.netAmount).toBe(80);

    // 20% of $200 = $40 -> capped at $30
    const res2 = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'SUMMER20',
        originalAmount: 200,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.discountAmount).toBe(30);
    expect(res2.body.netAmount).toBe(170);
  });

  it('4. Validate endpoint rejects order below minOrderAmount', async () => {
    const res = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'SUMMER20',
        originalAmount: 30, // Below minOrderAmount of $50
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Minimum order amount');
  });

  it('5. Validate endpoint rejects expired promo code', async () => {
    // Insert expired promo
    db.prepare(`
      INSERT INTO promo_codes (
        id, code, discount_type, discount_value, min_order_amount,
        valid_until, is_active
      ) VALUES (?, 'EXPIRED50', 'PERCENTAGE', 50, 0, datetime('now', '-1 day'), 1)
    `).run(uuidv4());

    const res = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'EXPIRED50',
        originalAmount: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('expired');
  });

  it('6. Validate endpoint rejects deactivated promo code', async () => {
    db.prepare(`
      INSERT INTO promo_codes (
        id, code, discount_type, discount_value, is_active
      ) VALUES (?, 'INACTIVE10', 'FLAT', 10, 0)
    `).run(uuidv4());

    const res = await request(app)
      .post('/api/promos/validate')
      .send({
        code: 'INACTIVE10',
        originalAmount: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inactive');
  });

  it('7. Atomic Checkout successfully applies promo code and updates usage count', async () => {
    // Create a special promo code for checkout test
    const promoId = uuidv4();
    db.prepare(`
      INSERT INTO promo_codes (
        id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count, is_active
      ) VALUES (?, 'CHECKOUT25', 'PERCENTAGE', 25, 0, 10, 0, 1)
    `).run(promoId);

    // Find 2 available seats
    const seats = db.prepare(`
      SELECT seat_id FROM event_seats WHERE event_id = ? AND status = 'AVAILABLE' LIMIT 2
    `).all(eventId) as any[];

    const seatIds = seats.map(s => s.seat_id);

    // Hold seats
    const holdRes = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ eventId, seatIds });

    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.holdId;

    // Checkout with promo code
    const checkoutRes = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ holdId, promoCode: 'CHECKOUT25' });

    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.booking.appliedPromoCode).toBe('CHECKOUT25');
    expect(checkoutRes.body.booking.originalAmount).toBeGreaterThan(0);
    expect(checkoutRes.body.booking.discountAmount).toBeGreaterThan(0);
    expect(checkoutRes.body.booking.totalAmount).toBe(
      checkoutRes.body.booking.originalAmount - checkoutRes.body.booking.discountAmount
    );

    // Verify promo_codes table usage count incremented
    const promoRow = db.prepare('SELECT uses_count FROM promo_codes WHERE id = ?').get(promoId) as any;
    expect(promoRow.uses_count).toBe(1);

    // Verify bookings table audit columns
    const bookingRow = db.prepare('SELECT original_amount, discount_amount, promo_code_id FROM bookings WHERE id = ?').get(checkoutRes.body.booking.id) as any;
    expect(bookingRow.promo_code_id).toBe(promoId);
    expect(bookingRow.original_amount).toBe(checkoutRes.body.booking.originalAmount);
    expect(bookingRow.discount_amount).toBe(checkoutRes.body.booking.discountAmount);
  });

  it('8. Concurrency & Zero-Overuse Guarantee: Promo code with max_uses = 1 cannot be overused', async () => {
    const singleUsePromoId = uuidv4();
    db.prepare(`
      INSERT INTO promo_codes (
        id, code, discount_type, discount_value, max_uses, uses_count, is_active
      ) VALUES (?, 'EXCLUSIVEONE', 'FLAT', 20, 1, 0, 1)
    `).run(singleUsePromoId);

    // Get another customer (bob)
    const bobAuth = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@cineconcert.io', password: 'password123' });
    const bobToken = bobAuth.body.token;

    // Find available seats for alice and bob
    const availSeats = db.prepare(`
      SELECT seat_id FROM event_seats WHERE event_id = ? AND status = 'AVAILABLE' LIMIT 2
    `).all(eventId) as any[];

    // Alice holds seat 1
    const aliceHold = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ eventId, seatIds: [availSeats[0].seat_id] });

    // Bob holds seat 2
    const bobHold = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ eventId, seatIds: [availSeats[1].seat_id] });

    // First checkout uses the code
    const firstCheckout = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ holdId: aliceHold.body.holdId, promoCode: 'EXCLUSIVEONE' });

    expect(firstCheckout.status).toBe(201);
    expect(firstCheckout.body.booking.appliedPromoCode).toBe('EXCLUSIVEONE');

    // Second checkout with the same promo code must fail
    const secondCheckout = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ holdId: bobHold.body.holdId, promoCode: 'EXCLUSIVEONE' });

    expect(secondCheckout.status).toBe(400);
    expect(secondCheckout.body.error).toContain('usage limit');

    // Invariant: uses_count must be strictly 1
    const promoCheck = db.prepare('SELECT uses_count, max_uses FROM promo_codes WHERE id = ?').get(singleUsePromoId) as any;
    expect(promoCheck.uses_count).toBe(1);
  });
});
