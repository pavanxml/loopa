import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Minimum viable password strength check. Deliberately simple and
 * predictable rather than a labyrinth of regex rules users can't parse —
 * length is the strongest practical signal for hashed, rate-limited auth.
 */
export function isStrongEnough(plain: string): boolean {
  return plain.length >= 8 && plain.length <= 128;
}
