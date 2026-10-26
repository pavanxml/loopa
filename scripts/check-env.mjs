import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || /replace-with|changeme/i.test(secret))
  throw new Error(
    "Set JWT_SECRET to at least 32 random characters. Use npm run setup for local development.",
  );
if (!process.env.APP_URL) throw new Error("APP_URL is required.");
if (!process.env.SMTP_URL || !process.env.MAIL_FROM)
  throw new Error(
    "Production email requires SMTP_URL and MAIL_FROM. Run the mail worker alongside the app.",
  );
if (!/^https:\/\//.test(process.env.APP_URL))
  throw new Error(
    "Production APP_URL must use HTTPS. Use npm run dev for a local HTTP preview.",
  );
