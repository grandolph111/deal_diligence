import { User, ProjectMember, ProjectRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        payload: {
          sub: string;
          [key: string]: unknown;
        };
      };
      user?: User;
      projectMember?: ProjectMember & {
        role: ProjectRole;
      };
      requestId?: string;
    }
  }
}

export {};
