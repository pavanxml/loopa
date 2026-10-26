import { deliverPendingMail } from "../src/services/mailer";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function run() {
  do {
    const count = await deliverPendingMail();
    if (count) console.log(JSON.stringify({ event: "mail_delivered", count }));
    if (process.argv.includes("--once")) break;
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (!stopped);
}
run().catch(() => {
  console.error(
    "Mail worker stopped. Check SMTP configuration and database access.",
  );
  process.exitCode = 1;
});
