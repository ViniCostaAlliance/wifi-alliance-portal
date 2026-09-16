import type { Env, SessionRecord } from './types';
import { createSession } from './database';
import { randomId, sessionCookie } from './security';

export async function issueSession(
  env: Env,
  input: Omit<SessionRecord, 'id' | 'expiresAt'>
): Promise<{ session: SessionRecord; cookie: string }> {
  const now = Math.floor(Date.now() / 1000);
  const session: SessionRecord = {
    ...input,
    id: randomId(24),
    expiresAt: now + input.minutes * 60
  };
  await createSession(env.PORTAL_DB, session);
  return { session, cookie: sessionCookie(session.id, input.minutes * 60) };
}
