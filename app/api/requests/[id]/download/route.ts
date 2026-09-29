import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { present, SELECT_REQ } from "@/lib/workflow";

const naira = (n: number | null) => (n == null ? "-" : "NGN " + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const day = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "-");
const person = (v: string | null) => (v ? v.replace(/\s*<.*>/, "") : "-");

/** HR downloads the signed-off request as a PDF once the CEO has approved. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "HR") return NextResponse.json({ error: "Only HR can download this" }, { status: 403 });
  const { id } = await params;
  const pool = await db();
  const { rows } = await pool.query(`${SELECT_REQ} WHERE id=$1`, [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = present(rows[0]);
  if (r.ceo_status !== "Approved") return NextResponse.json({ error: "Not approved by the CEO yet" }, { status: 409 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.04, 0.04, 0.05), grey = rgb(0.36, 0.38, 0.43), line = rgb(0.87, 0.88, 0.9);
  let y = 790;
  const text = (t: string, x: number, size = 11, f = font, color = ink) => page.drawText(String(t), { x, y, size, font: f, color });
  const rule = () => { y -= 8; page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.7, color: line }); y -= 20; };
  const row = (k: string, v: string) => { text(k, 48, 10, font, grey); text(v, 200, 11); y -= 20; };

  text("Salary Advance Approval", 48, 22, bold); y -= 22;
  text(`Reference ${r.id}`, 48, 11, font, grey); y -= 4; rule();

  text("Employee", 48, 12, bold); y -= 22;
  row("Name", r.employee_name); row("Employee ID", r.employee_id); row("Department", r.department);
  row("Job title", r.job_title); row("Employment type", r.employment_type); row("Line manager", r.line_manager);
  rule();

  text("Approved terms", 48, 12, bold); y -= 22;
  row("Amount requested", naira(r.amount_requested)); row("Approved amount", naira(r.approved_amount));
  row("Repayment period", `${r.repayment_months} months`); row("Monthly deduction", naira(r.monthly_deduction));
  row("Deduction start", day(r.deduction_start_date)); row("Final deduction", day(r.final_deduction_date));
  rule();

  text("Approvals", 48, 12, bold); y -= 22;
  const approvals: [string, string, string, string][] = [
    ["HR", r.hr_reviewer, r.hr_decision_at, r.hr_comments],
    ["Global Head, HR", r.head_reviewer, r.head_decision_at, r.head_comments],
    ["CEO", r.ceo_approver, r.ceo_decision_at, r.ceo_comments],
  ];
  for (const [stage, by, at, note] of approvals) {
    text(stage, 48, 10, font, grey); text(`Approved by ${person(by)} on ${day(at)}`, 200, 11); y -= 16;
    if (note) { text(`"${String(note).slice(0, 80)}"`, 200, 9, font, grey); y -= 16; }
    y -= 4;
  }
  y = 60; text(`Generated ${new Date().toISOString().slice(0, 10)} from the Salary Advance tracker`, 48, 8, font, grey);

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="salary-advance-${r.id}.pdf"` },
  });
}
