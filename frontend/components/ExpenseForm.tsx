"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import { money, todayISO } from "@/lib/format";
import type { Expense, Person } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import BarcodeScanner from "./BarcodeScanner";
import { useToast } from "./Toast";

interface Props {
  persons: Person[];
  categories: string[];
  editing?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

const QUICK = ["Food", "Car", "Fuel", "Oil", "Transport", "Tools", "Accommodation", "Materials", "Medical", "Other"];

export default function ExpenseForm({ persons, categories, editing, onClose, onSaved }: Props) {
  const toast = useToast();
  const [personId, setPersonId] = useState<number | "">(editing?.person_id ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : "");
  const [vat, setVat] = useState(editing?.vat_applied ?? false);
  const [barcode, setBarcode] = useState(editing?.barcode ?? "");
  const [date, setDate] = useState(editing?.expense_date ?? todayISO());
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const amt = parseFloat(amount) || 0;
  const vatAmount = vat ? amt * COMPANY.vatRate : 0;
  const total = amt + vatAmount;

  const catOptions = useMemo(() => {
    const set = new Set<string>([...QUICK, ...categories]);
    return Array.from(set);
  }, [categories]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId || !category.trim() || amt <= 0) {
      toast.error("Choose a person, a category and a valid amount.");
      return;
    }
    setSaving(true);
    const payload = {
      person_id: personId, category: category.trim(), reason, barcode: barcode || null,
      amount: amt, vat_applied: vat, expense_date: date,
    };
    try {
      if (editing) await api.patch<Expense>(`/api/expenses/${editing.id}`, payload);
      else await api.post<Expense>("/api/expenses", payload);
      toast.success(editing ? "Expense updated." : "Expense added.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Expense" : "Add Expense"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="submit">
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> {editing ? "Save changes" : "Add expense"}</>}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Person</label>
            <select className="select" value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")} required>
              <option value="">Select person…</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label>Category / Section</label>
          <input className="input" list="cat-list" value={category} placeholder="e.g. Food, Car, Fuel"
            onChange={(e) => setCategory(e.target.value)} required />
          <datalist id="cat-list">
            {catOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="field">
          <label>Reason / Note</label>
          <input className="input" value={reason} placeholder="What was it for?" onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Amount ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={amount}
              placeholder="0.00" onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Barcode (optional)</label>
            <div className="row gap-8">
              <input className="input grow" value={barcode} placeholder="Scan or type"
                onChange={(e) => setBarcode(e.target.value)} />
              <button type="button" className="btn btn-navy" onClick={() => setScanning(true)} title="Scan barcode">
                <Icon name="camera" size={17} />
              </button>
            </div>
          </div>
        </div>

        {/* VAT toggle */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginTop: 4 }}>
          <div className="row between">
            <div>
              <div className="strong small">Apply VAT (15%)</div>
              <div className="tiny muted">Saudi Arabia standard rate</div>
            </div>
            <div className="segmented">
              <button type="button" className={!vat ? "active" : ""} onClick={() => setVat(false)}>No VAT</button>
              <button type="button" className={vat ? "active" : ""} onClick={() => setVat(true)}>+ 15% VAT</button>
            </div>
          </div>
          <div className="row between" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
            <span className="small muted">Base {money(amt)}</span>
            <span className="small muted">VAT <span className={vat ? "text-orange strong" : ""}>{money(vatAmount)}</span></span>
            <span className="strong">Total {COMPANY.currency} {money(total)}</span>
          </div>
        </div>
      </form>

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onDetected={(code) => { setBarcode(code); setScanning(false); toast.success("Barcode captured."); }}
        />
      )}
    </Modal>
  );
}
