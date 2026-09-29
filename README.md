# Salary Advance Workflow

Next.js + Postgres. Employee form → HR → Finance → CEO → Payment → Repayment → Completed, with audit log.

## Run locally
    cp .env.example .env.local   # fill DATABASE_URL and AUTH_SECRET
    npm run dev

Tables are created automatically on first request. Staff (HR/Finance/CEO) are seeded in the `staff` table;
manage recipients with SQL (`INSERT INTO staff (email,name,role) ...`).
With no SMTP configured, emails and sign-in links print to the server console.

## Deploy (Vercel)
1. Create a free Postgres (Neon/Supabase), copy the connection string.
2. Import this folder to Vercel; set env vars: DATABASE_URL, AUTH_SECRET (`openssl rand -hex 32`),
   APP_URL (your Vercel URL), SMTP_* and MAIL_FROM.
