import { Admin } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      session?: any;
      admin?: Admin;
    }
  }
} 