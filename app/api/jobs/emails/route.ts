import { NextResponse } from "next/server";
import { processEmailQueue } from "@/lib/mail";

/** Safety net for retries: a scheduler (e.g. Vercel Cron) calls this to send anything that is due. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ processed: await processEmailQueue({ limit: 100, budgetMs: 0 }) });
}
