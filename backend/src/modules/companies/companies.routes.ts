import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePlatformRole } from '../../middleware/permissions';
import { companiesController } from './companies.controller';
import { companyMembersController } from './company-members.controller';
import { ApiError } from '../../utils/ApiError';

const router = Router();
router.use(requireAuth);

// SUPER_ADMIN-only: list every company, create new ones.
router.get('/', requirePlatformRole('SUPER_ADMIN'), companiesController.listCompanies);
router.post('/', requirePlatformRole('SUPER_ADMIN'), companiesController.createCompany);

// SUPER_ADMIN can read any company. CUSTOMER_ADMIN can read their own.
router.get('/:companyId', (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const companyId = req.params.companyId;
  if (req.user.platformRole === 'SUPER_ADMIN') return next();
  if (
    req.user.platformRole === 'CUSTOMER_ADMIN' &&
    req.user.companyId === companyId
  ) {
    return next();
  }
  return next(ApiError.forbidden('Not authorized for this company'));
}, companiesController.getCompany);

// Members management — authorization is enforced inside company-members.service
router.post('/:companyId/admins', companyMembersController.addCustomerAdmin);
router.post('/:companyId/members', companyMembersController.addMember);
router.delete('/:companyId/members/:userId', companyMembersController.removeMember);
router.post('/:companyId/members/:userId/regenerate-password', companyMembersController.regeneratePassword);

export default router;
