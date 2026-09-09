import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        role: string;
        jti?: string;
        staticToken?: boolean;
        exp?: number;
        [key: string]: any;
      };
    }
  }
}
