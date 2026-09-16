import type { Env } from '../../_lib/types';
import { authorizeUrl } from '../../_lib/entra';
import { cleanupExpired, saveAuthState } from '../../_lib/database';
import { problem, redirect, errorMessage } from '../../_lib/http';
import { portalContext, randomId, sha256 } from '../../_lib/security';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const input = portalContext({
      clientMac: url.searchParams.get('clientMac') || '',
      apMac: url.searchParams.get('apMac') || '',
      ssid: url.searchParams.get('ssid') || '',
      continueUrl: url.searchParams.get('continueUrl') || ''
    });
    const state = randomId(32);
    const nonce = randomId(32);
    const codeVerifier = randomId(64);
    const codeChallenge = await sha256(codeVerifier);
    await cleanupExpired(env.PORTAL_DB);
    await saveAuthState(env.PORTAL_DB, {
      ...input,
      state,
      nonce,
      codeVerifier,
      expiresAt: Math.floor(Date.now() / 1000) + 600
    });
    return redirect(authorizeUrl(env, { state, nonce, codeChallenge }));
  } catch (error) {
    return problem(errorMessage(error), 400);
  }
};
