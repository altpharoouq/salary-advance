"use client";
import { useEffect, useRef } from "react";

export default function Modal({ title, open, onClose, wide, children }: { title: string; open: boolean; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`modal${wide ? " wide" : ""}`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal-head"><h2>{title}</h2><button className="secondary small" onClick={onClose}>Close</button></div>
      {open && children}
    </dialog>
  );
}
