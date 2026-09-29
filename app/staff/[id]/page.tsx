import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { QUEUE } from "@/lib/queue";
import { buildSchedule, present, SELECT_REQ } from "@/lib/workflow";
import Actions from "./Actions";
import RepaymentActions from "./RepaymentActions";

export const dynamic = "force-dynamic";
const money = (n: number | null) => (n == null ? "—" : <span className="num"><span className="cur">₦</span>{n.toLocaleString()}</span>);
const d = (v: any) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const who = (v: string | null) => (v ? v.replace(/\s*<.*>/, "") : "");

const WAITING: Record<string, string> = {
  "With Requester": "With the requester for changes",
  "HR Review": "Waiting on HR",
  "Global Head Review": "Waiting on Global Head, HR",
  "CEO Review": "Waiting on the CEO",
  Approved: "Approved, waiting for payment",
  Paid: "Paid, repayment in progress",
  Completed: "Fully repaid",
};

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const { id } = await params;
  const pool = await db();
  const { rows } = await pool.query(`${SELECT_REQ} WHERE id=$1`, [id]);
  if (!rows.length) notFound();
  const r = present(rows[0]);
  if (!QUEUE[s.role].includes(r.overall_status)) notFound();
  const [rep, log] = await Promise.all([
    pool.query("SELECT * FROM repayments WHERE request_id=$1 ORDER BY paid_on,id", [id]),
    pool.query("SELECT * FROM audit_log WHERE request_id=$1 ORDER BY at,id", [id]),
  ]);

  const schedule = r.hr_status === "Approved" ? buildSchedule(r) : [];
  const pct = r.approved_amount ? Math.min(100, Math.round((r.total_repaid / r.approved_amount) * 100)) : 0;

  const CURRENT: Record<string, string> = { "HR Review": "hr", "Global Head Review": "head", "CEO Review": "ceo" };
  const cur = CURRENT[r.overall_status];
  const steps = [
    { key: "hr", title: "HR", status: r.hr_status, by: r.hr_reviewer, at: r.hr_decision_at, note: r.hr_comments },
    { key: "head", title: "Global Head, HR", status: r.head_status, by: r.head_reviewer, at: r.head_decision_at, note: r.head_comments },
    { key: "ceo", title: "CEO", status: r.ceo_status, by: r.ceo_approver, at: r.ceo_decision_at, note: r.ceo_comments },
  ];
  const upcoming = r.overall_status === "With Requester" || !["HR Review", "Global Head Review", "CEO Review"].includes(r.overall_status)
    ? [] : steps.filter((st) => st.status !== "Approved");
  const canRecord = s.role === "FINANCE" && r.payment_status === "Paid" && (r.outstanding_balance ?? 0) > 0;

  return (
    <div className="container tight">
      <Link href="/staff" className="back">← All requests</Link>
      <header className="page-head">
        <div>
          <h1>{r.employee_name}</h1>
          <p className="meta"><span className="num">{r.id}</span><i>·</i>{r.department}<i>·</i>Submitted {d(r.submitted_at)}</p>
          <p className="waiting">{WAITING[r.overall_status]}{["HR Review", "Global Head Review", "CEO Review", "With Requester"].includes(r.overall_status) ? ` since ${d(r.updated_at)}` : ""}</p>
          {r.returned_note && <a href="#activity" className="msg"><span className="dotmark" />Message from {who(r.returned_by)} · View</a>}
        </div>
        <div className="head-actions">
          <span className="badge lg" data-s={r.overall_status}>{r.overall_status}</span>
          {s.role === "HR" && r.ceo_status === "Approved" && <a className="btn small" href={`/api/requests/${r.id}/download`}>Download approval (PDF)</a>}
        </div>
      </header>


      <div className="detail">
        <div className="detail-main">
          <Actions role={s.role} r={JSON.parse(JSON.stringify(r))} />

          <section className="card">
            <h2 className="sec">Request</h2>
            <div className="kv">
              <div><span>Employee</span><b>{r.employee_name}</b></div>
              <div><span>Employee ID</span><b className="num">{r.employee_id}</b></div>
              <div><span>Work email</span><b>{r.employee_email}</b></div>
              <div><span>Department</span><b>{r.department}</b></div>
              <div><span>Job title</span><b>{r.job_title}</b></div>
              <div><span>Line manager</span><b>{r.line_manager}</b></div>
              <div><span>Employment type</span><b>{r.employment_type}</b></div>
              <div><span>Existing advance</span><b>{money(r.outstanding_advance)}</b></div>
              <div><span>Amount requested</span><b>{money(r.amount_requested)}</b></div>
              <div><span>Repayment period</span><b><span className="num">{r.repayment_months}</span> months</b></div>
            </div>
            <div className="reason">
              <span>Reason · {r.reason}</span>
              <p>{r.reason_details}</p>
            </div>
          </section>

          <section className="card" id="activity">
            <h2 className="sec">Approvals &amp; activity</h2>
            <ol className="tl">
              {log.rows.map((l) => {
                const kind = /^(Approved|Paid|Completed)/.test(l.decision) ? "done" : /^Sent back/.test(l.decision) ? "sentback" : "event";
                return (
                  <li key={l.id} className={kind}>
                    <span className="mark">{kind === "done" ? "✓" : kind === "sentback" ? "↩" : ""}</span>
                    <div>
                      <b>{l.stage} · {l.decision}{l.stage === "Repayment" && /^\d/.test(l.detail ?? "") ? <> {money(Number(l.detail))}</> : null}</b>
                      <span className="sub2">{who(l.actor)} · {new Date(l.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {l.detail && !/^\d/.test(l.detail) && <blockquote>{l.detail}</blockquote>}
                    </div>
                  </li>
                );
              })}
              {upcoming.map((st) => (
                <li key={st.key} className={st.key === cur ? "current" : "todo"}>
                  <span className="mark" />
                  <div>
                    <b>{st.title}</b>
                    <span className="sub2">{st.key === cur ? "Waiting on this review" : "Not started"}</span>
                  </div>
                </li>
              ))}
              {r.overall_status === "With Requester" && (
                <li className="current"><span className="mark" /><div><b>Requester</b><span className="sub2">Waiting for the requester to update and resubmit</span></div></li>
              )}
            </ol>
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <h2 className="sec">Advance terms</h2>
            <div className="stat"><span>Approved amount</span><b className={r.approved_amount == null ? "unset" : undefined}>{r.approved_amount == null ? "Not set yet" : money(r.approved_amount)}</b></div>
            <dl className="mini">
              <dt>Monthly deduction</dt><dd>{money(r.monthly_deduction)}</dd>
              <dt>Deduction starts</dt><dd>{d(r.deduction_start_date)}</dd>
              <dt>Eligibility</dt><dd>{r.eligibility}</dd>
              <dt>Payment</dt><dd>{r.payment_status}{r.payment_date ? ` · ${d(r.payment_date)}` : ""}</dd>
            </dl>
          </section>

          <section className="card">
            <h2 className="sec">Repayment</h2>
            {schedule.length > 0 ? (
              <>
                <div className="row" style={{ marginBottom: 8, fontSize: 14 }}>
                  <span>{money(r.total_repaid)} of {money(r.approved_amount)}</span>
                  <span className="badge" data-s={r.repayment_status}>{r.repayment_status}</span>
                </div>
                <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                <dl className="mini" style={{ marginTop: 16 }}>
                  <dt>Outstanding</dt><dd>{money(r.outstanding_balance)}</dd>
                  <dt>Next deduction</dt><dd>{d(r.next_deduction_date)}</dd>
                  <dt>Final deduction</dt><dd>{d(r.final_deduction_date)}</dd>
                </dl>
                {r.payment_status !== "Paid" && <p className="hint" style={{ marginTop: 12 }}>Repayment starts once the advance has been paid out.</p>}
                <RepaymentActions schedule={schedule} id={r.id} canRecord={canRecord} canRemove={s.role === "FINANCE"}
                  suggested={r.monthly_deduction} outstanding={r.outstanding_balance ?? 0}
                  repayments={rep.rows.map((p) => ({ ...p, amount: Number(p.amount), paid_on: new Date(p.paid_on).toISOString() }))} />
              </>
            ) : (
              <p className="hint" style={{ margin: 0 }}>The plan appears once HR sets the approved amount and deduction start date.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
