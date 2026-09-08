import { Router } from 'express';
import { PromoController } from '../controllers/promo.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Public / customer checkout validation
router.post('/validate', PromoController.validate);

// Management routes (Organizer & Admin)
router.get('/', requireAuth, requireRole('ADMIN', 'ORGANIZER'), PromoController.list);
router.post('/', requireAuth, requireRole('ADMIN', 'ORGANIZER'), PromoController.create);
router.patch('/:id/toggle', requireAuth, requireRole('ADMIN', 'ORGANIZER'), PromoController.toggle);
router.delete('/:id', requireAuth, requireRole('ADMIN', 'ORGANIZER'), PromoController.delete);

export default router;
