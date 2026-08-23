import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db, initDatabase } from '../config/db.js';
import { QrService } from '../services/qr.service.js';
import { logger } from '../utils/logger.js';

export async function seed(): Promise<void> {
  logger.info('🌱 Seeding Ticket Booking Database with demo data...');

  initDatabase();

  // Clean existing data
  db.exec(`
    DELETE FROM email_logs;
    DELETE FROM waitlist_offers;
    DELETE FROM waitlist_entries;
    DELETE FROM booking_seats;
    DELETE FROM bookings;
    DELETE FROM seat_holds;
    DELETE FROM event_seats;
    DELETE FROM event_seat_pricing;
    DELETE FROM events;
    DELETE FROM seats;
    DELETE FROM venues;
    DELETE FROM users;
  `);

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Demo Users
  const adminId = uuidv4();
  const organizerId = uuidv4();
  const aliceId = uuidv4();
  const bobId = uuidv4();
  const charlieId = uuidv4();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run(adminId, 'admin@cineconcert.io', passwordHash, 'Alex Vance (Platform Admin)', 'ADMIN');
  insertUser.run(organizerId, 'organizer@cineconcert.io', passwordHash, 'Apex Live Entertainment', 'ORGANIZER');
  insertUser.run(aliceId, 'alice@cineconcert.io', passwordHash, 'Alice Walker', 'CUSTOMER');
  insertUser.run(bobId, 'bob@cineconcert.io', passwordHash, 'Bob Martinez', 'CUSTOMER');
  insertUser.run(charlieId, 'charlie@cineconcert.io', passwordHash, 'Charlie Davis', 'CUSTOMER');

  logger.info('✓ Created Users: Admin, Organizer, Alice, Bob, Charlie (Password: password123)');

  // 2. Create Venues
  const venue1Id = uuidv4(); // IMAX Cinema
  const venue2Id = uuidv4(); // Concert Hall
  const venue3Id = uuidv4(); // Grand Stadium

  const insertVenue = db.prepare(`
    INSERT INTO venues (id, name, address, city, type, rows, cols)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertVenue.run(venue1Id, 'Starlight IMAX Cinema', '450 West 42nd St', 'New York', 'CINEMA', 6, 8);
  insertVenue.run(venue2Id, 'Symphony Grand Arena', '111 South Grand Ave', 'Los Angeles', 'CONCERT_HALL', 8, 10);
  insertVenue.run(venue3Id, 'Metro Colosseum', '1410 Museum Campus Dr', 'Chicago', 'STADIUM', 10, 12);

  logger.info('✓ Created Venues: Starlight IMAX, Symphony Grand Arena, Metro Colosseum');

  // 3. Create Base Seats for Venues
  const insertSeat = db.prepare(`
    INSERT INTO seats (id, venue_id, row_label, seat_number, category, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  // Venue 1: Cinema (6 rows A-F, 8 cols = 48 seats)
  const venue1Seats: Array<{ id: string; row: string; num: number; cat: string }> = [];
  for (let r = 0; r < 6; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const category = r < 2 ? 'VIP' : r < 4 ? 'PREMIUM' : 'STANDARD';
    for (let c = 1; c <= 8; c++) {
      const sId = uuidv4();
      insertSeat.run(sId, venue1Id, rowLabel, c, category);
      venue1Seats.push({ id: sId, row: rowLabel, num: c, cat: category });
    }
  }

  // Venue 2: Concert Hall (8 rows A-H, 10 cols = 80 seats)
  const venue2Seats: Array<{ id: string; row: string; num: number; cat: string }> = [];
  for (let r = 0; r < 8; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const category = r < 2 ? 'VIP' : r < 5 ? 'PREMIUM' : 'BALCONY';
    for (let c = 1; c <= 10; c++) {
      const sId = uuidv4();
      insertSeat.run(sId, venue2Id, rowLabel, c, category);
      venue2Seats.push({ id: sId, row: rowLabel, num: c, cat: category });
    }
  }

  // Venue 3: Stadium (10 rows A-J, 12 cols = 120 seats)
  for (let r = 0; r < 10; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const category = r < 2 ? 'VIP' : r < 6 ? 'PREMIUM' : 'STANDARD';
    for (let c = 1; c <= 12; c++) {
      insertSeat.run(uuidv4(), venue3Id, rowLabel, c, category);
    }
  }

  logger.info('✓ Generated Seating Grid for all venues');

  // 4. Create Events
  const event1Id = uuidv4(); // Dune 2
  const event2Id = uuidv4(); // Hans Zimmer
  const event3Id = uuidv4(); // Interstellar (Waitlist Demo Show)
  const event4Id = uuidv4(); // Coldplay

  const insertEvent = db.prepare(`
    INSERT INTO events (id, organizer_id, venue_id, title, description, category, banner_url, date_time, duration_mins, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
  `);

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  insertEvent.run(
    event1Id,
    organizerId,
    venue1Id,
    'Dune: Part Two (IMAX 70mm Special)',
    'Experience Denis Villeneuve’s monumental sci-fi masterpiece with pulse-pounding IMAX sound and crystal-clear visuals.',
    'MOVIE',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop',
    tomorrow,
    166
  );

  insertEvent.run(
    event2Id,
    organizerId,
    venue2Id,
    'Hans Zimmer Live: World Symphony Tour',
    'The iconic Oscar-winning composer performs breathtaking orchestral arrangements from Inception, Gladiator, The Dark Knight, and Interstellar live.',
    'CONCERT',
    'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?q=80&w=1000&auto=format&fit=crop',
    nextWeek,
    180
  );

  insertEvent.run(
    event3Id,
    organizerId,
    venue1Id,
    'Interstellar (10th Anniversary Sold-Out Gala)',
    'Exclusive 10th-anniversary celebration screening. Experience the voyage across space and time on the colossal IMAX screen.',
    'MOVIE',
    'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1000&auto=format&fit=crop',
    inTwoDays,
    169
  );

  insertEvent.run(
    event4Id,
    organizerId,
    venue3Id,
    'Coldplay: Music of the Spheres Stadium Tour',
    'A spectacular stadium spectacle featuring vibrant LED wristbands, laser visuals, kinetic energy dancefloors, and timeless anthems.',
    'CONCERT',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1000&auto=format&fit=crop',
    inThreeDays,
    150
  );

  logger.info('✓ Created Movies and Concert events');

  // 5. Create Category Pricing
  const insertPricing = db.prepare(`
    INSERT INTO event_seat_pricing (id, event_id, seat_category, price)
    VALUES (?, ?, ?, ?)
  `);

  // Event 1 (Dune 2)
  insertPricing.run(uuidv4(), event1Id, 'VIP', 35.0);
  insertPricing.run(uuidv4(), event1Id, 'PREMIUM', 24.0);
  insertPricing.run(uuidv4(), event1Id, 'STANDARD', 18.0);

  // Event 2 (Hans Zimmer)
  insertPricing.run(uuidv4(), event2Id, 'VIP', 160.0);
  insertPricing.run(uuidv4(), event2Id, 'PREMIUM', 95.0);
  insertPricing.run(uuidv4(), event2Id, 'BALCONY', 55.0);

  // Event 3 (Interstellar Gala)
  insertPricing.run(uuidv4(), event3Id, 'VIP', 40.0);
  insertPricing.run(uuidv4(), event3Id, 'PREMIUM', 28.0);
  insertPricing.run(uuidv4(), event3Id, 'STANDARD', 20.0);

  // Event 4 (Coldplay)
  insertPricing.run(uuidv4(), event4Id, 'VIP', 190.0);
  insertPricing.run(uuidv4(), event4Id, 'PREMIUM', 110.0);
  insertPricing.run(uuidv4(), event4Id, 'STANDARD', 65.0);

  // 6. Initialize event_seats for each event
  const insertEventSeat = db.prepare(`
    INSERT INTO event_seats (id, event_id, seat_id, status)
    VALUES (?, ?, ?, ?)
  `);

  for (const s of venue1Seats) {
    insertEventSeat.run(uuidv4(), event1Id, s.id, 'AVAILABLE');
  }

  for (const s of venue2Seats) {
    insertEventSeat.run(uuidv4(), event2Id, s.id, 'AVAILABLE');
  }

  // 7. Seed demo bookings for Interstellar Gala (making VIP seats booked so Bob can waitlist them)
  const galaSeats = venue1Seats;
  const bookedSeatIds: string[] = [];

  for (const s of galaSeats) {
    // Make VIP row A booked by Alice
    if (s.row === 'A') {
      insertEventSeat.run(uuidv4(), event3Id, s.id, 'BOOKED');
      bookedSeatIds.push(s.id);
    } else if (s.row === 'B') {
      // Row B VIP also booked
      insertEventSeat.run(uuidv4(), event3Id, s.id, 'BOOKED');
      bookedSeatIds.push(s.id);
    } else if (s.row === 'C' && s.num <= 4) {
      insertEventSeat.run(uuidv4(), event3Id, s.id, 'BOOKED');
    } else {
      insertEventSeat.run(uuidv4(), event3Id, s.id, 'AVAILABLE');
    }
  }

  // Create confirmed booking for Alice on Interstellar (Seats A1, A2)
  const aliceBookingId = uuidv4();
  const aliceBookingRef = `BK-${Date.now().toString(36).toUpperCase()}-ALICE`;
  const aliceQrSig = QrService.generateSignature(aliceBookingRef);
  const aliceSeats = galaSeats.filter(s => s.row === 'A' && (s.num === 1 || s.num === 2));

  db.prepare(`
    INSERT INTO bookings (id, booking_reference, event_id, user_id, total_amount, status, qr_payload, qr_signature)
    VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
  `).run(aliceBookingId, aliceBookingRef, event3Id, aliceId, 80.0, JSON.stringify({ bookingReference: aliceBookingRef }), aliceQrSig);

  const insertBookingSeat = db.prepare(`
    INSERT INTO booking_seats (id, booking_id, seat_id, price_paid)
    VALUES (?, ?, ?, ?)
  `);
  for (const s of aliceSeats) {
    insertBookingSeat.run(uuidv4(), aliceBookingId, s.id, 40.0);
  }

  // 8. Place Bob on Waitlist for Interstellar Gala (VIP Category, 2 seats)
  const bobWaitlistId = uuidv4();
  db.prepare(`
    INSERT INTO waitlist_entries (id, event_id, user_id, seat_category, seat_count, status)
    VALUES (?, ?, ?, 'VIP', 2, 'WAITING')
  `).run(bobWaitlistId, event3Id, bobId);

  // Place Charlie on Waitlist for Interstellar Gala (VIP Category, 1 seat)
  const charlieWaitlistId = uuidv4();
  db.prepare(`
    INSERT INTO waitlist_entries (id, event_id, user_id, seat_category, seat_count, status)
    VALUES (?, ?, ?, 'VIP', 1, 'WAITING')
  `).run(charlieWaitlistId, event3Id, charlieId);

  logger.info('✓ Seeded Demo Booking for Alice (BK-...-ALICE on Interstellar A1-A2)');
  logger.info('✓ Seeded Demo Waitlist Entries: Bob (VIP - 2 seats), Charlie (VIP - 1 seat)');
  logger.info('🎉 Seed completed successfully!');
}

// If run directly via tsx/node
if (process.argv[1]?.endsWith('seed.ts')) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error('Seed failed:', err);
      process.exit(1);
    });
}
