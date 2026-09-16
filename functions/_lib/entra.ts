import type { Env, IdentityClaims } from './types';
import { publicBaseUrl, requireConfig } from './config';
import { decodeBase64Url } from './security';

interface TokenResponse {
  token_type: string;
  expires_in: number;
  id_token: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface OidcConfiguration {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

type MicrosoftJwk = JsonWebKey & { kid?: string };

function tenantAuthority(env: Env): string {
  if (!/^[0-9a-f-]{36}$/i.test(env.ENTRA_TENANT_ID)) throw new Error('ENTRA_TENANT_ID inválido.');
  return `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}`;
}

export function authorizeUrl(
  env: Env,
  input: { state: string; nonce: string; codeChallenge: string }
): string {
  requireConfig(env, ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'PUBLIC_BASE_URL']);
  const params = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${publicBaseUrl(env)}/auth/callback`,
    response_mode: 'query',
    scope: 'openid profile email',
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  return `${tenantAuthority(env)}/oauth2/v2.0/authorize?${params}`;
}

async function oidcConfiguration(env: Env): Promise<OidcConfiguration> {
  const response = await fetch(`${tenantAuthority(env)}/v2.0/.well-known/openid-configuration`, {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!response.ok) throw new Error('Não foi possível consultar a configuração OIDC da Microsoft.');
  return response.json<OidcConfiguration>();
}

export async function exchangeCode(
  env: Env,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  requireConfig(env, ['ENTRA_CLIENT_SECRET']);
  const configuration = await oidcConfiguration(env);
  const body = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    client_secret: env.ENTRA_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${publicBaseUrl(env)}/auth/callback`,
    code_verifier: codeVerifier,
    scope: 'openid profile email'
  });
  const response = await fetch(configuration.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const result = await response.json<TokenResponse>();
  if (!response.ok || !result.id_token) {
    console.error('Entra token exchange failed', result.error, result.error_description);
    throw new Error('O retorno da Microsoft não pôde ser validado.');
  }
  return result;
}

function parseJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

export async function validateIdToken(env: Env, token: string, expectedNonce: string): Promise<IdentityClaims> {
  requireConfig(env, ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ALLOWED_EMAIL_DOMAIN']);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('ID token inválido.');
  const encodedHeader = parts[0]!;
  const encodedPayload = parts[1]!;
  const encodedSignature = parts[2]!;
  const header = parseJsonPart<JwtHeader>(encodedHeader);
  const claims = parseJsonPart<IdentityClaims>(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Algoritmo de assinatura não permitido.');

  const configuration = await oidcConfiguration(env);
  const keysResponse = await fetch(configuration.jwks_uri, {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!keysResponse.ok) throw new Error('Não foi possível obter as chaves de assinatura da Microsoft.');
  const { keys } = await keysResponse.json<{ keys: MicrosoftJwk[] }>();
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error('Chave de assinatura não reconhecida.');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const validSignature = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!validSignature) throw new Error('Assinatura do ID token inválida.');

  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = configuration.issuer.replace('{tenantid}', env.ENTRA_TENANT_ID);
  if (claims.iss !== expectedIssuer) throw new Error('Emissor do token inválido.');
  if (claims.aud !== env.ENTRA_CLIENT_ID) throw new Error('Audiência do token inválida.');
  if (claims.tid.toLowerCase() !== env.ENTRA_TENANT_ID.toLowerCase()) throw new Error('Tenant não permitido.');
  if (claims.exp <= now || (claims.nbf && claims.nbf > now + 60)) throw new Error('ID token expirado ou ainda não válido.');
  if (claims.nonce !== expectedNonce) throw new Error('Nonce do login inválido.');

  const email = (claims.preferred_username || claims.email || '').toLowerCase();
  const domain = env.ALLOWED_EMAIL_DOMAIN.toLowerCase();
  if (!email.endsWith(`@${domain}`)) throw new Error('Use uma conta corporativa Alliance autorizada.');
  return claims;
}
