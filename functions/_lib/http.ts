export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function problem(message: string, status = 400, headers?: HeadersInit): Response {
  return json({ error: message }, { status, headers });
}

export async function readJson<T>(request: Request): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('Envie o conteúdo como application/json.');
  }
  return request.json<T>();
}

export function redirect(location: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('location', location);
  responseHeaders.set('cache-control', 'no-store');
  return new Response(null, { status: 302, headers: responseHeaders });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro inesperado.';
}
