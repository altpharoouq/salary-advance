import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { STATUS } from "@/lib/queue";
import RequestForm from "@/components/RequestForm";

export const dynamic = "force-dynamic";

export default async function Edit({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await verifyToken<{ id: string; rev: number; typ: string }>(token);
  const pool = await db();
  const r = p && p.typ === "edit" ? (await pool.query("SELECT * FROM requests WHERE id=$1", [p.id])).rows[0] : null;
  if (!r || r.overall_status !== STATUS.REQUESTER || r.revision !== p!.rev) {
    return (
      <div className="center-page"><div className="center-card">
        <div className="icon-circle" aria-hidden style={{ background: "var(--surface-strong)", color: "var(--ink)" }}>!</div>
        <h1>This link isn't valid any more</h1>
        <p className="sub">It may have expired, or the request has already been resubmitted. If you still need to make changes, please speak to HR.</p>
        <p className="actions"><a className="btn" href="/">Back to the request form</a></p>
      </div></div>
    );
  }
  const initial = {
    ...r,
    returned_by: String(r.returned_by || "").replace(/\s*<.*>/, ""),
    amount_requested: Number(r.amount_requested),
    outstanding_advance: Number(r.outstanding_advance),
    has_existing_advance: Number(r.outstanding_advance) > 0,
  };
  return <RequestForm mode="edit" token={token} initial={JSON.parse(JSON.stringify(initial))} />;
}
