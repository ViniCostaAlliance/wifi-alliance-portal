export interface Env {
  PORTAL_DB: D1Database;
  ENTRA_TENANT_ID: string;
  ENTRA_CLIENT_ID: string;
  ENTRA_CLIENT_SECRET: string;
  PUBLIC_BASE_URL: string;
  ALLOWED_EMAIL_DOMAIN: string;
  EMPLOYEE_SESSION_MINUTES?: string;
  VISITOR_TOKEN_MINUTES?: string;
  UNIFI_RELAY_URL: string;
  UNIFI_RELAY_TOKEN: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  TOKEN_WEBHOOK_URL?: string;
  TOKEN_WEBHOOK_SECRET?: string;
  TOKEN_HASH_PEPPER: string;
  ENVIRONMENT?: string;
}

export interface PortalContext {
  clientMac: string;
  apMac?: string;
  ssid?: string;
  continueUrl?: string;
}

export interface AuthState extends PortalContext {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface IdentityClaims {
  sub: string;
  tid: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  aud: string;
  iss: string;
  nonce?: string;
  exp: number;
  nbf?: number;
}

export interface SessionRecord {
  id: string;
  method: 'entra' | 'voucher' | 'token';
  profile: string;
  email?: string;
  clientMac: string;
  minutes: number;
  expiresAt: number;
}
