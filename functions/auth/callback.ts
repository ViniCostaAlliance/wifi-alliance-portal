import type { Env } from '../_lib/types';
import { boundedMinutes, publicBaseUrl } from '../_lib/config';
import { consumeAuthState } from '../_lib/database';
import { exchangeCode, validateIdToken } from '../_lib/entra';
import { problem, redirect, errorMessage } from '../_lib/http';
import { issueSession } from '../_lib/session';
import { authorizeDevice } from '../_lib/unifi';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('error')) {
      console.warn('Entra authorization error', url.searchParams.get('error'));
      return redirect(`${publicBaseUrl(env)}/?authError=denied`);
    }
    const code = url.searchParams.get('code') || '';
    const stateValue = url.searchParams.get('state') || '';
    if (!code || !stateValue) return problem('Callback incompleto.', 400);
    const state = await consumeAuthState(env.PORTAL_DB, stateValue);
    if (!state) return problem('A tentativa de login expirou ou já foi utilizada.', 400);

    const tokens = await exchangeCode(env, code, state.codeVerifier);
    const claims = await validateIdToken(env, tokens.id_token, state.nonce);
    const email = (claims.preferred_username || claims.email || '').toLowerCase();
    const minutes = boundedMinutes(env.EMPLOYEE_SESSION_MINUTES, 480, 720);
    await authorizeDevice(env, {
      clientMac: state.clientMac,
      apMac: state.apMac,
      ssid: state.ssid,
      minutes,
      method: 'entra',
      identity: email
    });
    const { cookie } = await issueSession(env, {
      method: 'entra',
      profile: 'Colaborador',
      email,
      clientMac: state.clientMac,
      minutes
    });
    return redirect(`${publicBaseUrl(env)}/?connected=1`, { 'set-cookie': cookie });
  } catch (error) {
    console.error('Entra callback failed', errorMessage(error));
    return problem(errorMessage(error), 401);
  }
};
