import { Router } from 'express';
import { WaitlistController } from '../controllers/waitlist.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/join', requireAuth, WaitlistController.joinWaitlist);
router.get('/my-entries', requireAuth, WaitlistController.getMyEntries);
router.get('/offer/:token', WaitlistController.getOfferByToken);
router.post('/claim', requireAuth, WaitlistController.claimOffer);

export default router;
