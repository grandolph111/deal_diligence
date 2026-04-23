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

// Narrow Express 5's ParamsDictionary so req.params.xxx is always `string`.
// @types/express-serve-static-core widened it to `string | string[]` to accommodate
// wildcard routes (e.g. `/user/*id`), which we don't use. This keeps controller
// code clean of `as string` assertions.
declare module 'express-serve-static-core' {
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
