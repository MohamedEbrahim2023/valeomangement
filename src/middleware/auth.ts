import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../lib/security.ts';
import { getUserByUid, UserRecord } from '../db/repository.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name?: string;
  };
  dbUser?: UserRecord;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res
      .status(401)
      .json({ error: 'Unauthorized: Empty authentication token' });
  }

  try {
    const sessionPayload = verifySessionToken(token);
    if (!sessionPayload) {
      return res
        .status(401)
        .json({ error: 'Unauthorized: Invalid or expired session token' });
    }

    const dbUser = await getUserByUid(sessionPayload.uid);
    if (!dbUser || dbUser.deletedAt) {
      return res
        .status(401)
        .json({ error: 'Unauthorized: User account not found' });
    }

    if (dbUser.accountStatus === 'deactivated') {
      return res.status(403).json({
        error:
          'Your account has been deactivated by an administrator. Access is revoked.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    req.user = {
      uid: dbUser.uid,
      email: dbUser.email,
      name: dbUser.fullName,
    };
    req.dbUser = dbUser;
    return next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res
      .status(401)
      .json({ error: 'Unauthorized: Invalid authentication token' });
  }
};
