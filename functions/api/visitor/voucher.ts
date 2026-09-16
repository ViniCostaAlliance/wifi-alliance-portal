import type { Env } from '../../_lib/types';
import { requireConfig } from '../../_lib/config';
import { issueSession } from '../../_lib/session';
import { authorizeDevice } from '../../_lib/unifi';
import { json, problem, readJson, errorMessage } from '../../_lib/http';
import { portalContext, sanitizeText, sha256 } from '../../_lib/security';

interface Body {
  code: string;
  clientMac: string;
  apMac?: string;
  ssid?: string;
  continueUrl?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let redeemedHash = '';
  try {
    requireConfig(env, ['TOKEN_HASH_PEPPER']);
    const body = await readJson<Body>(request);
    const context = portalContext(body as unknown as Record<string, unknown>);
    const code = sanitizeText(body.code, 'Voucher', 64).toUpperCase();
    redeemedHash = await sha256(`${env.TOKEN_HASH_PEPPER}:${code}`);
    const now = Math.floor(Date.now() / 1000);
    const voucher = await env.PORTAL_DB.prepare(`
      UPDATE vouchers SET used_count = used_count + 1, last_used_at = ?
      WHERE code_hash = ? AND enabled = 1 AND expires_at > ? AND used_count < max_uses
      RETURNING minutes, label
    `).bind(now, redeemedHash, now).first<{ minutes: number; label: string }>();
    if (!voucher) return problem('Voucher inválido, expirado ou já utilizado.', 401);

    try {
      await authorizeDevice(env, {
        clientMac: context.clientMac,
        apMac: context.apMac,
        ssid: context.ssid,
        minutes: voucher.minutes,
        method: 'voucher',
        identity: voucher.label || 'Visitante'
      });
    } catch (error) {
      await env.PORTAL_DB.prepare(
        'UPDATE vouchers SET used_count = MAX(used_count - 1, 0) WHERE code_hash = ?'
      ).bind(redeemedHash).run();
      throw error;
    }

    const { cookie } = await issueSession(env, {
      method: 'voucher',
      profile: 'Visitante · voucher',
      clientMac: context.clientMac,
      minutes: voucher.minutes
    });
    return json({ authorized: true, minutes: voucher.minutes }, { headers: { 'set-cookie': cookie } });
  } catch (error) {
    return problem(errorMessage(error), 400);
  }
};
