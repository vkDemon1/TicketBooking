import { Router } from 'express';
import { EventController } from '../controllers/event.controller.js';
import { requireAuth, requireRole, optionalAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', EventController.listEvents);
router.get('/organizer/my-events', requireAuth, requireRole('ORGANIZER'), EventController.getOrganizerEvents);
router.get('/:id', EventController.getEventById);
router.get('/:id/seats', optionalAuth, EventController.getEventSeats);
router.post('/', requireAuth, requireRole('ORGANIZER'), EventController.createEvent);

export default router;
