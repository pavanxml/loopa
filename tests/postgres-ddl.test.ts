import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * This doesn't re-run the live Postgres verification (that needs a real
 * server — see docs/schema.postgres.verified.sql's header for how it was
 * verified: applied to a real PostgreSQL 16 instance with 0 errors across
 * 39 tables, plus live FK/unique/cascade/set-null checks against real
 * inserted data). What it checks here is cheaper and catches the most
 * common drift: every model declared in schema.prisma should have a
 * corresponding CREATE TABLE in the hand-translated DDL, so the two files
 * can't silently diverge as the schema evolves.
 */
const prismaSchema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf-8");
const postgresDdl = readFileSync(join(__dirname, "../docs/schema.postgres.verified.sql"), "utf-8");

function modelNames(schema: string): string[] {
  return Array.from(schema.matchAll(/^model\s+(\w+)\s*\{/gm)).map((m) => m[1]!);
}

describe("Postgres DDL stays in sync with schema.prisma", () => {
  const models = modelNames(prismaSchema);

  it("found a non-trivial number of models to check", () => {
    expect(models.length).toBeGreaterThan(25);
  });

  it.each(models)("model %s has a matching CREATE TABLE", (model) => {
    expect(postgresDdl).toMatch(new RegExp(`CREATE TABLE "${model}"`));
  });

  it("every CREATE TABLE has a corresponding Prisma model (no orphaned tables)", () => {
    const tables = Array.from(postgresDdl.matchAll(/CREATE TABLE "(\w+)"/g)).map((m) => m[1]!);
    for (const table of tables) {
      expect(models).toContain(table);
    }
  });
});
