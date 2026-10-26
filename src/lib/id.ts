import { randomUUID } from "node:crypto";

/** Central place to generate entity IDs — swap strategy (cuid2, ulid) in one spot. */
export function newId(): string {
  return randomUUID();
}
