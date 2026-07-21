"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import { money, todayISO } from "@/lib/format";
import type { Person, Salary } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  persons: Person[];
  editing?: Salary | null;
  onClose: () => void;
  onSaved: () => void;
}

export const PAY_TYPES = [
  { value: "salary", label: "Salary" },
  { value: "ot", label: "Overtime (OT)" },
  { value: "adv", label: "Advance (Adv)" },
];

export default function SalaryForm({ persons, editing, onClose, onSaved }: Props) {
  const toast = useToast();
  const [personId, setPersonId] = useState<number | "">(editing?.person_id ?? "");
  const [role, setRole] = useState(editing?.role ?? "");
  const [passport, setPassport] = useState(editing?.passport_number ?? "");
  const [payType, setPayType] = useState(editing?.pay_type ?? "salary");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [payDate, setPayDate] = useState(editing?.pay_date ?? todayISO());
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  // auto-fill role + passport from selected person (only when adding)
  useEffect(() => {
    if (editing || !personId) return;
    const p = persons.find((x) => x.id === personId);
    if (p) {
      setRole(p.role || "");
      if (p.passport_number) setPassport(p.passport_number);
    }
  }, [personId, persons, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    if (!personId || !passport.trim() || amt <= 0) {
      toast.error("Person, passport number and a valid amount are required.");
      return;
    }
    setSaving(true);
    const payload = { person_id: personId, role, passport_number: passport.trim(), pay_type: payType, amount: amt, pay_date: payDate, note: note || null };
    try {
      if (editing) await api.patch<Salary>(`/api/salaries/${editing.id}`, payload);
      else await api.post<Salary>("/api/salaries", payload);
      toast.success(editing ? "Salary updated." : "Salary recorded.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save salary.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Salary" : "Pay Salary"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> {editing ? "Save" : "Record salary"}</>}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Employee</label>
          <select className="select" value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")} required>
            <option value="">Select employee…</option>
            {persons.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ""}</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Role</label>
            <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role at time of payment" />
          </div>
          <div className="field">
            <label>Passport number</label>
            <input className="input" value={passport} onChange={(e) => setPassport(e.target.value)} placeholder="Which passport this salary is for" required />
            <span className="hint">Recorded as: this salary was paid for this passport.</span>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Payment type</label>
            <select className="select" value={payType} onChange={(e) => setPayType(e.target.value)}>
              {PAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Amount ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
        </div>
        <div className="field">
          <label>Payment date</label>
          <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. July 2026 salary" />
        </div>
        {amount && (
          <div className="row between" style={{ background: "#f3f6fb", borderRadius: 10, padding: "10px 14px" }}>
            <span className="small muted">{PAY_TYPES.find((t) => t.value === payType)?.label ?? "Salary"} · passport {passport || "—"}</span>
            <span className="strong">{COMPANY.currency} {money(parseFloat(amount) || 0)}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
