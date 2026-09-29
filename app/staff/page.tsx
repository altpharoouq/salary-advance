import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { present, SELECT_REQ } from "@/lib/workflow";
import { QUEUE } from "@/lib/queue";

export const dynamic = "force-dynamic";
const MINE: Record<string, string> = { HR: "HR Review", GLOBAL_HEAD: "Global Head Review", FINANCE: "Approved", CEO: "CEO Review" };
const money = (n: number | null) => (n == null ? "—" : <span className="num"><span className="cur">₦</span>{n.toLocaleString()}</span>);

export default async function Staff({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const { q = "", view = "all" } = await searchParams;
  const s = await getSession();
  if (!s) redirect("/login");
  const pool = await db();
  const [{ rows }, counts, bal] = await Promise.all([
    pool.query(`${SELECT_REQ} WHERE overall_status = ANY($1) AND ($2 = '' OR r.id ILIKE $3 OR employee_name ILIKE $3 OR employee_id ILIKE $3 OR department ILIKE $3) ORDER BY submitted_at DESC LIMIT 500`,
      [view === "action" ? [MINE[s.role]] : QUEUE[s.role], q.trim(), `%${q.trim()}%`]),
    pool.query("SELECT overall_status, COUNT(*)::int n FROM requests GROUP BY 1"),
    pool.query(`SELECT COALESCE(SUM(r.approved_amount - COALESCE(p.s,0)),0) t FROM requests r
      LEFT JOIN (SELECT request_id, SUM(amount) s FROM repayments GROUP BY 1) p ON p.request_id=r.id WHERE r.overall_status='Paid'`),
  ]);
  const by = Object.fromEntries(counts.rows.map((r) => [r.overall_status, r.n]));
  const tilesByRole: Record<string, [string, React.ReactNode][]> = {
    HR: [["Awaiting HR review", by["HR Review"] ?? 0], ["Awaiting Global Head", by["Global Head Review"] ?? 0], ["Awaiting CEO", by["CEO Review"] ?? 0],
      ["With requester", by["With Requester"] ?? 0], ["Approved, to pay", by["Approved"] ?? 0], ["Paid / repaying", by["Paid"] ?? 0], ["Completed", by["Completed"] ?? 0],
      ["Total outstanding", money(Number(bal.rows[0].t))]],
    GLOBAL_HEAD: [["Awaiting your review", by["Global Head Review"] ?? 0], ["Completed", by["Completed"] ?? 0]],
    CEO: [["Awaiting CEO approval", by["CEO Review"] ?? 0], ["Completed", by["Completed"] ?? 0]],
    FINANCE: [["Approved, to pay", by["Approved"] ?? 0],
      ["Paid / repaying", by["Paid"] ?? 0], ["Completed", by["Completed"] ?? 0], ["Total outstanding", money(Number(bal.rows[0].t))]],
  };
  const tiles = tilesByRole[s.role];
  const mine = MINE;
  const actionCount = by[MINE[s.role]] ?? 0;
  const items = rows.map(present);

  return (
    <div className="container tight">
      <h2 style={{ marginTop: 0 }}>Overview</h2>
      <div className="tiles">{tiles.map(([l, v]) => <div className="tile" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
      <h2>Requests</h2>
      <div className="toolbar">
        <div className="tabs">
          <Link href={q ? `/staff?q=${encodeURIComponent(q)}` : "/staff"} className={`tab${view !== "action" ? " on" : ""}`}>{s.role === "HR" ? "All requests" : "Your queue"}</Link>
          <Link href={`/staff?view=action${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`tab${view === "action" ? " on" : ""}`}>Needs your action ({actionCount})</Link>
        </div>
        <form className="search" action="/staff">
          {view === "action" && <input type="hidden" name="view" value="action" />}
          <input name="q" defaultValue={q} placeholder="Search name, ID or department" aria-label="Search" />
        </form>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Request</th><th>Employee</th><th>Requested</th><th>Status</th><th>Outstanding</th><th>Submitted</th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className={r.overall_status === mine[s.role] ? "mine" : undefined}>
                <td>{r.overall_status === mine[s.role] && <span className="dotmark" title="Needs your action" />}<Link href={`/staff/${r.id}`}>{r.id}</Link></td>
                <td>{r.employee_name}<br /><small>{r.department}</small></td>
                <td>{money(r.amount_requested)}</td>
                <td><span className={`badge ${r.overall_status}`}>{r.overall_status}</span></td>
                <td>{r.overall_status === "Paid" ? money(r.outstanding_balance) : "—"}</td>
                <td>{new Date(r.submitted_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty"><b>{q ? "No matches" : view === "action" ? "You're all caught up" : "Nothing here yet"}</b>{q ? "Try a different name, ID or department." : view === "action" ? "Nothing is waiting on you right now." : "Requests will show up here as they come in."}</div>}
      </div>
    </div>
  );
}
