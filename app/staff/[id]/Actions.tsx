"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";

const STAGE: Record<string, string> = { HR: "HR Review", GLOBAL_HEAD: "Global Head Review", CEO: "CEO Review" };
const TARGETS: Record<string, { value: string; label: string }[]> = {
  HR: [{ value: "REQUESTER", label: "Requester" }],
  GLOBAL_HEAD: [{ value: "HR", label: "HR" }],
  CEO: [{ value: "HEAD", label: "Global Head, HR" }, { value: "HR", label: "HR" }],
};

export default function Actions({ role, r }: { role: string; r: any }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendBack, setSendBack] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function patch(body: object, leaveQueue = false) {
    setErr(""); setBusy(true);
    const res = await fetch(`/api/requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error || "Failed");
    if (leaveQueue) router.push("/staff"); else router.refresh();
  }

  const values = (id: string) => Object.fromEntries(new FormData(document.getElementById(id) as HTMLFormElement)) as Record<string, string>;
  let body: React.ReactNode = null;

  if (STAGE[role] && r.overall_status === STAGE[role]) {
    body = (
      <>
        <form id="review" onSubmit={(e) => e.preventDefault()}>
          {role === "HR" && (
            <div className="grid">
              <div><label>Approved amount (₦, max {r.amount_requested.toLocaleString()})</label><input name="approved_amount" type="number" defaultValue={r.approved_amount ?? r.amount_requested} /></div>
              <div><label>Deduction start date</label><input name="deduction_start_date" type="date" defaultValue={r.deduction_start_date ?? ""} /></div>
              <div><label>Eligibility check</label><select name="eligibility" defaultValue="Eligible"><option>Eligible</option><option>Not Eligible</option></select></div>
            </div>
          )}
          <label>Comments (optional)</label><textarea name="comments" />
          <p className="btnrow">
            <button type="button" disabled={busy} onClick={() => {
              const f = values("review");
              patch({ action: "approve", comments: f.comments || undefined, eligibility: f.eligibility,
                approved_amount: f.approved_amount || undefined, deduction_start_date: f.deduction_start_date || undefined }, true);
            }}>Approve</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setSendBack(true)}>Send back for edits</button>
          </p>
        </form>

        <Modal title="Send back for edits" open={sendBack} onClose={() => setSendBack(false)}>
          <form onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; patch({ action: "send_back", to: f.to, comment: f.comment }, true); }}>
            <label>Send back to</label>
            <select name="to">{TARGETS[role].map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <label>What needs to change?</label>
            <textarea name="comment" required minLength={3} placeholder="Say what you need edited or reworked" />
            {err && <div className="err">{err}</div>}
            <p className="actions"><button className="wide" disabled={busy}>Send back</button></p>
          </form>
        </Modal>
      </>
    );
  } else if (role === "FINANCE" && r.overall_status === "Approved") {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; patch({ action: "payment", status: f.status, payment_date: f.payment_date || undefined }); }}>
        <div className="grid">
          <div><label>Payment status</label><select name="status"><option>Processing</option><option>Paid</option></select></div>
          <div><label>Payment date</label><input name="payment_date" type="date" defaultValue={today} /></div>
        </div>
        <p className="actions"><button disabled={busy}>Update payment</button></p>
      </form>
    );
  }

  if (!body) return null;
  return (
    <section className="card action">
      <h2 className="sec">Needs your decision</h2>
      <p className="hint" style={{ marginBottom: 0 }}>Review the details below, then approve or send it back.</p>
      {body}{err && !sendBack && <div className="err">{err}</div>}
    </section>
  );
}
