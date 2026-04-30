import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { companyMembersService } from './company-members.service';
import { createCompanyMemberSchema } from './companies.validators';

export const companyMembersController = {
  addCustomerAdmin: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const companyId = req.params.companyId as string;
    const data = createCompanyMemberSchema.parse(req.body);
    const result = await companyMembersService.addCustomerAdmin(
      req.user,
      companyId,
      data
    );
    res.status(201).json(result);
  }),

  addMember: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const companyId = req.params.companyId as string;
    const data = createCompanyMemberSchema.parse(req.body);
    const result = await companyMembersService.addMember(
      req.user,
      companyId,
      data
    );
    res.status(201).json(result);
  }),

  removeMember: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const companyId = req.params.companyId as string;
    const userId = req.params.userId as string;
    await companyMembersService.removeMember(req.user, companyId, userId);
    res.status(204).end();
  }),

  regeneratePassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const userId = req.params.userId as string;
    const result = await companyMembersService.regeneratePassword(
      req.user,
      userId
    );
    res.json(result);
  }),
};
