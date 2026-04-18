/**
 * Minimal auth module.
 *
 * Single password from V2_PASSWORD env var.
 * If unset, a random password is generated at startup.
 * Issues HMAC-SHA256 session tokens. No database, no expiry yet.
 */

import crypto from 'node:crypto';

const SECRET = crypto.randomBytes(32);

function resolvePassword(): string {
  const env = process.env.V2_PASSWORD;
  if (env && env.length > 0) return env;
  const generated = crypto.randomBytes(4).toString('hex');
  process.env.V2_PASSWORD = generated;
  return generated;
}

const PASSWORD = resolvePassword();

export function checkPassword(input: string): boolean {
  return input === PASSWORD;
}

export function createToken(): string {
  const payload = JSON.stringify({ ts: Date.now(), r: crypto.randomBytes(8).toString('hex') });
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${hmac}`;
}

export function verifyToken(token: string): boolean {
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const b64 = token.substring(0, dot);
  const sig = token.substring(dot + 1);
  try {
    const payload = Buffer.from(b64, 'base64url').toString('utf-8');
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function extractToken(req: { url?: string; headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.substring(7);
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const t = url.searchParams.get('token');
  if (t) return t;

  const cookie = req.headers['cookie'];
  if (typeof cookie === 'string') {
    const match = cookie.match(/v2_token=([^;\s]+)/);
    if (match) return match[1];
  }

  return null;
}
