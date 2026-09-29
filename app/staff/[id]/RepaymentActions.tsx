"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { RemoveRepayment, RepaymentForm } from "./RepaymentForm";

type Rep = { id: number; amount: number; paid_on: string; note: string | null; recorded_by: string };
const money = (n: number) => <span className="num"><span className="cur">₦</span>{n.toLocaleString()}</span>;
const fmt = (v: string) => new Date(v).toLocaleDateString();

type Inst = { n: number; due: string; amount: number; paid: number; status: string };

export default function RepaymentActions({ id, canRecord, canRemove, suggested, outstanding, repayments, schedule }: {
  schedule: Inst[]; id: string; canRecord: boolean; canRemove: boolean; suggested: number | null; outstanding: number; repayments: Rep[];
}) {
  const [modal, setModal] = useState<"record" | "list" | "schedule" | null>(null);
  const close = () => setModal(null);
  return (
    <>
      <div className="btnrow" style={{ marginTop: "auto", paddingTop: 20 }}>
        {canRecord && <button onClick={() => setModal("record")}>Record repayment</button>}
        <button className="secondary" onClick={() => setModal("schedule")}>Schedule</button>
        <button className="secondary" onClick={() => setModal("list")}>Recorded repayments ({repayments.length})</button>
      </div>

      <Modal title="Record a repayment" open={modal === "record"} onClose={close}>
        <RepaymentForm id={id} suggested={suggested} outstanding={outstanding} onDone={close} />
      </Modal>

      <Modal title="Repayment schedule" wide open={modal === "schedule"} onClose={close}>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Due</th><th>Expected</th><th>Repaid</th><th>Status</th></tr></thead>
          <tbody>{schedule.map((i) => (
            <tr key={i.n}><td><span className="num">{i.n}</span></td><td><span className="num">{i.due}</span></td><td>{money(i.amount)}</td><td>{money(i.paid)}</td>
              <td><span className={`badge ${i.status}`}>{i.status}</span></td></tr>))}</tbody>
        </table></div>
      </Modal>

      <Modal title="Recorded repayments" wide open={modal === "list"} onClose={close}>
        {repayments.length ? (
          <div className="tablewrap"><table>
            <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th>By</th>{canRemove && <th></th>}</tr></thead>
            <tbody>{repayments.map((p) => (
              <tr key={p.id}><td>{fmt(p.paid_on)}</td><td>{money(Number(p.amount))}</td><td>{p.note}</td><td>{p.recorded_by}</td>
                {canRemove && <td><RemoveRepayment id={id} rid={p.id} /></td>}</tr>))}</tbody>
          </table></div>
        ) : <p>Nothing recorded yet.</p>}
      </Modal>
    </>
  );
}
