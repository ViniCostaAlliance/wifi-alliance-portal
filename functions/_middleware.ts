import type { Env } from './_lib/types';

export const onRequest: PagesFunction<Env> = async (context) => {
  const requestUrl = new URL(context.request.url);
  if (
    context.env.ENVIRONMENT === 'production' &&
    context.request.method !== 'GET' &&
    context.request.method !== 'HEAD' &&
    requestUrl.pathname.startsWith('/api/')
  ) {
    const expectedOrigin = new URL(context.env.PUBLIC_BASE_URL).origin;
    if (context.request.headers.get('origin') !== expectedOrigin) {
      return new Response('{"error":"Origem não permitida."}', {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  headers.set(
    'content-security-policy',
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; " +
    "script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "form-action 'self' https://login.microsoftonline.com; upgrade-insecure-requests"
  );
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname === '/auth/callback') {
    headers.set('cache-control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
