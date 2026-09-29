import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { RequestBody, errorText } from "@/lib/requestSchema";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit, DEPARTMENTS, EMPLOYMENT_TYPES, PERIODS, present, REASONS, SELECT_REQ } from "@/lib/workflow";
import { QUEUE } from "@/lib/queue";
import { notifyRole, sendMail } from "@/lib/mail";

export async function POST(req: Request) {
  const parsed = RequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: errorText(parsed.error) }, { status: 400 });
  const d = parsed.data;
  const pool = await db();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Serialise submissions per employee so a double-click can't create two open requests.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [d.employee_id]);
    const open = await c.query(
      "SELECT id FROM requests WHERE employee_id=$1 AND overall_status NOT IN ('Rejected','Completed') LIMIT 1", [d.employee_id]);
    if (open.rows.length) {
      await c.query("ROLLBACK");
      return NextResponse.json({ error: `You already have a request open (${open.rows[0].id}). You can send a new one once that is done or declined.` }, { status: 409 });
    }
    const id = `SA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    await c.query(
      `INSERT INTO requests (id,employee_email,employee_name,employee_id,department,job_title,line_manager,employment_type,
        amount_requested,reason,reason_details,outstanding_advance,repayment_months)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, d.employee_email, d.employee_name, d.employee_id, d.department, d.job_title, d.line_manager, d.employment_type,
        d.amount_requested, d.reason, d.reason_details, d.has_existing_advance ? d.outstanding_advance : 0, d.repayment_months]);
    await audit(c, id, "Submission", d.employee_email, "Submitted");
    await c.query("COMMIT");
    await notifyRole("HR", `New salary advance request: ${id}`, id, "waiting for your review");
    await sendMail(d.employee_email, `We got your salary advance request (${id})`,
      `Hi ${d.employee_name},\n\nYour request ${id} has been received. It goes to HR first, then the Global Head and the CEO. We'll email you when there's an update.\n\nPlease note that submitting a request doesn't mean it's approved.\n\nThanks`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Could not save request" }, { status: 500 });
  } finally {
    c.release();
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(`${SELECT_REQ} WHERE overall_status = ANY($1) ORDER BY submitted_at DESC LIMIT 500`, [QUEUE[session.role]]);
  return NextResponse.json(rows.map(present));
}
