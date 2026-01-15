import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/v1/auth/me - Get or create current user
router.get('/me', requireAuth, authController.getMe);

// PATCH /api/v1/auth/me - Update current user
router.patch('/me', requireAuth, authController.updateMe);

export default router;
