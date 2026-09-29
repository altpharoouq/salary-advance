# Salary Advance Workflow

Next.js + Postgres. Employee form → HR → Finance → CEO → Payment → Repayment → Completed, with audit log.

## Run locally
    cp .env.example .env.local   # fill DATABASE_URL and AUTH_SECRET
    npm run dev

Tables are created automatically on first request. Staff (HR/Finance/CEO) are seeded in the `staff` table;
manage recipients with SQL (`INSERT INTO staff (email,name,role) ...`).
Emails are sent through the template-mgt service (login + `templates/send`) from a small job queue in the same database (`email_jobs`): each email is queued with the action that caused it, sent in the background, and retried with backoff (5 attempts). Local runs send real emails through staging.

## Deploy (Vercel)
1. Create a free Postgres (Neon/Supabase), copy the connection string.
2. Import this folder to Vercel; set env vars: DATABASE_URL, AUTH_SECRET (`openssl rand -hex 32`),
   APP_BASE_URL (your Vercel URL), AUTH_LOGIN_URL, TEMPLATE_API_USERNAME, TEMPLATE_API_PASSWORD, TEMPLATE_API_BASE_URL and CRON_SECRET (see `.env.example`).
