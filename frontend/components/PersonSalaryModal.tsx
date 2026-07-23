"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import { money, monthName, todayISO } from "@/lib/format";
import type { Person, PersonSalary } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  person: Person;
  onClose: () => void;
  onSaved: () => void;
}

const now = new Date();

export default function PersonSalaryModal({ person, onClose, onSaved }: Props) {
  const toast = useToast();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<PersonSalary[]>([]);
  const [salary, setSalary] = useState("");
  const [advance, setAdvance] = useState("");
  const [paid, setPaid] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<PersonSalary[]>(`/api/persons/${person.id}/salaries`, { year })
      .then(setRecords).catch(() => setRecords([]));
  }, [person.id, year]);
  useEffect(load, [load]);

  useEffect(() => {
    const r = records.find((x) => x.month === month && x.year === year);
    if (r) {
      setSalary(String(r.salary_amount));
      setAdvance(String(r.advance_amount));
      setPaid(r.paid);
      setPayDate(r.pay_date ?? todayISO());
      setNote(r.note ?? "");
    } else {
      setSalary(person.monthly_salary ? String(person.monthly_salary) : "");
      setAdvance(""); setPaid(false);
      setPayDate(todayISO()); setNote("");
    }
  }, [records, month, year, person]);

  const sal = parseFloat(salary) || 0;
  const adv = parseFloat(advance) || 0;
  const net = sal - adv;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put<PersonSalary>("/api/persons/salaries", {
        person_id: person.id, year, month,
        salary_amount: sal, advance_amount: adv,
        paid, pay_date: payDate || null, note: note || null,
      });
      toast.success(`${monthName(month)} ${year} salary saved.`);
      load();
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save salary.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.delete(`/api/persons/salaries/${id}`);
      toast.success("Salary record deleted.");
      load();
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <Modal
      title={`Salary · ${person.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> Save {monthName(month)} salary</>}
          </button>
        </>
      }
    >
      <div className="row between wrap gap-8" style={{ marginBottom: 14 }}>
        <span className="badge badge-navy">{person.role || "Office staff"} · {person.department || "—"}</span>
        <span className="badge badge-gray">Monthly · base {COMPANY.currency} {money(person.monthly_salary)}</span>
      </div>

      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Month</label>
            <select className="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Year</label>
            <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Monthly salary ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0.00" />
            <span className="hint">Prefilled from profile. Adjust if needed. <span className="muted">· monthly</span></span>
          </div>
          <div className="field">
            <label>Advance ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0.00" />
            <span className="hint">Deducted from the salary total.</span>
          </div>
        </div>

        <div className="row between" style={{ background: "#f3f6fb", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <span className="small muted">Salary {money(sal)} − Adv {money(adv)}</span>
          <span className="strong">Net {COMPANY.currency} {money(net)}</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Status</label>
            <div className="segmented" style={{ width: "100%" }}>
              <button type="button" style={{ flex: 1 }} className={!paid ? "active" : ""} onClick={() => setPaid(false)}>Unpaid</button>
              <button type="button" style={{ flex: 1 }} className={paid ? "active" : ""} onClick={() => setPaid(true)}>Paid</button>
            </div>
          </div>
          <div className="field">
            <label>Pay date</label>
            <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any remark" />
        </div>
      </form>

      <div style={{ marginTop: 8 }}>
        <div className="strong small" style={{ marginBottom: 8 }}>{year} salary history</div>
        {records.length === 0 ? (
          <div className="tiny muted">No salary records for {year} yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Month</th><th className="num">Salary</th><th className="num">Advance</th><th className="num">Net</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => { setMonth(r.month); setYear(r.year); }}>
                    <td className="strong">{monthName(r.month)}</td>
                    <td className="num">{money(r.salary_amount)}</td>
                    <td className="num text-orange">{r.advance_amount ? `−${money(r.advance_amount)}` : "—"}</td>
                    <td className="num strong">{money(r.net_amount)}</td>
                    <td>{r.paid ? <span className="badge badge-green">Paid</span> : <span className="badge badge-amber">Unpaid</span>}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); remove(r.id); }}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
