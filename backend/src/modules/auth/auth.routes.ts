import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// POST /api/v1/auth/dev-login - Hardcoded-creds login (prototype)
router.post('/dev-login', authController.devLogin);

// GET /api/v1/auth/me - Get or create current user
router.get('/me', requireAuth, authController.getMe);

// PATCH /api/v1/auth/me - Update current user
router.patch('/me', requireAuth, authController.updateMe);

// PATCH /api/v1/auth/me/password - Self-service change password
router.patch('/me/password', requireAuth, authController.changeOwnPassword);

export default router;
