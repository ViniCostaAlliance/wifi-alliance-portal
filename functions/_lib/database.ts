import type { AuthState, SessionRecord } from './types';

export async function saveAuthState(db: D1Database, record: AuthState): Promise<void> {
  await db.prepare(`
    INSERT INTO auth_states
      (state, nonce, code_verifier, client_mac, ap_mac, ssid, continue_url, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.state,
    record.nonce,
    record.codeVerifier,
    record.clientMac,
    record.apMac || '',
    record.ssid || '',
    record.continueUrl || '',
    record.expiresAt,
    Math.floor(Date.now() / 1000)
  ).run();
}

export async function consumeAuthState(db: D1Database, state: string): Promise<AuthState | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(`
    DELETE FROM auth_states
    WHERE state = ? AND expires_at > ?
    RETURNING state, nonce, code_verifier AS codeVerifier, client_mac AS clientMac,
              ap_mac AS apMac, ssid, continue_url AS continueUrl, expires_at AS expiresAt
  `).bind(state, now).first<AuthState>();
  return row || null;
}

export async function createSession(db: D1Database, session: SessionRecord): Promise<void> {
  await db.prepare(`
    INSERT INTO sessions (id, method, profile, email, client_mac, minutes, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    session.id,
    session.method,
    session.profile,
    session.email || '',
    session.clientMac,
    session.minutes,
    session.expiresAt,
    Math.floor(Date.now() / 1000)
  ).run();
}

export async function getSession(db: D1Database, id: string): Promise<SessionRecord | null> {
  const row = await db.prepare(`
    SELECT id, method, profile, email, client_mac AS clientMac, minutes, expires_at AS expiresAt
    FROM sessions WHERE id = ? AND expires_at > ?
  `).bind(id, Math.floor(Date.now() / 1000)).first<SessionRecord>();
  return row || null;
}

export async function cleanupExpired(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('DELETE FROM auth_states WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM visitor_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').bind(now)
  ]);
}
