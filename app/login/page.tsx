"use client";
import { useState } from "react";

export default function Login() {
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    await fetch("/api/auth/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setBusy(false); setSentTo(email);
  }

  return (
    <div className="auth">
      <aside className="auth-panel">
        <a href="/" className="auth-brand"><img src="/logo.png" alt="Autochek" width={40} height={40} /><span>Salary Advance</span></a>
        <div>
          <h1>Review requests without the email chains.</h1>
          <p className="sub">One place for HR, the Global Head and the CEO to review, approve or send back salary advances.</p>
        </div>
        <ol className="auth-steps">
          <li><span className="num">1</span>HR reviews</li>
          <li><span className="num">2</span>Global Head approves</li>
          <li><span className="num">3</span>CEO signs off</li>
        </ol>
      </aside>

      <section className="auth-form">
        <div className="auth-box">
          {sentTo ? (
            <>
              <div className="auth-check" aria-hidden>✓</div>
              <h2>Check your inbox</h2>
              <p>If <b>{sentTo}</b> is on the staff list, a sign-in link is on its way. It works for 15 minutes.</p>
              <p className="actions"><button className="secondary wide" onClick={() => setSentTo("")}>Use a different email</button></p>
            </>
          ) : (
            <>
              <h2>Staff sign in</h2>
              <p>Enter your work email and we'll send you a link. No password needed.</p>
              <form onSubmit={submit}>
                <label>Work email</label>
                <input name="email" type="email" required autoFocus autoComplete="email" placeholder="you@autochek.africa" />
                <p className="actions"><button className="wide" disabled={busy}>{busy ? "Sending…" : "Send me a link"}</button></p>
              </form>
            </>
          )}
          <p className="auth-back"><a href="/">← Back to the request form</a></p>
        </div>
      </section>
    </div>
  );
}
