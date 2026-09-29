import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { RequestBody, errorText } from "@/lib/requestSchema";
import { audit } from "@/lib/workflow";
import { STATUS } from "@/lib/queue";
import { notifyRole } from "@/lib/mail";

/** The requester resubmits a request that was sent back, using the link from their email. */
export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  const p = raw?.token ? await verifyToken<{ id: string; rev: number; typ: string }>(String(raw.token)) : null;
  if (!p || p.typ !== "edit") return NextResponse.json({ error: "This link has expired" }, { status: 401 });
  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: errorText(parsed.error) }, { status: 400 });
  const d = parsed.data;

  const pool = await db();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query("SELECT overall_status, revision FROM requests WHERE id=$1 FOR UPDATE", [p.id]);
    const r = rows[0];
    if (!r || r.overall_status !== STATUS.REQUESTER || r.revision !== p.rev) {
      await c.query("ROLLBACK");
      return NextResponse.json({ error: "This link is no longer valid. The request may already have been resubmitted." }, { status: 409 });
    }
    await c.query(
      `UPDATE requests SET employee_email=$2,employee_name=$3,employee_id=$4,department=$5,job_title=$6,line_manager=$7,employment_type=$8,
         amount_requested=$9,reason=$10,reason_details=$11,outstanding_advance=$12,repayment_months=$13,
         overall_status=$14,revision=revision+1,updated_at=now() WHERE id=$1`,
      [p.id, d.employee_email, d.employee_name, d.employee_id, d.department, d.job_title, d.line_manager, d.employment_type,
        d.amount_requested, d.reason, d.reason_details, d.has_existing_advance ? d.outstanding_advance : 0, d.repayment_months, STATUS.HR]);
    await audit(c, p.id, "Requester", d.employee_email, "Resubmitted");
    await c.query("COMMIT");
    await notifyRole("HR", `Salary advance ${p.id} was updated`, p.id, "updated by the requester and ready for your review");
    return NextResponse.json({ id: p.id });
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  } finally {
    c.release();
  }
}
