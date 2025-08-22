import 'express';
import type { AuthUser } from '../auth/auth.guard';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
