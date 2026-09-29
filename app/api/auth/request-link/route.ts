import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { APP_URL, sendMail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (e) {
    const pool = await db();
    const { rows } = await pool.query("SELECT email FROM staff WHERE email=$1", [e]);
    if (rows.length) {
      const token = await signToken({ email: e, typ: "login" }, "15m");
      await sendMail(e, "Your sign-in link", `Hi,\n\nHere's your link to sign in. It works for the next 15 minutes:\n${APP_URL()}/api/auth/verify?token=${token}\n\nIf you didn't ask for this, just ignore it.`);
    }
  }
  // Same response either way so the endpoint can't be used to discover staff emails.
  return NextResponse.json({ ok: true });
}
