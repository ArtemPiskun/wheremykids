import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function hmacSha256(key: string | Buffer, input: string): Buffer {
  return createHmac('sha256', key).update(input).digest();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// Crockford base32 without I, L, O, U: unambiguous when dictated over the phone.
const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

/** Normalises user input: strips separators, uppercases and maps look-alike characters. */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!INVITE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * AES-256-GCM envelope for coordinates at rest.
 * Layout: [12-byte IV][16-byte auth tag][ciphertext]; the key version is stored next to it.
 * The record's owner id is bound as AAD, so ciphertext copied to another child fails to decrypt.
 */
export class FieldCipher {
  constructor(
    private readonly keys: Map<number, Buffer>,
    readonly activeVersion: number,
  ) {
    if (!keys.has(activeVersion)) throw new Error('Active key version is missing');
  }

  encrypt(plaintext: object, aad: string): { payload: Buffer; keyVersion: number } {
    const key = this.keys.get(this.activeVersion)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
    return { payload: Buffer.concat([iv, cipher.getAuthTag(), encrypted]), keyVersion: this.activeVersion };
  }

  decrypt<T>(payload: Buffer, keyVersion: number, aad: string): T {
    const key = this.keys.get(keyVersion);
    if (!key) throw new Error(`Unknown encryption key version ${keyVersion}`);
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(payload.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as T;
  }
}
