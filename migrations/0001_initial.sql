PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  client_mac TEXT NOT NULL,
  ap_mac TEXT NOT NULL DEFAULT '',
  ssid TEXT NOT NULL DEFAULT '',
  continue_url TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_states_expires ON auth_states(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL CHECK (method IN ('entra', 'voucher', 'token')),
  profile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  client_mac TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 720),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_mac, created_at);

CREATE TABLE IF NOT EXISTS vouchers (
  code_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Visitante',
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 720),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000),
  used_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vouchers_expires ON vouchers(expires_at, enabled);

CREATE TABLE IF NOT EXISTS visitor_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  client_mac TEXT NOT NULL,
  ap_mac TEXT NOT NULL DEFAULT '',
  ssid TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_tokens_lookup
  ON visitor_tokens(email, client_mac, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_tokens_expires ON visitor_tokens(expires_at);
