import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Atomic hold & checkout
router.post('/hold', requireAuth, BookingController.holdSeats);
router.post('/release-hold', requireAuth, BookingController.releaseHold);
router.post('/checkout', requireAuth, BookingController.checkout);

// Customer history & cancellation
router.get('/my-bookings', requireAuth, BookingController.getMyBookings);
router.post('/:id/cancel', requireAuth, BookingController.cancelBooking);

// QR Ticket Verification & Gate Check-In
router.post('/verify', BookingController.verifyTicket);
router.get('/verify/:bookingReference', BookingController.getBookingByReference);
router.post('/check-in', BookingController.checkInTicket);
router.get('/gate-stats/:eventId', BookingController.getEventGateStats);

export default router;
