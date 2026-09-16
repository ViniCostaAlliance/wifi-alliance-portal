import type { Env } from './types';
import { requireConfig } from './config';

interface TokenMessage {
  email: string;
  token: string;
  sponsor: string;
  expiresInMinutes: number;
}

export async function deliverToken(env: Env, message: TokenMessage): Promise<void> {
  if (env.ENVIRONMENT !== 'production' && !env.TOKEN_WEBHOOK_URL) {
    console.log('Development visitor token', { ...message, token: '[available only in local logs]' });
    return;
  }
  requireConfig(env, ['TOKEN_WEBHOOK_URL', 'TOKEN_WEBHOOK_SECRET']);
  const response = await fetch(env.TOKEN_WEBHOOK_URL!, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.TOKEN_WEBHOOK_SECRET}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      template: 'wifi-visitor-token',
      to: message.email,
      variables: {
        token: message.token,
        sponsor: message.sponsor,
        expiresInMinutes: message.expiresInMinutes
      }
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error('Não foi possível enviar o token ao visitante.');
}
