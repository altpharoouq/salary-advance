import { db } from "./db";

/** Base URL of this app, used to build every link in the emails. */
export const APP_URL = () => (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Every email goes through a template registered in the template-mgt service. All variables are mandatory strings. */
export type Email =
  | { name: "salary_advance_sign_in_link_en"; variables: { signInLink: string } }
  | { name: "salary_advance_request_received_en"; variables: { name: string; requestId: string } }
  | { name: "salary_advance_changes_requested_en"; variables: { name: string; requestId: string; approver: string; comment: string; editLink: string } }
  | { name: "salary_advance_approved_en"; variables: { name: string; requestId: string; amount: string; months: string; startDate: string } }
  | { name: "salary_advance_paid_en"; variables: { name: string; requestId: string } }
  | { name: "salary_advance_staff_notification_en"; variables: { requestId: string; message: string; link: string } };

type Executor = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };
export const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

// ── Queue: emails are written to the database (in the same transaction as the action that caused them) and sent by a worker.

/** Queue one email for one recipient. Pass the transaction's client so the email is only queued if the action commits. */
export async function sendEmail(email: Email, recipient: string, subject: string, requestId?: string, exec?: Executor) {
  const q = exec ?? (await db());
  await q.query(
    "INSERT INTO email_jobs (template, variables, recipient, subject, request_id) VALUES ($1,$2,$3,$4,$5)",
    [email.name, JSON.stringify(email.variables), recipient.toLowerCase(), subject, requestId ?? null],
  );
}

/** Staff email for everyone holding a role, one queued email per person. `message` has no leading "is" and no trailing full stop. */
export async function notifyRole(role: "HR" | "GLOBAL_HEAD" | "FINANCE" | "CEO", subject: string, requestId: string, message: string, exec?: Executor) {
  const q = exec ?? (await db());
  const { rows } = await q.query("SELECT email FROM staff WHERE role=$1", [role]);
  for (const r of rows) {
    await sendEmail({ name: "salary_advance_staff_notification_en", variables: { requestId, message, link: `${APP_URL()}/staff/${requestId}` } }, r.email, subject, requestId, q);
  }
}

// ── Worker

const MAX_ATTEMPTS = 5;
let cachedToken: string | null = null;

async function login(): Promise<string> {
  const { AUTH_LOGIN_URL, TEMPLATE_API_USERNAME, TEMPLATE_API_PASSWORD } = process.env;
  if (!AUTH_LOGIN_URL || !TEMPLATE_API_USERNAME || !TEMPLATE_API_PASSWORD) throw new Error("template API credentials are not configured");
  const res = await fetch(AUTH_LOGIN_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TEMPLATE_API_USERNAME, password: TEMPLATE_API_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const token = (await res.json())?.data?.accessToken;
  if (!token) throw new Error("login response had no access token");
  cachedToken = token;
  return token;
}

async function sendJob(job: { template: string; variables: any; recipient: string; subject: string }) {
  const url = `${(process.env.TEMPLATE_API_BASE_URL || "").replace(/\/$/, "")}/template-mgt/templates/send`;
  const post = (token: string) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: job.template, variables: job.variables, channel: "EMAIL", recipients: [job.recipient], subject: job.subject }),
    });
  let res = await post(cachedToken ?? (await login()));
  if (res.status === 401) res = await post(await login()); // token expired: log in again and retry once
  if (!res.ok) throw new Error(`send failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function runOnce(limit: number) {
  const pool = await db();
  const { rows } = await pool.query(
    `UPDATE email_jobs SET locked_until = now() + interval '2 minutes'
     WHERE id IN (SELECT id FROM email_jobs
       WHERE status='pending' AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now())
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [limit]);
  const base = Number(process.env.EMAIL_RETRY_BASE_SECONDS || 30);
  await Promise.all(rows.map(async (job) => {
    try {
      await sendJob(job);
      // Drop the variables once sent: they can contain sign-in and edit links.
      await pool.query("UPDATE email_jobs SET status='sent', sent_at=now(), attempts=attempts+1, variables=NULL, locked_until=NULL, last_error=NULL WHERE id=$1", [job.id]);
    } catch (e) {
      const attempts = job.attempts + 1;
      const msg = e instanceof Error ? e.message : String(e);
      const failed = attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE email_jobs SET attempts=$2, status=$3, last_error=$4, locked_until=NULL,
           next_attempt_at = now() + ($5 * interval '1 second') WHERE id=$1`,
        [job.id, attempts, failed ? "failed" : "pending", msg, base * 2 ** (attempts - 1)]);
      if (failed) console.error(`email failed for good: template=${job.template} request=${job.request_id ?? "-"} recipient=${job.recipient} error=${msg}`);
    }
  }));
  return rows.length;
}

/**
 * Send whatever is due. A failed email is retried with backoff and never affects the others or the user's action.
 * With a time budget, the worker also waits for retries that fall due inside it (retries later than that are picked up
 * by the next action or by the scheduled call to /api/jobs/emails).
 */
export async function processEmailQueue(opts: { limit?: number; budgetMs?: number } = {}) {
  const budget = opts.budgetMs ?? Number(process.env.EMAIL_WORKER_BUDGET_SECONDS || 8) * 1000;
  const deadline = Date.now() + budget;
  const pool = await db();
  let total = 0;
  for (;;) {
    total += await runOnce(opts.limit ?? 25);
    if (Date.now() >= deadline) break;
    const { rows } = await pool.query("SELECT EXTRACT(EPOCH FROM (MIN(next_attempt_at) - now())) AS s FROM email_jobs WHERE status='pending'");
    if (rows[0]?.s == null) break;
    const wait = Math.max(Number(rows[0].s), 0) * 1000 + 100;
    if (Date.now() + wait > deadline) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  return total;
}
