import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { after } from "next/server";
import { APP_URL, processEmailQueue, sendEmail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (e) {
    const pool = await db();
    const { rows } = await pool.query("SELECT email FROM staff WHERE email=$1", [e]);
    if (rows.length) {
      const token = await signToken({ email: e, typ: "login" }, "15m");
      await sendEmail(
        { name: "salary_advance_sign_in_link_en", variables: { signInLink: `${APP_URL()}/api/auth/verify?token=${token}` } },
        e, "Your sign-in link");
      after(() => processEmailQueue());
    }
  }
  // Same response either way so the endpoint can't be used to discover staff emails.
  return NextResponse.json({ ok: true });
}
