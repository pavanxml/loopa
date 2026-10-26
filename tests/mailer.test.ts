import { it, expect, vi } from "vitest";
import { createServer } from "node:net";
import { once } from "node:events";
import { db } from "../src/lib/db";
import { mailerService, deliverPendingMail } from "../src/services/mailer";

it("delivers queued mail through SMTP and clears the sensitive payload after success", async () => {
  const deliveries: string[] = [];
  const server = createServer((socket) => {
    socket.write("220 local.test ESMTP\r\n");
    let buffer = "",
      data = false,
      body = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            deliveries.push(body);
            body = "";
            data = false;
            socket.write("250 Queued\r\n");
          } else body += line + "\n";
        } else if (/^EHLO|^HELO/i.test(line))
          socket.write("250 local.test\r\n");
        else if (/^DATA/i.test(line)) {
          data = true;
          socket.write("354 End with dot\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  vi.stubEnv("SMTP_URL", `smtp://127.0.0.1:${address.port}`);
  vi.stubEnv("MAIL_FROM", "LOOPA <noreply@example.test>");
  try {
    await mailerService.sendVerificationEmail(
      "recipient@example.test",
      "https://local.test/verify?token=test-token",
    );
    expect(await deliverPendingMail()).toBe(1);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toContain("test-token");
    expect(
      db
        .prepare(`SELECT status,body,recipient,attempts FROM mail_outbox`)
        .get(),
    ).toMatchObject({ status: "sent", body: "", recipient: "", attempts: 1 });
    expect(await deliverPendingMail()).toBe(0);
  } finally {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 15000);
