import type { PortalContext } from './types';

const encoder = new TextEncoder();

export function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  input.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

export function randomId(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

export function sixDigitToken(): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const value = new Uint32Array(1);
  let candidate = 0;
  do {
    crypto.getRandomValues(value);
    candidate = value[0]!;
  } while (candidate >= limit);
  return String(candidate % 1_000_000).padStart(6, '0');
}

export async function sha256(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export function normalizeMac(value: unknown): string {
  const raw = String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (!/^[0-9a-f]{12}$/.test(raw)) throw new Error('Identificação do dispositivo inválida.');
  return raw.match(/.{2}/g)!.join(':');
}

export function normalizeEmail(value: unknown): string {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('E-mail inválido.');
  }
  return email;
}

export function sanitizeText(value: unknown, field: string, max = 120): string {
  const text = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!text || text.length > max) throw new Error(`${field} inválido.`);
  return text;
}

export function safeContinueUrl(value: unknown): string {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function portalContext(input: Record<string, unknown>): PortalContext {
  return {
    clientMac: normalizeMac(input.clientMac),
    apMac: input.apMac ? normalizeMac(input.apMac) : '',
    ssid: input.ssid ? sanitizeText(input.ssid, 'SSID', 64) : '',
    continueUrl: safeContinueUrl(input.continueUrl)
  };
}

export function cookieValue(request: Request, name: string): string {
  const cookies = request.headers.get('cookie') || '';
  for (const item of cookies.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

export function sessionCookie(id: string, maxAgeSeconds: number): string {
  return `portal_session=${encodeURIComponent(id)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return 'portal_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax';
}
