import { randomBytes } from 'node:crypto';
import { FieldCipher, formatInviteCode, generateInviteCode, normalizeInviteCode } from '../../src/common/crypto';

describe('FieldCipher', () => {
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);

  it('round-trips and binds ciphertext to its owner', () => {
    const cipher = new FieldCipher(new Map([[1, k1]]), 1);
    const { payload, keyVersion } = cipher.encrypt({ lat: 50.45, lng: 30.52 }, 'child-a');
    expect(cipher.decrypt(payload, keyVersion, 'child-a')).toEqual({ lat: 50.45, lng: 30.52 });
    expect(() => cipher.decrypt(payload, keyVersion, 'child-b')).toThrow();
  });

  it('detects tampering', () => {
    const cipher = new FieldCipher(new Map([[1, k1]]), 1);
    const { payload } = cipher.encrypt({ lat: 1 }, 'x');
    payload[payload.length - 1] ^= 0xff;
    expect(() => cipher.decrypt(payload, 1, 'x')).toThrow();
  });

  it('keeps old data readable after key rotation', () => {
    const old = new FieldCipher(new Map([[1, k1]]), 1).encrypt({ v: 1 }, 'x');
    const rotated = new FieldCipher(new Map([[1, k1], [2, k2]]), 2);
    expect(rotated.decrypt(old.payload, old.keyVersion, 'x')).toEqual({ v: 1 });
    expect(rotated.encrypt({ v: 2 }, 'x').keyVersion).toBe(2);
  });
});

describe('invite codes', () => {
  it('generates 8 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('normalises what people actually type', () => {
    expect(normalizeInviteCode('k7m2-qx9d')).toBe('K7M2QX9D');
    expect(normalizeInviteCode(' AB0O IL12 ')).toBe('AB001112');
    expect(normalizeInviteCode('ABC')).toBeNull();
    expect(normalizeInviteCode('ABCD-EFGU')).toBeNull();
    expect(formatInviteCode('K7M2QX9D')).toBe('K7M2-QX9D');
  });
});
