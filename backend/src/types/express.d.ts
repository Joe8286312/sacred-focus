import 'express';
import type { AuthUser } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
