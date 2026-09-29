import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/mail";

export async function POST() {
  const res = NextResponse.json({ ok: true, url: `${APP_URL()}/` });
  res.cookies.delete("sa_session");
  return res;
}
