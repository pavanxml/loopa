import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Build workers inspect server modules. They must not open the live database.
const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build"],
  {
    stdio: "inherit",
    env: { ...process.env, SQLITE_PATH: ":memory:" },
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
