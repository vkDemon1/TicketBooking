export type UserRole = 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type VenueType = 'CINEMA' | 'CONCERT_HALL' | 'STADIUM';
export type SeatCategory = 'VIP' | 'PREMIUM' | 'STANDARD' | 'BALCONY' | 'ACCESSIBLE';
export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'WAITLIST_HELD';
export type EventCategory = 'MOVIE' | 'CONCERT';

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  type: VenueType;
  rows: number;
  cols: number;
  total_seats?: number;
  created_at?: string;
}

export interface Seat {
  id: string;
  venue_id: string;
  row_label: string;
  seat_number: number;
  category: SeatCategory;
  is_active: number | boolean;
}

export interface EventSeatPricing {
  seat_category: SeatCategory;
  price: number;
}

export interface Event {
  id: string;
  organizer_id: string;
  organizer_name?: string;
  venue_id: string;
  venue_name: string;
  venue_city: string;
  venue_address?: string;
  venue_type: VenueType;
  venue_rows?: number;
  venue_cols?: number;
  title: string;
  description: string;
  category: EventCategory;
  banner_url?: string;
  date_time: string;
  duration_mins: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  min_price?: number;
  max_price?: number;
  total_seats?: number;
  available_seats?: number;
  booked_seats?: number;
  held_seats?: number;
  waitlist_held_seats?: number;
  confirmed_bookings_count?: number;
  confirmed_tickets_sold?: number;
  total_revenue?: number;
}

export interface EventSeatState {
  eventSeatId: string;
  seatId: string;
  row: string;
  number: number;
  category: SeatCategory;
  price: number;
  status: SeatStatus;
  isActive: boolean;
  isMyHold?: boolean;
  holdExpiresAt?: string;
}

export interface BookingSeat {
  label: string;
  row: string;
  number: number;
  category: SeatCategory;
  price: number;
}

export interface Booking {
  id: string;
  bookingReference: string;
  totalAmount: number;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  event: {
    id: string;
    title: string;
    category: EventCategory;
    dateTime: string;
    bannerUrl?: string;
    venue: {
      name: string;
      city: string;
      address?: string;
    };
  };
  seats: BookingSeat[];
  qrCode: string;
  signature: string;
}

export interface WaitlistEntry {
  id: string;
  eventId: string;
  eventTitle: string;
  dateTime: string;
  bannerUrl?: string;
  venueName: string;
  venueCity: string;
  category: SeatCategory;
  seatCount: number;
  status: 'WAITING' | 'OFFERED' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  queuePosition: number;
  createdAt: string;
  offer?: {
    offerId: string;
    claimToken: string;
    expiresAt: string;
    seats: string[];
  } | null;
}

export interface WaitlistOfferDetails {
  id: string;
  eventId: string;
  eventTitle: string;
  dateTime: string;
  bannerUrl?: string;
  venue: {
    name: string;
    address: string;
    city: string;
  };
  seats: Array<{
    id: string;
    label: string;
    category: SeatCategory;
    price: number;
  }>;
  totalAmount: number;
  expiresAt: string;
  remainingSeconds: number;
  userName: string;
}

export interface EmailLog {
  id: string;
  toEmail: string;
  subject: string;
  template: string;
  status: string;
  errorMessage?: string;
  sentAt: string;
  data: any;
}
