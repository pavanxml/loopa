import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { db, transaction } from "@/lib/db";

export interface MailerService {
  sendVerificationEmail(to: string, link: string): Promise<void>;
  sendPasswordResetEmail(to: string, link: string): Promise<void>;
}
function enqueue(to: string, subject: string, body: string) {
  db.prepare(
    `INSERT INTO mail_outbox(id,recipient,subject,body,nextAttemptAt,createdAt) VALUES(?,?,?,?,?,?)`,
  ).run(randomUUID(), to, subject, body, Date.now(), new Date().toISOString());
}
export const mailerService: MailerService = {
  async sendVerificationEmail(to, link) {
    enqueue(
      to,
      "Verify your LOOPA email",
      `Welcome to your new Orbit. Verify your email:\n\n${link}\n\nThis link expires in 24 hours. If you did not sign up, ignore this message.`,
    );
  },
  async sendPasswordResetEmail(to, link) {
    enqueue(
      to,
      "Reset your LOOPA password",
      `Reset your password:\n\n${link}\n\nThis link expires in one hour. If you did not request a reset, ignore this message.`,
    );
  },
};
type Mail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
};
/** Persistent, leased delivery with bounded exponential retry; never logs credentials or reset links. */
export async function deliverPendingMail(limit = 20) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM)
    throw new Error(
      "Configure SMTP_URL and MAIL_FROM before running the mail worker.",
    );
  const transport = nodemailer.createTransport({
    url: process.env.SMTP_URL,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  let delivered = 0;
  try {
    for (let i = 0; i < limit; i++) {
      const mail = transaction(() => {
        const row = db
          .prepare(
            `SELECT id,recipient,subject,body,attempts FROM mail_outbox WHERE (status='pending' AND nextAttemptAt<=?) OR (status='sending' AND leaseUntil<?) ORDER BY createdAt LIMIT 1`,
          )
          .get(Date.now(), Date.now()) as Mail | undefined;
        if (row)
          db.prepare(
            `UPDATE mail_outbox SET status='sending',leaseUntil=?,attempts=attempts+1 WHERE id=?`,
          ).run(Date.now() + 60000, row.id);
        return row;
      });
      if (!mail) break;
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: mail.recipient,
          subject: mail.subject,
          text: mail.body,
        });
        db.prepare(
          `UPDATE mail_outbox SET status='sent',body='',recipient='',leaseUntil=NULL WHERE id=?`,
        ).run(mail.id);
        delivered++;
      } catch {
        db.prepare(
          `UPDATE mail_outbox SET status=?,nextAttemptAt=?,leaseUntil=NULL WHERE id=?`,
        ).run(
          mail.attempts >= 4 ? "failed" : "pending",
          Date.now() + Math.min(3600000, 30000 * 2 ** mail.attempts),
          mail.id,
        );
        console.error(
          JSON.stringify({
            event: "mail_delivery_failed",
            mailId: mail.id,
            attempt: mail.attempts + 1,
          }),
        );
      }
    }
  } finally {
    transport.close();
  }
  return delivered;
}
