"use client";
import { useState } from "react";
import { DEPARTMENTS } from "@/lib/departments";

type Initial = Partial<Record<string, string | number>> & { has_existing_advance?: boolean };

export default function RequestForm({ mode = "new", token, initial = {} }: { mode?: "new" | "edit"; token?: string; initial?: Initial }) {
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [existing, setExisting] = useState(!!initial.has_existing_advance);
  const [busy, setBusy] = useState(false);
  const v = (k: string) => (initial[k] ?? "") as string | number;
  const field = (name: string, label: string, type = "text") => (
    <div><label>{label}</label><input name={name} type={type} defaultValue={v(name)} required /></div>
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch(mode === "edit" ? "/api/requests/edit" : "/api/requests", {
      method: mode === "edit" ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, token, has_existing_advance: existing, outstanding_advance: existing ? f.outstanding_advance : 0, declaration: f.declaration === "on" }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setDone(data.id); else setErr(data.error || "That didn't work, please try again");
  }

  if (done) return (
    <div className="center-page">
      <div className="center-card">
        <div className="icon-circle" aria-hidden>✓</div>
        <h1>{mode === "edit" ? "Your changes are in" : "Request submitted"}</h1>
        <p className="sub">Your reference is <span className="num pill">{done}</span></p>
        <ol className="timeline">
          <li className="active"><b>HR {mode === "edit" ? "takes another look" : "reviews your request"}</b><span>You'll get an email if anything needs to change.</span></li>
          <li><b>Global Head, HR approves</b><span>Second review of the amount and terms.</span></li>
          <li><b>CEO signs off</b><span>Final approval.</span></li>
          <li><b>Payment</b><span>Finance pays it out. Repayment comes from your salary.</span></li>
        </ol>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Keep an eye on your inbox. We'll email you at each step that needs you.</p>
      </div>
    </div>
  );

  return (
    <>
      <section className="hero"><div className="inner"><h1>{mode === "edit" ? "Update your request" : "Salary advance request"}</h1>
        <p className="sub">{mode === "edit" ? "Make the changes that were asked for and send it back for review." : "Tell us about the advance you need. It takes about two minutes."}</p></div></section>
      <div className="container tight">
        {mode === "edit" && initial.returned_note && (
          <div className="card note"><b>{String(initial.returned_by)} asked for changes</b><p style={{ margin: "4px 0 0" }}>{initial.returned_note}</p></div>
        )}
        <div className="formgrid">
          <form onSubmit={submit}>
            <section className="card">
              <h2 className="sec">About you</h2>
              <p className="hint">We use these details to match your request to payroll.</p>
              <div className="grid">
                {field("employee_name", "Full name")}
                <div><label>Work email</label><input name="employee_email" type="email" defaultValue={v("employee_email")} placeholder="you@autochek.africa" required pattern=".+@autochek\.africa" title="Use your @autochek.africa email" /></div>
                {field("employee_id", "Employee ID")}
                <div><label>Department</label>
                  <select name="department" required defaultValue={String(v("department"))}><option value="" disabled>Select department</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></div>
                {field("job_title", "Job title")}
                {field("line_manager", "Line manager")}
                <div><label>Employment type</label>
                  <select name="employment_type" defaultValue={String(v("employment_type") || "Permanent")}><option>Permanent</option><option>Contract</option><option>Other</option></select></div>
              </div>
            </section>

            <section className="card">
              <h2 className="sec">The advance</h2>
              <p className="hint">Approved amounts may be lower than what you ask for.</p>
              <div className="grid">
                {field("amount_requested", "Amount requested (₦)", "number")}
                <div><label>Preferred repayment period</label>
                  <select name="repayment_months" defaultValue={String(v("repayment_months") || 3)}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} months</option>)}</select></div>
                <div><label>Reason</label>
                  <select name="reason" defaultValue={String(v("reason") || "Medical")}><option>Medical</option><option>Education</option><option>Housing</option><option>Family Emergency</option><option>Other</option></select></div>
                <div><label>Existing salary advance?</label>
                  <select value={existing ? "Yes" : "No"} onChange={(e) => setExisting(e.target.value === "Yes")}><option>No</option><option>Yes</option></select></div>
              </div>
              {existing && (<><label>Outstanding amount (₦)</label><input name="outstanding_advance" type="number" min="0" defaultValue={v("outstanding_advance")} required /></>)}
              <label>Brief explanation</label><textarea name="reason_details" defaultValue={v("reason_details")} placeholder="A few words on why you need the advance" required />
            </section>

            <section className="card">
              <h2 className="sec">Declaration</h2>
              <label className="check" style={{ marginTop: 12 }}>
                <input type="checkbox" name="declaration" required />
                I know that submitting this doesn't guarantee approval, and that if it's approved the money will be taken back from my salary.
              </label>
              {err && <div className="err">{err}</div>}
              <p className="actions"><button disabled={busy}>{busy ? "Submitting…" : mode === "edit" ? "Resubmit request" : "Submit request"}</button></p>
            </section>
          </form>

          <aside className="aside">
            <div className="card">
              <h2 className="sec" style={{ marginBottom: 16 }}>What happens next</h2>
              <ol className="timeline">
                <li><b>HR reviews</b><span>They may ask you for changes.</span></li>
                <li><b>Global Head, HR approves</b><span>A second look at the terms.</span></li>
                <li><b>CEO signs off</b><span>Final approval.</span></li>
                <li><b>You get paid</b><span>Repayment is deducted from your salary.</span></li>
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
