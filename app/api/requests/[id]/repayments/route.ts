import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit, refreshStatus } from "@/lib/workflow";

const Body = z.object({
  amount: z.coerce.number().positive(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "FINANCE") return NextResponse.json({ error: "Only Finance can record repayments" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id } = await params;
  const pool = await db();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      `SELECT payment_status, approved_amount, COALESCE((SELECT SUM(amount) FROM repayments WHERE request_id=$1),0) repaid
       FROM requests WHERE id=$1 FOR UPDATE`, [id]);
    const r = rows[0];
    if (!r) { await c.query("ROLLBACK"); return NextResponse.json({ error: "Not found" }, { status: 404 }); }
    if (r.payment_status !== "Paid") { await c.query("ROLLBACK"); return NextResponse.json({ error: "Advance has not been paid yet" }, { status: 409 }); }
    const outstanding = Number(r.approved_amount) - Number(r.repaid);
    if (parsed.data.amount > outstanding + 0.005) {
      await c.query("ROLLBACK");
      return NextResponse.json({ error: `Exceeds outstanding balance (${outstanding})` }, { status: 400 });
    }
    const actor = `${session.name} <${session.email}>`;
    await c.query("INSERT INTO repayments (request_id,amount,paid_on,note,recorded_by) VALUES ($1,$2,$3,$4,$5)",
      [id, parsed.data.amount, parsed.data.paid_on, parsed.data.note ?? null, actor]);
    await audit(c, id, "Repayment", actor, "Recorded", String(parsed.data.amount));
    const status = await refreshStatus(c, id);
    if (status === "Completed") await audit(c, id, "Repayment", "system", "Completed");
    await c.query("COMMIT");
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    c.release();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "FINANCE") return NextResponse.json({ error: "Only Finance can remove repayments" }, { status: 403 });
  const { id } = await params;
  const rid = Number(new URL(req.url).searchParams.get("rid"));
  if (!rid) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const pool = await db();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT 1 FROM requests WHERE id=$1 FOR UPDATE", [id]);
    const del = await c.query("DELETE FROM repayments WHERE id=$1 AND request_id=$2 RETURNING amount", [rid, id]);
    if (!del.rowCount) { await c.query("ROLLBACK"); return NextResponse.json({ error: "Not found" }, { status: 404 }); }
    await audit(c, id, "Repayment", `${session.name} <${session.email}>`, "Removed", String(del.rows[0].amount));
    const status = await refreshStatus(c, id);
    await c.query("COMMIT");
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    c.release();
  }
}
