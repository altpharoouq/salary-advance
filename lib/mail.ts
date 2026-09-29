import nodemailer from "nodemailer";
import { db } from "./db";

export const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

let transport: import("nodemailer").Transporter | null | undefined;
function getTransport() {
  if (transport === undefined) {
    transport = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }
  return transport;
}

export async function sendMail(to: string | string[], subject: string, text: string) {
  const t = getTransport();
  if (!t) {
    console.log(`\n[mail:dev] To: ${[to].flat().join(", ")}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (e) {
    // Email is only the notification layer; never fail the workflow because of it.
    console.error("mail failed", e);
  }
}

export async function notifyRole(role: "HR" | "GLOBAL_HEAD" | "FINANCE" | "CEO", subject: string, requestId: string, action: string) {
  const pool = await db();
  const { rows } = await pool.query("SELECT email FROM staff WHERE role=$1", [role]);
  if (!rows.length) return;
  // Reason details are deliberately kept out of emails; link to the tracker instead.
  await sendMail(
    rows.map((r) => r.email),
    subject,
    `Hi,\n\nSalary advance ${requestId} is ${action}.\n\nYou can open it here: ${APP_URL()}/staff/${requestId}\n\nThanks`
  );
}
