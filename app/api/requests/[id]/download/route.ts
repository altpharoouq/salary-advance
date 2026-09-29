import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb, LineCapStyle, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { present, SELECT_REQ } from "@/lib/workflow";

const C = {
  primary: rgb(0, 0.322, 1), ink: rgb(0.039, 0.043, 0.051), body: rgb(0.357, 0.38, 0.431), muted: rgb(0.486, 0.51, 0.541),
  hairline: rgb(0.871, 0.882, 0.902), soft: rgb(0.969, 0.969, 0.969), strong: rgb(0.933, 0.941, 0.953), up: rgb(0.02, 0.694, 0.412), white: rgb(1, 1, 1),
};
const day = (v: any) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");
const naira = (n: number | null) => (n == null ? "-" : "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const person = (v: string | null) => (v ? v.replace(/\s*<.*>/, "") : "-");
const asset = (p: string) => readFile(path.join(process.cwd(), p));

/** HR downloads the signed-off request as a PDF once the CEO has approved. Styled to match the app. */
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
  pdf.registerFontkit(fontkit);
  const [reg, med, semi, mono, logoBytes] = await Promise.all([
    asset("assets/fonts/Inter-Regular.otf"), asset("assets/fonts/Inter-Medium.otf"), asset("assets/fonts/Inter-SemiBold.otf"),
    asset("assets/fonts/GeistMono-Medium.ttf"), asset("public/logo.png"),
  ]);
  const F = { reg: await pdf.embedFont(reg), med: await pdf.embedFont(med), semi: await pdf.embedFont(semi), mono: await pdf.embedFont(mono) };
  const logo = await pdf.embedPng(logoBytes);

  const W = 595, H = 842, M = 44, CW = W - 2 * M;
  const page: PDFPage = pdf.addPage([W, H]);
  const Y = (top: number) => H - top; // work in top-down coordinates

  const text = (t: string, x: number, top: number, size: number, font: PDFFont, color = C.ink) =>
    page.drawText(t, { x, y: Y(top) - size * 0.8, size, font, color });
  const textRight = (t: string, xr: number, top: number, size: number, font: PDFFont, color = C.ink) =>
    text(t, xr - font.widthOfTextAtSize(t, size), top, size, font, color);
  const wrap = (t: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    let cur = "";
    for (const w of t.split(/\s+/)) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w; } else cur = next;
    }
    return cur ? [...out, cur] : out;
  };
  const rrect = (x: number, top: number, w: number, h: number, rad: number, fill?: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) => {
    const p = `M ${rad} 0 H ${w - rad} Q ${w} 0 ${w} ${rad} V ${h - rad} Q ${w} ${h} ${w - rad} ${h} H ${rad} Q 0 ${h} 0 ${h - rad} V ${rad} Q 0 0 ${rad} 0 Z`;
    page.drawSvgPath(p, { x, y: Y(top), color: fill, borderColor: border, borderWidth: border ? 0.8 : 0 });
  };
  const label = (t: string, x: number, top: number) => text(t.toUpperCase(), x, top, 7.5, F.semi, C.muted);

  // ── Header: logo + wordmark, status pill
  page.drawImage(logo, { x: M, y: Y(44 + 32), width: 32, height: 32 });
  text("Salary Advance", M + 42, 52, 12, F.semi);
  const pill = "Fully approved", pw = F.semi.widthOfTextAtSize(pill, 9) + 28;
  rrect(W - M - pw, 50, pw, 22, 11, C.strong);
  page.drawCircle({ x: W - M - pw + 12, y: Y(61), size: 2.6, color: C.up });
  text(pill, W - M - pw + 20, 56.5, 9, F.semi, C.ink);
  page.drawLine({ start: { x: M, y: Y(92) }, end: { x: W - M, y: Y(92) }, thickness: 0.8, color: C.hairline });

  // ── Title block
  label("Salary advance approval", M, 116);
  text(r.employee_name, M, 132, 28, F.reg);
  text(r.id, M, 172, 9, F.mono, C.body);
  const idw = F.mono.widthOfTextAtSize(r.id, 9);
  text(`·   ${r.department}   ·   Approved ${day(r.ceo_decision_at)}`, M + idw + 8, 172, 9.5, F.reg, C.muted);

  // ── Summary card: the four numbers that matter
  let top = 202;
  rrect(M, top, CW, 84, 14, C.white, C.hairline);
  const cols = [
    ["Approved amount", naira(r.approved_amount), true],
    ["Monthly deduction", naira(r.monthly_deduction), true],
    ["Deduction starts", day(r.deduction_start_date), false],
    ["Repayment period", `${r.repayment_months} months`, false],
  ] as const;
  const cw = (CW - 40) / 4;
  cols.forEach(([k, v, isNum], i) => {
    const x = M + 20 + i * cw;
    label(k, x, top + 20);
    if (isNum && v.startsWith("₦")) {
      // Geist Mono has no naira glyph, so draw the symbol in Inter and the digits in mono.
      text("₦", x, top + 38, 15, F.med);
      text(v.slice(1), x + F.med.widthOfTextAtSize("₦", 15) + 1, top + 38, 15, F.mono);
    } else text(v, x, top + 38, isNum ? 15 : 12.5, isNum ? F.mono : F.med);
  });
  text(`Requested ${naira(r.amount_requested)}   ·   Final deduction ${day(r.final_deduction_date)}`, M + 20, top + 64, 8.5, F.reg, C.muted);

  // ── Request card
  top += 84 + 16;
  const kv: [string, string][] = [
    ["Employee ID", r.employee_id], ["Work email", r.employee_email],
    ["Job title", r.job_title], ["Line manager", r.line_manager],
    ["Employment type", r.employment_type], ["Existing advance", naira(r.outstanding_advance)],
  ];
  const reasonLines = wrap(r.reason_details, F.reg, 10, CW - 40).slice(0, 4);
  const reqH = 52 + Math.ceil(kv.length / 2) * 38 + 16 + 14 + reasonLines.length * 14 + 14;
  rrect(M, top, CW, reqH, 14, C.white, C.hairline);
  text("Request", M + 20, top + 18, 11, F.semi);
  kv.forEach(([k, v], i) => {
    const x = M + 20 + (i % 2) * (CW / 2), t = top + 46 + Math.floor(i / 2) * 38;
    label(k, x, t);
    text(v.length > 36 ? v.slice(0, 35) + "…" : v, x, t + 12, 10.5, F.med);
  });
  const rTop = top + 46 + Math.ceil(kv.length / 2) * 38 + 2;
  page.drawLine({ start: { x: M + 20, y: Y(rTop) }, end: { x: W - M - 20, y: Y(rTop) }, thickness: 0.8, color: C.strong });
  label(`Reason · ${r.reason}`, M + 20, rTop + 14);
  reasonLines.forEach((l, i) => text(l, M + 20, rTop + 28 + i * 14, 10, F.reg, C.body));

  // ── Approvals timeline
  top += reqH + 16;
  const steps = [
    { t: "HR", by: r.hr_reviewer, at: r.hr_decision_at, note: r.hr_comments },
    { t: "Global Head, HR", by: r.head_reviewer, at: r.head_decision_at, note: r.head_comments },
    { t: "CEO", by: r.ceo_approver, at: r.ceo_decision_at, note: r.ceo_comments },
  ];
  const noteLines = steps.map((s) => (s.note ? wrap(String(s.note), F.reg, 9.5, CW - 40 - 44).slice(0, 2) : []));
  const rowH = (i: number) => 40 + (noteLines[i].length ? noteLines[i].length * 13 + 10 : 0);
  const apH = 46 + steps.reduce((a, _, i) => a + rowH(i), 0) + 6;
  rrect(M, top, CW, apH, 14, C.white, C.hairline);
  text("Approvals", M + 20, top + 18, 11, F.semi);
  let ty = top + 46;
  steps.forEach((s, i) => {
    const cx = M + 20 + 9, cy = ty + 9;
    if (i < steps.length - 1) page.drawLine({ start: { x: cx, y: Y(cy + 9) }, end: { x: cx, y: Y(ty + rowH(i)) }, thickness: 1.6, color: C.primary });
    page.drawCircle({ x: cx, y: Y(cy), size: 9, color: C.primary });
    page.drawLine({ start: { x: cx - 3.6, y: Y(cy + 0.3) }, end: { x: cx - 1, y: Y(cy + 3) }, thickness: 1.4, color: C.white, lineCap: LineCapStyle.Round });
    page.drawLine({ start: { x: cx - 1, y: Y(cy + 3) }, end: { x: cx + 3.8, y: Y(cy - 2.6) }, thickness: 1.4, color: C.white, lineCap: LineCapStyle.Round });
    text(s.t, M + 52, ty + 1, 10.5, F.semi);
    text(`Approved by ${person(s.by)}  ·  ${day(s.at)}`, M + 52, ty + 16, 9, F.reg, C.muted);
    if (noteLines[i].length) {
      const nh = noteLines[i].length * 13 + 6;
      page.drawRectangle({ x: M + 52, y: Y(ty + 30 + nh), width: 2, height: nh, color: C.hairline });
      noteLines[i].forEach((l, j) => text(l, M + 62, ty + 32 + j * 13, 9.5, F.reg, C.body));
    }
    ty += rowH(i);
  });

  // ── Footer
  page.drawLine({ start: { x: M, y: Y(H - 56) }, end: { x: W - M, y: Y(H - 56) }, thickness: 0.8, color: C.hairline });
  text(`Generated ${day(new Date())} from the Salary Advance tracker`, M, H - 44, 8, F.reg, C.muted);
  textRight("Autochek", W - M, H - 44, 8, F.semi, C.body);

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="salary-advance-${r.id}.pdf"` },
  });
}
