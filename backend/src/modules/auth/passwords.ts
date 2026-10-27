import * as argon2 from 'argon2';

// OWASP Password Storage Cheat Sheet baseline for argon2id.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  // Verify against a dummy hash for unknown users so response time does not reveal registered emails.
  const target = hash ?? (await (dummyHash ??= argon2.hash('timing-equaliser', OPTIONS)));
  try {
    const ok = await argon2.verify(target, password);
    return hash !== null && ok;
  } catch {
    return false;
  }
}
