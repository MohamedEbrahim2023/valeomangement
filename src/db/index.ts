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

export const DEFAULT_SUPABASE_POOLER_URL =
  'postgresql://postgres.glxpoccrjdkcqejifvct:Mido40363881@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

let runtimeCustomDbUrl: string | null = null;
let postgresVerifiedReachable = false;
let lastConnectionError: string | null = null;
let lastCheckedAt: string | null = null;

export function getRawConfiguredPostgresUrl(): string | null {
  const candidates = [
    runtimeCustomDbUrl,
    process.env.SUPABASE_DB_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    DEFAULT_SUPABASE_POOLER_URL,
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

export function getValidPostgresUrl(): string | null {
  if (!postgresVerifiedReachable) {
    return null;
  }
  return getRawConfiguredPostgresUrl();
}

export function isPostgresConfigured(): boolean {
  return postgresVerifiedReachable && Boolean(getRawConfiguredPostgresUrl());
}

export function createPool(forceRawUrl?: string): Pool | null {
  const connectionString = forceRawUrl
    ? normalizePostgresUrl(forceRawUrl)
    : getRawConfiguredPostgresUrl();
  if (!connectionString) {
    return null;
  }

  if (!global._postgresPool || forceRawUrl) {
    if (global._postgresPool && forceRawUrl) {
      global._postgresPool.end().catch(() => {});
    }
    global._postgresPool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 8000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
      postgresVerifiedReachable = false;
      lastConnectionError = err.message;
    });
  }
  return global._postgresPool;
}

export let pool = createPool();
export let db = (pool
  ? drizzle(pool, { schema })
  : null) as unknown as NodePgDatabase<typeof schema>;

export async function verifyPostgresConnectivity(
  overrideUrl?: string
): Promise<{
  connected: boolean;
  mode: 'supabase_postgres_live' | 'supabase_hybrid_sync';
  maskedUrl: string;
  projectRef: string;
  region: string;
  port: string;
  error: string | null;
  checkedAt: string;
}> {
  if (overrideUrl && overrideUrl.trim()) {
    runtimeCustomDbUrl = overrideUrl.trim();
    pool = createPool(runtimeCustomDbUrl);
    db = (pool
      ? drizzle(pool, { schema })
      : null) as unknown as NodePgDatabase<typeof schema>;
  } else if (!pool) {
    pool = createPool();
    db = (pool
      ? drizzle(pool, { schema })
      : null) as unknown as NodePgDatabase<typeof schema>;
  }

  const rawUrl = getRawConfiguredPostgresUrl() || DEFAULT_SUPABASE_POOLER_URL;
  const maskedUrl = rawUrl.replace(/:([^:@]+)@/, ':••••••••@');
  const projectRefMatch = rawUrl.match(/postgres\.([a-z0-9]+)/i);
  const regionMatch = rawUrl.match(/aws-\d+-([a-z0-9-]+)\.pooler/i);
  const portMatch = rawUrl.match(/:(\d+)\//);

  const projectRef = projectRefMatch?.[1] || 'glxpoccrjdkcqejifvct';
  const region = regionMatch?.[1] || 'eu-west-1';
  const port = portMatch?.[1] || '6543';

  if (process.env.VITEST === 'true') {
    postgresVerifiedReachable = false;
    lastCheckedAt = new Date().toISOString();
    return {
      connected: false,
      mode: 'supabase_hybrid_sync',
      maskedUrl,
      projectRef,
      region,
      port,
      error: null,
      checkedAt: lastCheckedAt,
    };
  }

  if (!pool) {
    postgresVerifiedReachable = false;
    lastConnectionError = 'No PostgreSQL pool initialized';
    lastCheckedAt = new Date().toISOString();
    return {
      connected: false,
      mode: 'supabase_hybrid_sync',
      maskedUrl,
      projectRef,
      region,
      port,
      error: lastConnectionError,
      checkedAt: lastCheckedAt,
    };
  }

  try {
    await pool.query('SELECT 1');
    postgresVerifiedReachable = true;
    lastConnectionError = null;
    lastCheckedAt = new Date().toISOString();
    return {
      connected: true,
      mode: 'supabase_postgres_live',
      maskedUrl,
      projectRef,
      region,
      port,
      error: null,
      checkedAt: lastCheckedAt,
    };
  } catch (err: any) {
    postgresVerifiedReachable = false;
    lastConnectionError = err?.message || 'Connection failed';
    lastCheckedAt = new Date().toISOString();
    return {
      connected: false,
      mode: 'supabase_hybrid_sync',
      maskedUrl,
      projectRef,
      region,
      port,
      error: lastConnectionError,
      checkedAt: lastCheckedAt,
    };
  }
}

export function getSupabaseStatusSnapshot() {
  const rawUrl = getRawConfiguredPostgresUrl() || DEFAULT_SUPABASE_POOLER_URL;
  const maskedUrl = rawUrl.replace(/:([^:@]+)@/, ':••••••••@');
  const projectRefMatch = rawUrl.match(/postgres\.([a-z0-9]+)/i);
  const regionMatch = rawUrl.match(/aws-\d+-([a-z0-9-]+)\.pooler/i);
  const portMatch = rawUrl.match(/:(\d+)\//);

  return {
    configuredUrl: maskedUrl,
    rawHost: 'aws-0-eu-west-1.pooler.supabase.com',
    projectRef: projectRefMatch?.[1] || 'glxpoccrjdkcqejifvct',
    region: regionMatch?.[1] || 'eu-west-1',
    port: portMatch?.[1] || '6543',
    database: 'postgres',
    connected: postgresVerifiedReachable,
    mode: postgresVerifiedReachable
      ? ('supabase_postgres_live' as const)
      : ('supabase_hybrid_sync' as const),
    lastError: lastConnectionError,
    lastCheckedAt: lastCheckedAt || new Date().toISOString(),
  };
}

