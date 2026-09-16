import type { Env } from '../../../_lib/types';
import { boundedMinutes, requireConfig } from '../../../_lib/config';
import { issueSession } from '../../../_lib/session';
import { authorizeDevice } from '../../../_lib/unifi';
import { json, problem, readJson, errorMessage } from '../../../_lib/http';
import { normalizeEmail, normalizeMac, sha256 } from '../../../_lib/security';

interface Body {
  email: string;
  token: string;
  clientMac: string;
}

interface TokenRow {
  id: string;
  tokenHash: string;
  sponsor: string;
  clientMac: string;
  apMac: string;
  ssid: string;
  attempts: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let tokenRow: TokenRow | null = null;
  try {
    requireConfig(env, ['TOKEN_HASH_PEPPER']);
    const body = await readJson<Body>(request);
    const email = normalizeEmail(body.email);
    const clientMac = normalizeMac(body.clientMac);
    const token = String(body.token || '').trim();
    if (!/^\d{6}$/.test(token)) return problem('Token inválido.', 400);
    const now = Math.floor(Date.now() / 1000);
    tokenRow = await env.PORTAL_DB.prepare(`
      SELECT id, token_hash AS tokenHash, sponsor, client_mac AS clientMac,
             ap_mac AS apMac, ssid, attempts
      FROM visitor_tokens
      WHERE email = ? AND client_mac = ? AND expires_at > ? AND used_at IS NULL AND attempts < 5
      ORDER BY created_at DESC LIMIT 1
    `).bind(email, clientMac, now).first<TokenRow>();
    if (!tokenRow) return problem('Token expirado ou bloqueado.', 401);

    const suppliedHash = await sha256(`${env.TOKEN_HASH_PEPPER}:${email}:${token}`);
    if (suppliedHash !== tokenRow.tokenHash) {
      await env.PORTAL_DB.prepare('UPDATE visitor_tokens SET attempts = attempts + 1 WHERE id = ?')
        .bind(tokenRow.id).run();
      return problem('Token incorreto.', 401);
    }
    const marked = await env.PORTAL_DB.prepare(`
      UPDATE visitor_tokens SET used_at = ?
      WHERE id = ? AND used_at IS NULL
    `).bind(now, tokenRow.id).run();
    if (marked.meta.changes !== 1) return problem('Token já utilizado.', 409);

    const minutes = boundedMinutes(env.VISITOR_TOKEN_MINUTES, 120, 480);
    try {
      await authorizeDevice(env, {
        clientMac,
        apMac: tokenRow.apMac,
        ssid: tokenRow.ssid,
        minutes,
        method: 'token',
        identity: email
      });
    } catch (error) {
      await env.PORTAL_DB.prepare('UPDATE visitor_tokens SET used_at = NULL WHERE id = ?').bind(tokenRow.id).run();
      throw error;
    }

    const { cookie } = await issueSession(env, {
      method: 'token',
      profile: 'Visitante · token',
      email,
      clientMac,
      minutes
    });
    return json({ authorized: true, minutes }, { headers: { 'set-cookie': cookie } });
  } catch (error) {
    return problem(errorMessage(error), 400);
  }
};
