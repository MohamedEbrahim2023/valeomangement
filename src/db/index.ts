import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as schema from './schema.ts';

dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
}

/**
 * Normalizes a PostgreSQL connection string so that if a user pastes
 * `postgresql://user:[pass#word]@host:6543/postgres`, surrounding brackets `[` `]`
 * are stripped and special characters like `#` in the password are URL-encoded (`%23`).
 */
export function normalizePostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@([^@]+)$/);
  if (!match) return trimmed;

  const [, protocol, username, rawPassword, hostAndPath] = match;
  const unbracketed =
    rawPassword.startsWith('[') && rawPassword.endsWith(']')
      ? rawPassword.slice(1, -1)
      : rawPassword;

  let decoded = unbracketed;
  try {
    decoded = decodeURIComponent(unbracketed);
  } catch {
    decoded = unbracketed;
  }
  const encodedPassword = encodeURIComponent(decoded);

  return `${protocol}${username}:${encodedPassword}@${hostAndPath}`;
}

export function getValidPostgresUrl(): string | null {
  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('postgres://') ||
        trimmed.startsWith('postgresql://')) &&
      !trimmed.includes('YOUR_PASSWORD') &&
      !trimmed.includes('YOUR_PROJECT_REF')
    ) {
      return normalizePostgresUrl(trimmed);
    }
  }
  return null;
}

export function isPostgresConfigured(): boolean {
  return Boolean(getValidPostgresUrl());
}

export const createPool = (): Pool | null => {
  const connectionString = getValidPostgresUrl();
  if (!connectionString) {
    return null;
  }

  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = (pool ? drizzle(pool, { schema }) : null) as unknown as NodePgDatabase<typeof schema>;
