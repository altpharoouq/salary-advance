"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RepaymentForm({ id, suggested, outstanding, onDone }: { id: string; suggested: number | null; outstanding: number; onDone?: () => void }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const def = suggested ? Math.min(suggested, outstanding) : outstanding;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch(`/api/requests/${id}/repayments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: f.amount, paid_on: f.paid_on, note: f.note || undefined }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error || "Failed");
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit}>
      <div className="grid">
        <div><label>Amount deducted (₦)</label><input name="amount" type="number" step="0.01" defaultValue={def} required /></div>
        <div><label>Date deducted</label><input name="paid_on" type="date" defaultValue={today} required /></div>
      </div>
      <label>Note (optional)</label><input name="note" />
      {err && <div className="err">{err}</div>}
      <p className="actions"><button className="wide" disabled={busy}>Record repayment</button></p>
    </form>
  );
}

export function RemoveRepayment({ id, rid }: { id: string; rid: number }) {
  const router = useRouter();
  return (
    <button className="secondary small" onClick={async () => {
      if (!confirm("Remove this repayment entry?")) return;
      await fetch(`/api/requests/${id}/repayments?rid=${rid}`, { method: "DELETE" });
      router.refresh();
    }}>Remove</button>
  );
}
