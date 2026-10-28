import crypto from 'crypto';

function getHmacSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SESSION_HMAC_SECRET ||
    'velopulse-enterprise-hmac-key-2026-default-secret'
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(
  password: string,
  storedHash: string | null
): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export interface SignedSessionPayload {
  uid: string;
  email: string;
  exp: number;
}

export function createSessionToken(
  uid: string,
  email: string,
  ttlSeconds = 60 * 60 * 24 * 30 // 30 days
): string {
  const payload: SignedSessionPayload = {
    uid,
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );
  const signature = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `vp_sess.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SignedSessionPayload | null {
  if (!token.startsWith('vp_sess.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [, encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    ) as SignedSessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function sanitizeUserRecord<T extends Record<string, any>>(
  user: T
): Omit<T, 'passwordHash'> {
  const { passwordHash: _removed, ...safeUser } = user;
  return safeUser;
}

/**
 * Prevents CSV Formula Injection (DDE/Macro injection) by prefixing dangerous leading characters
 * (=, +, -, @, \t, \r) with a single quote and properly escaping double quotes.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

// In-memory rate limiter for authentication & sensitive endpoints
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests = 15,
  windowMs = 60_000
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitBuckets.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
