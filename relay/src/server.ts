import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Agent, fetch, type Dispatcher } from 'undici';

interface Config {
  host: string;
  port: number;
  relaySecret: string;
  unifiMode: 'udm' | 'standalone';
  unifiBaseUrl: string;
  unifiSite: string;
  unifiUsername: string;
  unifiPassword: string;
  dispatcher?: Dispatcher;
}

interface AuthorizationBody {
  clientMac: string;
  minutes: number;
  method: 'entra' | 'voucher' | 'token';
  identity: string;
  apMac?: string;
  ssid?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function configuration(): Config {
  const mode = (process.env.UNIFI_MODE || 'udm') as Config['unifiMode'];
  if (!['udm', 'standalone'].includes(mode)) throw new Error('UNIFI_MODE deve ser udm ou standalone.');
  const allowSelfSigned = process.env.UNIFI_ALLOW_SELF_SIGNED === 'true';
  return {
    host: process.env.RELAY_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.RELAY_PORT || '8788', 10),
    relaySecret: required('RELAY_SHARED_SECRET'),
    unifiMode: mode,
    unifiBaseUrl: required('UNIFI_BASE_URL').replace(/\/$/, ''),
    unifiSite: process.env.UNIFI_SITE || 'default',
    unifiUsername: required('UNIFI_USERNAME'),
    unifiPassword: required('UNIFI_PASSWORD'),
    dispatcher: allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage, secret: string): boolean {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function body(request: IncomingMessage): Promise<AuthorizationBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error('Payload excede o limite.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as AuthorizationBody;
}

function validate(input: AuthorizationBody): AuthorizationBody {
  const rawMac = String(input.clientMac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (!/^[0-9a-f]{12}$/.test(rawMac)) throw new Error('MAC inválido.');
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) throw new Error('Validade inválida.');
  if (!['entra', 'voucher', 'token'].includes(input.method)) throw new Error('Método inválido.');
  const identity = String(input.identity || '').trim().slice(0, 254);
  if (!identity) throw new Error('Identidade ausente.');
  return { ...input, clientMac: rawMac.match(/.{2}/g)!.join(':'), minutes, identity };
}

async function unifiLogin(config: Config): Promise<{ cookie: string; csrf: string }> {
  const loginPath = config.unifiMode === 'udm' ? '/api/auth/login' : '/api/login';
  const response = await fetch(`${config.unifiBaseUrl}${loginPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      username: config.unifiUsername,
      password: config.unifiPassword,
      remember: false
    }),
    dispatcher: config.dispatcher
  });
  if (!response.ok) throw new Error(`Falha de autenticação UniFi (${response.status}).`);
  const cookies = response.headers.getSetCookie();
  if (!cookies.length) throw new Error('O UniFi não retornou cookie de sessão.');
  return {
    cookie: cookies.map((item) => item.split(';', 1)[0]).join('; '),
    csrf: response.headers.get('x-csrf-token') || ''
  };
}

async function authorizeUnifi(config: Config, input: AuthorizationBody): Promise<void> {
  const session = await unifiLogin(config);
  const prefix = config.unifiMode === 'udm' ? '/proxy/network' : '';
  const endpoint = `${config.unifiBaseUrl}${prefix}/api/s/${encodeURIComponent(config.unifiSite)}/cmd/stamgr`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    cookie: session.cookie
  };
  if (session.csrf) headers['x-csrf-token'] = session.csrf;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ cmd: 'authorize-guest', mac: input.clientMac, minutes: input.minutes }),
    dispatcher: config.dispatcher
  });
  const result = await response.json().catch(() => null) as { meta?: { rc?: string; msg?: string } } | null;
  if (!response.ok || result?.meta?.rc !== 'ok') {
    throw new Error(`UniFi recusou authorize-guest (${response.status}, ${result?.meta?.msg || 'sem detalhe'}).`);
  }
}

const config = configuration();
const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true });
    if (request.method !== 'POST' || request.url !== '/authorize') return json(response, 404, { error: 'Not found' });
    if (!authorized(request, config.relaySecret)) return json(response, 401, { error: 'Unauthorized' });
    const input = validate(await body(request));
    await authorizeUnifi(config, input);
    console.info('UniFi device authorized', {
      macSuffix: input.clientMac.slice(-8),
      method: input.method,
      minutes: input.minutes,
      durationMs: Date.now() - startedAt
    });
    return json(response, 200, { authorized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.';
    console.error('Authorization failed', { message, durationMs: Date.now() - startedAt });
    return json(response, 502, { error: 'UniFi authorization failed' });
  }
});

server.listen(config.port, config.host, () => {
  console.info(`UniFi relay listening on http://${config.host}:${config.port}`);
});
