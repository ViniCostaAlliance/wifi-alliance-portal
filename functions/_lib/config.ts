import type { Env } from './types';

export function requireConfig(env: Env, keys: Array<keyof Env>): void {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}.`);
}

export function boundedMinutes(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function publicBaseUrl(env: Env): string {
  const value = new URL(env.PUBLIC_BASE_URL);
  if (value.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL deve usar HTTPS.');
  return value.origin;
}
