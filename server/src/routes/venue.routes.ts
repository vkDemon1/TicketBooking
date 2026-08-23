import { Router } from 'express';
import { VenueController } from '../controllers/venue.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', VenueController.listVenues);
router.get('/:id', VenueController.getVenueById);
router.post('/', requireAuth, requireRole('ADMIN'), VenueController.createVenue);
router.put('/:id/seats', requireAuth, requireRole('ADMIN'), VenueController.updateSeats);

export default router;
