import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  id = randomUUID();
const production = process.env.E2E_PRODUCTION === "1";
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    production ? "start" : "dev",
    ...(!production ? ["--turbopack"] : []),
    "--port",
    "3100",
    "--hostname",
    "127.0.0.1",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: production ? "production" : "development",
      APP_URL: "http://localhost:3100",
      SQLITE_PATH: `.data/e2e-${id}.db`,
      UPLOAD_DIR: `.data/e2e-media-${id}`,
      JWT_SECRET: "isolated-browser-test-secret-not-for-production",
      NEXT_DIST_DIR: production ? ".next" : ".next-e2e-turbo",
      TRUST_PROXY: "false",
      REDIS_URL: "",
      SMTP_URL: "",
      MAIL_FROM: "",
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill());
child.on("exit", (code) => process.exit(code ?? 1));
