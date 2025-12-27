import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';

export type JwtClaims = {
  sub: string;
  username: string;
};

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(claims: JwtClaims): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtClaims {
  return jwt.verify(token, JWT_SECRET) as JwtClaims;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  // Allow plain text by default for simplicity; also accept bcrypt hash when provided.
  // If ADMIN_PASSWORD looks like bcrypt hash, compare against it.
  if (adminPassword.startsWith('$2a$') || adminPassword.startsWith('$2b$') || adminPassword.startsWith('$2y$')) {
    return bcrypt.compare(password, adminPassword);
  }

  return password === adminPassword;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = header.slice('Bearer '.length);
  try {
    const claims = verifyToken(token);
    (req as any).user = claims;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
