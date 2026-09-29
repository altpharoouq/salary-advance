import { z } from "zod";
import { DEPARTMENTS, EMPLOYMENT_TYPES, PERIODS, REASONS } from "./workflow";

const DOMAIN = (process.env.EMPLOYEE_EMAIL_DOMAIN || "autochek.africa").toLowerCase();

export const RequestBody = z.object({
  employee_email: z.string().trim().toLowerCase().email().refine((e) => e.endsWith("@" + DOMAIN), `Use your @${DOMAIN} email address`),
  employee_name: z.string().trim().min(2),
  employee_id: z.string().trim().min(1),
  department: z.enum(DEPARTMENTS),
  job_title: z.string().trim().min(1),
  line_manager: z.string().trim().min(1),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  amount_requested: z.coerce.number().positive().max(1_000_000_000),
  reason: z.enum(REASONS),
  reason_details: z.string().trim().min(3).max(2000),
  repayment_months: z.coerce.number().refine((n) => (PERIODS as readonly number[]).includes(n), "Choose 3–6 months"),
  has_existing_advance: z.boolean(),
  outstanding_advance: z.coerce.number().min(0).default(0),
  declaration: z.literal(true, { error: "You must accept the declaration" }),
});
export const errorText = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
