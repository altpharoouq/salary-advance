import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, signToken } from "@/lib/auth";
import { audit, present, refreshStatus, SELECT_REQ } from "@/lib/workflow";
import { QUEUE, ROLE_LABEL, SEND_TO, STAGE_OF, STATUS, TARGET_LABEL, type SendTarget } from "@/lib/queue";
import { after as runAfter } from "next/server";
import { APP_URL, firstName, notifyRole, processEmailQueue, sendEmail, type Email } from "@/lib/mail";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pool = await db();
  const { rows } = await pool.query(`${SELECT_REQ} WHERE id=$1`, [id]);
  if (!rows.length || !QUEUE[session.role].includes(rows[0].overall_status)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [rep, log] = await Promise.all([
    pool.query("SELECT * FROM repayments WHERE request_id=$1 ORDER BY paid_on, id", [id]),
    pool.query("SELECT * FROM audit_log WHERE request_id=$1 ORDER BY at, id", [id]),
  ]);
  return NextResponse.json({ request: present(rows[0]), repayments: rep.rows, audit: log.rows });
}

const APPROVER: Record<string, string> = { HR: "HR", GLOBAL_HEAD: "The Global Head", CEO: "The CEO", FINANCE: "Finance" };

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"), comments: z.string().max(2000).optional(),
    eligibility: z.enum(["Eligible", "Not Eligible"]).optional(),
    approved_amount: z.coerce.number().positive().optional(),
    deduction_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({ action: z.literal("send_back"), to: z.enum(["REQUESTER", "HR", "HEAD"]), comment: z.string().trim().min(3, "Say what needs to change").max(2000) }),
  z.object({ action: z.literal("payment"), status: z.enum(["Processing", "Paid"]), payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
]);

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  const a = parsed.data;
  const role = session.role;
  if (a.action === "payment" ? role !== "FINANCE" : role === "FINANCE") {
    return NextResponse.json({ error: "Your role can't perform this action" }, { status: 403 });
  }

  const { id } = await params;
  const pool = await db();
  const c = await pool.connect();
  const fail = async (status: number, error: string) => { await c.query("ROLLBACK"); return NextResponse.json({ error }, { status }); };
  const actor = `${session.name} <${session.email}>`;
  // Emails are queued inside the transaction, so they exist only if the action commits.
  const notify = (role: Parameters<typeof notifyRole>[0], subject: string, requestId: string, message: string) => notifyRole(role, subject, requestId, message, c);
  const mail = (email: Email, to: string, subject: string) => sendEmail(email, to, subject, id, c);
  let after: (() => Promise<void>) | undefined;

  try {
    await c.query("BEGIN");
    const { rows } = await c.query("SELECT * FROM requests WHERE id=$1 FOR UPDATE", [id]);
    const r = rows[0];
    if (!r) return await fail(404, "Not found");

    if (a.action === "payment") {
      if (r.ceo_status !== "Approved") return await fail(409, "Not yet approved by CEO");
      if (r.payment_status === "Paid") return await fail(409, "Already paid");
      const date = a.payment_date ?? new Date().toISOString().slice(0, 10);
      await c.query(`UPDATE requests SET payment_status=$2,payment_date=$3 WHERE id=$1`, [id, a.status, a.status === "Paid" ? date : null]);
      await audit(c, id, "Payment", actor, a.status);
      if (a.status === "Paid") after = () => mail(
        { name: "salary_advance_paid_en", variables: { name: firstName(r.employee_name), requestId: id } },
        r.employee_email, `Your salary advance ${id} has been paid`);
    } else {
      if (r.overall_status !== STAGE_OF[role]) return await fail(409, "This request isn't waiting on you");

      if (a.action === "approve") {
        const clear = "returned_by=NULL,returned_to=NULL,returned_note=NULL,returned_at=NULL";
        if (role === "HR") {
          const amt = a.approved_amount;
          if (!amt || amt > Number(r.amount_requested)) return await fail(400, "Approved amount is required and cannot exceed the amount requested");
          if (a.eligibility !== "Eligible") return await fail(400, "Eligibility must be 'Eligible' to approve");
          if (!a.deduction_start_date) return await fail(400, "Deduction start date is required");
          await c.query(
            `UPDATE requests SET hr_status='Approved',hr_reviewer=$2,hr_comments=$3,hr_decision_at=now(),approved_amount=$4,
               deduction_start_date=$5,eligibility='Eligible',overall_status=$6,${clear} WHERE id=$1`,
            [id, actor, a.comments ?? null, amt, a.deduction_start_date, STATUS.HEAD]);
          after = () => notify("GLOBAL_HEAD", `Salary advance ${id} needs your review`, id, "ready for your review");
        } else if (role === "GLOBAL_HEAD") {
          await c.query(`UPDATE requests SET head_status='Approved',head_reviewer=$2,head_comments=$3,head_decision_at=now(),overall_status=$4,${clear} WHERE id=$1`,
            [id, actor, a.comments ?? null, STATUS.CEO]);
          after = () => notify("CEO", `Salary advance ${id} needs your approval`, id, "ready for CEO approval");
        } else {
          await c.query(`UPDATE requests SET ceo_status='Approved',ceo_approver=$2,ceo_comments=$3,ceo_decision_at=now(),overall_status=$4,${clear} WHERE id=$1`,
            [id, actor, a.comments ?? null, STATUS.APPROVED]);
          const amount = Number(r.approved_amount).toLocaleString("en-NG", { maximumFractionDigits: 2 });
          const startDate = new Date(r.deduction_start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          after = async () => {
            // Everyone involved hears about the final approval, one send per recipient group.
            await mail(
              { name: "salary_advance_approved_en", variables: { name: firstName(r.employee_name), requestId: id, amount, months: String(r.repayment_months), startDate } },
              r.employee_email, `Your salary advance ${id} is approved`);
            await notify("HR", `Salary advance ${id} is fully approved`, id, "approved by the CEO. You can download the approval from the request page");
            await notify("GLOBAL_HEAD", `Salary advance ${id} is fully approved`, id, "approved by the CEO");
            await notify("CEO", `Salary advance ${id} is fully approved`, id, "approved. Thanks for signing off");
            await notify("FINANCE", `Salary advance ${id} is approved, ready to pay`, id, "approved and ready for payment");
          };
        }
        await audit(c, id, ROLE_LABEL[role], actor, "Approved", a.comments);
      } else {
        if (!SEND_TO[role].includes(a.to)) return await fail(400, "You can't send it back to that person");
        // Reset the decisions that have to be made again from the stage it's sent back to.
        const resets: Record<SendTarget, string> = {
          REQUESTER: "hr_status='Pending',hr_reviewer=NULL,hr_comments=NULL,hr_decision_at=NULL,head_status='Pending',ceo_status='Pending'",
          HR: "hr_status='Pending',hr_reviewer=NULL,hr_comments=NULL,hr_decision_at=NULL,head_status='Pending',head_reviewer=NULL,head_comments=NULL,head_decision_at=NULL,ceo_status='Pending',ceo_approver=NULL,ceo_comments=NULL,ceo_decision_at=NULL",
          HEAD: "head_status='Pending',head_reviewer=NULL,head_comments=NULL,head_decision_at=NULL,ceo_status='Pending',ceo_approver=NULL,ceo_comments=NULL,ceo_decision_at=NULL",
        };
        const next = { REQUESTER: STATUS.REQUESTER, HR: STATUS.HR, HEAD: STATUS.HEAD }[a.to];
        await c.query(
          `UPDATE requests SET ${resets[a.to]},overall_status=$2,revision=revision+1,
             returned_by=$3,returned_to=$4,returned_note=$5,returned_at=now() WHERE id=$1`,
          [id, next, actor, TARGET_LABEL[a.to], a.comment]);
        await audit(c, id, ROLE_LABEL[role], actor, `Sent back to ${TARGET_LABEL[a.to]}`, a.comment);
        const rev = r.revision + 1;
        if (a.to === "REQUESTER") {
          after = async () => {
            const token = await signToken({ id, rev, typ: "edit" }, "14d");
            await mail(
              { name: "salary_advance_changes_requested_en", variables: { name: firstName(r.employee_name), requestId: id, approver: APPROVER[role], comment: a.comment, editLink: `${APP_URL()}/edit/${token}` } },
              r.employee_email, `Your salary advance request needs a few changes (${id})`);
          };
        } else {
          const to = a.to === "HR" ? "HR" : "GLOBAL_HEAD";
          after = () => notify(to, `Salary advance ${id} was sent back to you`, id, `back with you for review. ${APPROVER[role]} says: "${a.comment}"`);
        }
      }
    }

    const status = await refreshStatus(c, id);
    await after?.();
    await c.query("COMMIT");
    runAfter(() => processEmailQueue());
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  } finally {
    c.release();
  }
}
