import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeMac, portalContext, safeContinueUrl, sha256 } from '../functions/_lib/security';

describe('portal security helpers', () => {
  it('normalizes accepted UniFi MAC formats', () => {
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('rejects malformed MAC addresses', () => {
    expect(() => normalizeMac('not-a-mac')).toThrow('Identificação do dispositivo inválida');
  });

  it('only accepts HTTP(S) continuation URLs', () => {
    expect(safeContinueUrl('https://allianceconsultoria.com.br/')).toBe('https://allianceconsultoria.com.br/');
    expect(safeContinueUrl('javascript:alert(1)')).toBe('');
  });

  it('normalizes email and portal context', () => {
    expect(normalizeEmail(' Visitante@Empresa.com ')).toBe('visitante@empresa.com');
    expect(portalContext({ clientMac: 'aa:bb:cc:dd:ee:ff', ssid: 'Alliance Guest' })).toMatchObject({
      clientMac: 'aa:bb:cc:dd:ee:ff',
      ssid: 'Alliance Guest'
    });
  });

  it('produces deterministic credential hashes', async () => {
    expect(await sha256('pepper:voucher')).toBe(await sha256('pepper:voucher'));
    expect(await sha256('pepper:voucher')).not.toBe(await sha256('pepper:other'));
  });
});
