import { NextResponse } from "next/server";
import { signToken, verifyToken } from "@/lib/auth";
import { APP_URL } from "@/lib/mail";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const p = await verifyToken<{ email: string; typ: string }>(token);
  if (!p || p.typ !== "login") return NextResponse.redirect(`${APP_URL()}/login?error=1`);
  const session = await signToken({ email: p.email, typ: "session" }, "12h");
  const res = NextResponse.redirect(`${APP_URL()}/staff`);
  res.cookies.set("sa_session", session, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600,
  });
  return res;
}
