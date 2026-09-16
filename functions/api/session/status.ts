import type { Env } from '../../_lib/types';
import { getSession } from '../../_lib/database';
import { json, problem } from '../../_lib/http';
import { clearSessionCookie, cookieValue } from '../../_lib/security';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = cookieValue(request, 'portal_session');
  if (!id) return problem('Sessão não encontrada.', 401);
  const session = await getSession(env.PORTAL_DB, id);
  if (!session) {
    return problem('Sessão expirada.', 401, { 'set-cookie': clearSessionCookie() });
  }
  return json({
    authorized: true,
    method: session.method,
    profile: session.profile,
    minutes: session.minutes,
    expiresAt: session.expiresAt
  });
};
