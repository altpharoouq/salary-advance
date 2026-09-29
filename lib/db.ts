import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _schemaReady: Promise<void> | undefined;
}

function pool() {
  if (!global._pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    global._pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return global._pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  employee_email TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  department TEXT NOT NULL,
  job_title TEXT NOT NULL,
  line_manager TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  amount_requested NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  reason_details TEXT NOT NULL DEFAULT '',
  outstanding_advance NUMERIC(14,2) NOT NULL DEFAULT 0,
  repayment_months INT NOT NULL,

  hr_status TEXT NOT NULL DEFAULT 'Pending',
  hr_reviewer TEXT, hr_comments TEXT, hr_decision_at TIMESTAMPTZ,
  head_status TEXT NOT NULL DEFAULT 'Pending',
  head_reviewer TEXT, head_comments TEXT, head_decision_at TIMESTAMPTZ,
  ceo_status TEXT NOT NULL DEFAULT 'Pending',
  ceo_approver TEXT, ceo_comments TEXT, ceo_decision_at TIMESTAMPTZ,

  approved_amount NUMERIC(14,2),
  deduction_start_date DATE,
  eligibility TEXT NOT NULL DEFAULT 'Pending',
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  payment_date DATE,
  overall_status TEXT NOT NULL DEFAULT 'HR Review',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(overall_status);
CREATE INDEX IF NOT EXISTS requests_emp_idx ON requests(employee_id);

CREATE TABLE IF NOT EXISTS repayments (
  id SERIAL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL,
  note TEXT,
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id BIGSERIAL PRIMARY KEY,
  template TEXT NOT NULL,
  variables JSONB,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_jobs_due ON email_jobs(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL,
  detail TEXT
);

-- Migrations for databases created before send-back / Global Head existed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='finance_status') THEN
    ALTER TABLE requests RENAME COLUMN finance_status TO head_status;
    ALTER TABLE requests RENAME COLUMN finance_reviewer TO head_reviewer;
    ALTER TABLE requests RENAME COLUMN finance_comments TO head_comments;
    ALTER TABLE requests RENAME COLUMN finance_decision_at TO head_decision_at;
  END IF;
END $$;
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS returned_by TEXT,
  ADD COLUMN IF NOT EXISTS returned_to TEXT,
  ADD COLUMN IF NOT EXISTS returned_note TEXT,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0;
UPDATE requests SET overall_status='Global Head Review' WHERE overall_status='Finance Review';
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('HR','GLOBAL_HEAD','FINANCE','CEO'));

INSERT INTO staff (email, name, role) VALUES
  ('abiola.o@autochek.africa', 'Abiola O.', 'HR'),
  ('olowonefa.v@autochek.africa', 'Victoria O.', 'GLOBAL_HEAD'),
  ('uzoamaka.u@autochek.africa', 'Uzoamaka U.', 'FINANCE'),
  ('mayokun@autochek.africa', 'Mayokun', 'CEO')
ON CONFLICT (email) DO NOTHING;
UPDATE staff SET role='GLOBAL_HEAD', name='Victoria O.' WHERE email='olowonefa.v@autochek.africa' AND role='HR';
`;

export async function db() {
  if (!global._schemaReady) {
    global._schemaReady = pool().query(SCHEMA).then(() => undefined);
    global._schemaReady.catch(() => (global._schemaReady = undefined));
  }
  await global._schemaReady;
  return pool();
}
