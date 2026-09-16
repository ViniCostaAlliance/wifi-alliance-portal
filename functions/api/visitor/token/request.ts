import type { Env } from '../../../_lib/types';
import { requireConfig } from '../../../_lib/config';
import { deliverToken } from '../../../_lib/token-delivery';
import { json, problem, readJson, errorMessage } from '../../../_lib/http';
import { normalizeEmail, portalContext, sanitizeText, sha256, sixDigitToken } from '../../../_lib/security';

interface Body {
  email: string;
  sponsor: string;
  clientMac: string;
  apMac?: string;
  ssid?: string;
  continueUrl?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    requireConfig(env, ['TOKEN_HASH_PEPPER']);
    const body = await readJson<Body>(request);
    const context = portalContext(body as unknown as Record<string, unknown>);
    const email = normalizeEmail(body.email);
    const sponsor = sanitizeText(body.sponsor, 'Responsável', 100);
    const now = Math.floor(Date.now() / 1000);
    const recent = await env.PORTAL_DB.prepare(`
      SELECT COUNT(*) AS total FROM visitor_tokens
      WHERE (email = ? OR client_mac = ?) AND created_at > ?
    `).bind(email, context.clientMac, now - 900).first<{ total: number }>();
    if ((recent?.total || 0) >= 3) return problem('Limite temporário atingido. Aguarde alguns minutos.', 429);

    const token = sixDigitToken();
    const tokenHash = await sha256(`${env.TOKEN_HASH_PEPPER}:${email}:${token}`);
    const id = crypto.randomUUID();
    await env.PORTAL_DB.prepare(`
      INSERT INTO visitor_tokens
        (id, email, token_hash, sponsor, client_mac, ap_mac, ssid, attempts, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      id,
      email,
      tokenHash,
      sponsor,
      context.clientMac,
      context.apMac || '',
      context.ssid || '',
      now + 600,
      now
    ).run();
    try {
      await deliverToken(env, { email, token, sponsor, expiresInMinutes: 10 });
    } catch (error) {
      await env.PORTAL_DB.prepare('DELETE FROM visitor_tokens WHERE id = ?').bind(id).run();
      throw error;
    }
    return json({ sent: true, expiresInMinutes: 10 });
  } catch (error) {
    return problem(errorMessage(error), 400);
  }
};
