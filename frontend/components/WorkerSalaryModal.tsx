"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import { money, monthName, todayISO } from "@/lib/format";
import {
  calcOvertimeAmount,
  defaultBasic,
  overtimeHourlyRate,
  overtimeHoursFromAmount,
} from "@/lib/payroll";
import type { Worker, WorkerSalary } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  worker: Worker;
  onClose: () => void;
  onSaved: () => void;
}

const now = new Date();

export default function WorkerSalaryModal({ worker, onClose, onSaved }: Props) {
  const toast = useToast();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<WorkerSalary[]>([]);
  const [basic, setBasic] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [advance, setAdvance] = useState("");
  const [hours, setHours] = useState("");
  const [paid, setPaid] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<WorkerSalary[]>(`/api/workers/${worker.id}/salaries`, { year })
      .then(setRecords).catch(() => setRecords([]));
  }, [worker.id, year]);
  useEffect(load, [load]);

  // prefill the form from an existing record for the chosen month, else defaults
  useEffect(() => {
    const r = records.find((x) => x.month === month && x.year === year);
    if (r) {
      setBasic(String(r.basic_amount));
      const otH = r.overtime_hours ?? overtimeHoursFromAmount(worker.pay_type, worker.base_rate, r.overtime_amount);
      setOvertimeHours(otH != null ? String(otH) : "");
      setAdvance(String(r.advance_amount));
      setHours(r.hours != null ? String(r.hours) : "");
      setPaid(r.paid);
      setPayDate(r.pay_date ?? todayISO());
      setNote(r.note ?? "");
    } else {
      const suggested = defaultBasic(worker.pay_type, worker.base_rate);
      setBasic(suggested ? String(suggested) : "");
      setOvertimeHours(""); setAdvance(""); setHours(""); setPaid(false);
      setPayDate(todayISO()); setNote("");
    }
  }, [records, month, year, worker]);

  const b = parseFloat(basic) || 0;
  const otH = parseFloat(overtimeHours) || 0;
  const ot = calcOvertimeAmount(worker.pay_type, worker.base_rate, otH);
  const adv = parseFloat(advance) || 0;
  const net = b + ot - adv;
  const otRate = overtimeHourlyRate(worker.pay_type, worker.base_rate);
  const payLabel = worker.pay_type === "hourly" ? "hourly" : "monthly";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put<WorkerSalary>("/api/workers/salaries", {
        worker_id: worker.id, year, month,
        basic_amount: b,
        overtime_hours: overtimeHours ? otH : null,
        advance_amount: adv,
        hours: hours ? parseFloat(hours) : null,
        paid, pay_date: payDate || null, note: note || null,
      });
      toast.success(`${monthName(month)} ${year} pay saved.`);
      load();
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save pay record.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.delete(`/api/workers/salaries/${id}`);
      toast.success("Pay record deleted.");
      load();
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <Modal
      title={`Payments · ${worker.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> Save {monthName(month)} pay</>}
          </button>
        </>
      }
    >
      <div className="row between wrap gap-8" style={{ marginBottom: 14 }}>
        <span className="badge badge-navy">{worker.company_name} · {worker.project_name}</span>
        <span className="badge badge-gray">{worker.pay_type === "hourly" ? "Per hour" : "Monthly"} · base {COMPANY.currency} {money(worker.base_rate)}</span>
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
            <label>Basic amount ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="0.00" />
            <span className="hint">
              {worker.pay_type === "hourly"
                ? `Default: ${COMPANY.currency} ${money(worker.base_rate)}/hr × 260. Adjust if needed.`
                : `Default monthly salary. Adjust if needed.`}
              <span className="muted"> · {payLabel}</span>
            </span>
          </div>
          <div className="field">
            <label>Overtime (hours)</label>
            <input className="input" type="number" step="0.1" min="0" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} placeholder="0" />
            {otH > 0 && (
              <span className="hint">
                = {COMPANY.currency} {money(ot)} at {COMPANY.currency} {money(otRate)}/hr
                {worker.pay_type === "monthly" && <span className="muted"> (salary ÷ 260)</span>}
              </span>
            )}
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Advance ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0.00" />
            <span className="hint">Deducted from the salary total.</span>
          </div>
          <div className="field">
            <label>Hours worked (optional)</label>
            <input className="input" type="number" step="0.1" min="0" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 260" />
          </div>
        </div>

        <div className="row between" style={{ background: "#f3f6fb", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <span className="small muted">Basic {money(b)} + OT {money(ot)} − Adv {money(adv)}</span>
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
        <div className="strong small" style={{ marginBottom: 8 }}>{year} pay history</div>
        {records.length === 0 ? (
          <div className="tiny muted">No pay records for {year} yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Month</th><th className="num">Basic</th><th className="num">OT hrs</th><th className="num">OT</th><th className="num">Advance</th><th className="num">Net</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const h = r.overtime_hours ?? overtimeHoursFromAmount(worker.pay_type, worker.base_rate, r.overtime_amount);
                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => { setMonth(r.month); setYear(r.year); }}>
                      <td className="strong">{monthName(r.month)}</td>
                      <td className="num">{money(r.basic_amount)}</td>
                      <td className="num">{h != null ? h : "—"}</td>
                      <td className="num">{money(r.overtime_amount)}</td>
                      <td className="num text-orange">{r.advance_amount ? `−${money(r.advance_amount)}` : "—"}</td>
                      <td className="num strong">{money(r.net_amount)}</td>
                      <td>{r.paid ? <span className="badge badge-green">Paid</span> : <span className="badge badge-amber">Unpaid</span>}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); remove(r.id); }}><Icon name="trash" size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
