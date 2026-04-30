import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { companiesService } from './companies.service';
import { createCompanySchema } from './companies.validators';

export const companiesController = {
  listCompanies: asyncHandler(async (_req: Request, res: Response) => {
    const companies = await companiesService.listCompanies();
    res.json(companies);
  }),

  createCompany: asyncHandler(async (req: Request, res: Response) => {
    const data = createCompanySchema.parse(req.body);
    const result = await companiesService.createCompanyWithAdmin(data);
    res.status(201).json(result);
  }),

  getCompany: asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId as string;
    const company = await companiesService.getCompanyById(companyId);
    res.json(company);
  }),
};
