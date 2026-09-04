-- Database Schema for Ticket Booking Platform
-- SQLite with WAL mode & Foreign Keys enabled

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ORGANIZER', 'CUSTOMER')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Venues
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('CINEMA', 'CONCERT_HALL', 'STADIUM')),
  rows INTEGER NOT NULL,
  cols INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seats (Base venue layout)
CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('VIP', 'PREMIUM', 'STANDARD', 'BALCONY', 'ACCESSIBLE')),
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(venue_id, row_label, seat_number)
);

-- 4. Events / Shows
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('MOVIE', 'CONCERT')),
  banner_url TEXT,
  date_time DATETIME NOT NULL,
  duration_mins INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Event Seat Pricing (Per category)
CREATE TABLE IF NOT EXISTS event_seat_pricing (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_category TEXT NOT NULL,
  price REAL NOT NULL,
  UNIQUE(event_id, seat_category)
);

-- 6. Event Seats (Single Source of Truth for Live Seat Status)
CREATE TABLE IF NOT EXISTS event_seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'HELD', 'BOOKED', 'WAITLIST_HELD')),
  current_hold_id TEXT REFERENCES seat_holds(id) ON DELETE SET NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, seat_id)
);

-- 7. Seat Holds
CREATE TABLE IF NOT EXISTS seat_holds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_ids_json TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_reference TEXT UNIQUE NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED')),
  qr_payload TEXT NOT NULL,
  qr_signature TEXT NOT NULL,
  is_redeemed INTEGER NOT NULL DEFAULT 0,
  redeemed_at DATETIME,
  redeemed_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Booking Seats
CREATE TABLE IF NOT EXISTS booking_seats (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL REFERENCES seats(id),
  price_paid REAL NOT NULL
);

-- 10. Waitlist Entries
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_category TEXT NOT NULL,
  seat_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'OFFERED', 'CONVERTED', 'EXPIRED', 'CANCELLED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Waitlist Offers
CREATE TABLE IF NOT EXISTS waitlist_offers (
  id TEXT PRIMARY KEY,
  waitlist_entry_id TEXT NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_ids_json TEXT NOT NULL,
  claim_token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  error_message TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_event_seats_event_status ON event_seats(event_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_holds_lookup ON seat_holds(event_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_queue ON waitlist_entries(event_id, seat_category, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_offers_active ON waitlist_offers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_redeemed ON bookings(event_id, is_redeemed);
