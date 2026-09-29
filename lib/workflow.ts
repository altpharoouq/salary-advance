import type { PoolClient } from "pg";

export const REASONS = ["Medical", "Education", "Housing", "Family Emergency", "Other"] as const;
export const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Other"] as const;
export { DEPARTMENTS } from "./departments";
export const PERIODS = [3, 4, 5, 6] as const;

/** Once the advance is paid out, status follows the repayment balance. Before that, it is set explicitly by each transition. */
export async function refreshStatus(c: PoolClient, id: string) {
  const { rows } = await c.query(
    `SELECT r.overall_status, r.payment_status, r.ceo_status, r.approved_amount,
       COALESCE((SELECT SUM(amount) FROM repayments WHERE request_id=r.id),0) AS total_repaid
     FROM requests r WHERE id=$1`, [id]);
  const r = rows[0];
  let status: string = r.overall_status;
  if (r.payment_status === "Paid" && r.ceo_status === "Approved") {
    status = Number(r.approved_amount ?? 0) - Number(r.total_repaid) <= 0 ? "Completed" : "Paid";
  }
  await c.query("UPDATE requests SET overall_status=$2, updated_at=now() WHERE id=$1", [id, status]);
  return status;
}

export async function audit(c: PoolClient, requestId: string, stage: string, actor: string, decision: string, detail?: string) {
  await c.query("INSERT INTO audit_log (request_id,stage,actor,decision,detail) VALUES ($1,$2,$3,$4,$5)",
    [requestId, stage, actor, decision, detail ?? null]);
}

export function monthlyDeduction(approved: number | null, months: number) {
  return approved ? Math.round((approved / months) * 100) / 100 : null;
}

export function addMonths(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Shape a DB row for the API, adding the computed repayment fields. */
export function present(r: any) {
  const approved = r.approved_amount == null ? null : Number(r.approved_amount);
  const repaid = Number(r.total_repaid ?? 0);
  const start = r.deduction_start_date ? new Date(r.deduction_start_date).toISOString().slice(0, 10) : null;
  const monthly = monthlyDeduction(approved, r.repayment_months);
  const paid = r.payment_status === "Paid";
  const outstanding = approved == null ? null : Math.max(approved - repaid, 0);
  let repaymentStatus = "Not Started";
  if (paid && approved != null) repaymentStatus = outstanding === 0 ? "Completed" : repaid > 0 || (start && start <= new Date().toISOString().slice(0, 10)) ? "Active" : "Not Started";
  const installmentsDone = monthly ? Math.floor(repaid / monthly + 1e-6) : 0;
  return {
    ...r,
    amount_requested: Number(r.amount_requested),
    outstanding_advance: Number(r.outstanding_advance),
    approved_amount: approved,
    total_repaid: repaid,
    outstanding_balance: outstanding,
    monthly_deduction: monthly,
    deduction_start_date: start,
    next_deduction_date: start && repaymentStatus !== "Completed" ? addMonths(start, installmentsDone) : null,
    final_deduction_date: start ? addMonths(start, r.repayment_months - 1) : null,
    repayment_status: repaymentStatus,
  };
}

export const SELECT_REQ = `SELECT r.*, COALESCE((SELECT SUM(amount) FROM repayments WHERE request_id=r.id),0) AS total_repaid FROM requests r`;

export type Installment = { n: number; due: string; amount: number; paid: number; status: "Paid" | "Partial" | "Overdue" | "Upcoming" };

/** Split the approved amount into monthly installments and allocate recorded repayments to them in order. */
export function buildSchedule(r: { approved_amount: number | null; deduction_start_date: string | null; repayment_months: number; total_repaid: number; payment_status: string }): Installment[] {
  if (!r.approved_amount || !r.deduction_start_date) return [];
  const months = r.repayment_months;
  const base = Math.floor((r.approved_amount / months) * 100) / 100;
  const today = new Date().toISOString().slice(0, 10);
  let left = r.total_repaid;
  return Array.from({ length: months }, (_, i) => {
    const amount = i === months - 1 ? Math.round((r.approved_amount! - base * (months - 1)) * 100) / 100 : base;
    const paid = Math.min(left, amount);
    left = Math.round((left - paid) * 100) / 100;
    const due = addMonths(r.deduction_start_date!, i);
    const status = paid >= amount - 0.005 ? "Paid" : paid > 0 ? (due < today ? "Overdue" : "Partial") : r.payment_status === "Paid" && due < today ? "Overdue" : "Upcoming";
    return { n: i + 1, due, amount, paid, status };
  });
}
