import { createHash } from 'node:crypto';

const [codeInput, minutesInput = '240', daysInput = '30', maxUsesInput = '1', ...labelParts] = process.argv.slice(2);
const pepper = process.env.TOKEN_HASH_PEPPER;
if (!codeInput || !pepper) {
  console.error('Uso: TOKEN_HASH_PEPPER=... node scripts/create-voucher.mjs CODIGO [minutos] [dias] [usos] [rótulo]');
  process.exit(1);
}
const code = codeInput.trim().toUpperCase();
if (!/^[A-Z0-9-]{6,64}$/.test(code)) throw new Error('O voucher deve ter 6–64 caracteres A-Z, 0-9 ou hífen.');
const minutes = Number.parseInt(minutesInput, 10);
const days = Number.parseInt(daysInput, 10);
const maxUses = Number.parseInt(maxUsesInput, 10);
if (!(minutes >= 1 && minutes <= 720)) throw new Error('Minutos fora do intervalo 1–720.');
if (!(days >= 1 && days <= 365)) throw new Error('Dias fora do intervalo 1–365.');
if (!(maxUses >= 1 && maxUses <= 1000)) throw new Error('Usos fora do intervalo 1–1000.');
const label = (labelParts.join(' ') || 'Visitante').replaceAll("'", "''").slice(0, 100);
const hash = createHash('sha256').update(`${pepper}:${code}`).digest('base64url');
const now = Math.floor(Date.now() / 1000);
const expires = now + days * 86400;
console.log(
  `INSERT INTO vouchers (code_hash,label,minutes,max_uses,used_count,enabled,expires_at,created_at) ` +
  `VALUES ('${hash}','${label}',${minutes},${maxUses},0,1,${expires},${now}) ` +
  `ON CONFLICT(code_hash) DO UPDATE SET label=excluded.label,minutes=excluded.minutes,` +
  `max_uses=excluded.max_uses,used_count=0,enabled=1,expires_at=excluded.expires_at;`
);
