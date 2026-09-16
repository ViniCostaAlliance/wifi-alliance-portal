import type { Env } from './types';
import { requireConfig } from './config';

interface AuthorizationRequest {
  clientMac: string;
  minutes: number;
  method: 'entra' | 'voucher' | 'token';
  identity: string;
  apMac?: string;
  ssid?: string;
}

export async function authorizeDevice(env: Env, payload: AuthorizationRequest): Promise<void> {
  requireConfig(env, ['UNIFI_RELAY_URL', 'UNIFI_RELAY_TOKEN']);
  const url = new URL('/authorize', env.UNIFI_RELAY_URL).toString();
  const headers = new Headers({
    authorization: `Bearer ${env.UNIFI_RELAY_TOKEN}`,
    'content-type': 'application/json'
  });
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID);
    headers.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('UniFi relay rejected authorization', response.status, detail.slice(0, 300));
    throw new Error('A identidade foi validada, mas o UniFi não autorizou o dispositivo.');
  }
}
