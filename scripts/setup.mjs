import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    `APP_URL=http://localhost:3000\nJWT_SECRET=${randomBytes(48).toString("hex")}\nSQLITE_PATH=.data/loopa.db\nTRUST_PROXY=false\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created .env with a random session secret. No credentials were printed.",
  );
} else console.log("Existing .env preserved.");
