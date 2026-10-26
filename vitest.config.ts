import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * This Vite version predates `node:sqlite` and so doesn't recognize it as a
 * Node builtin — its dep scanner rewrites the specifier to a bare "sqlite"
 * and then fails to resolve it. This plugin marks the import external so it
 * is handed to the Node runtime untouched.
 */
function externalizeNodeSqlite() {
  return {
    name: "externalize-node-sqlite",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id === "node:sqlite" || id === "sqlite") return { id: "node:sqlite", external: true };
      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalizeNodeSqlite()],
  test: {
    environment: "node",
    env: { SQLITE_PATH: ":memory:", JWT_SECRET: "test-only-secret-with-at-least-thirty-two-characters" },
    include: ["tests/**/*.test.ts"],
    pool: "forks",
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
