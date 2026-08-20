import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

/**
 * Credential login is the one endpoint where guessing pays, so it is throttled
 * per IP. Everything else on this router is already gated by a signed session.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Try again later.' },
});

// POST /api/v1/auth/dev-login - Hardcoded-creds login (prototype)
router.post('/dev-login', loginLimiter, authController.devLogin);

// GET /api/v1/auth/me - Get or create current user
router.get('/me', requireAuth, authController.getMe);

// PATCH /api/v1/auth/me - Update current user
router.patch('/me', requireAuth, authController.updateMe);

// PATCH /api/v1/auth/me/password - Self-service change password
router.patch('/me/password', requireAuth, authController.changeOwnPassword);

export default router;
