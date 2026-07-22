"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { accentFor, initials, money, monthName } from "@/lib/format";
import { COMPANY } from "@/lib/brand";
import type { Company, PayrollRow, Worker } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import WorkerSalaryModal from "@/components/WorkerSalaryModal";
import Icon from "@/components/Icons";
import ui from "@/components/ui.module.css";

const now = new Date();

// build a Worker-shaped object for the payment modal from a payroll row
function toWorker(r: PayrollRow): Worker {
  return {
    id: r.worker_id, name: r.name, nationality: r.nationality,
    passport_number: null, iqama_number: null, iqama_expiry: null, phone: null,
    company_id: 0, project_id: 0, pay_type: r.pay_type, base_rate: r.base_rate,
    note: null, is_released: r.is_released, released_at: null,
    company_name: r.company_name, project_name: r.project_name,
  };
}

export default function PayrollPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<Worker | null>(null);

  const projects = useMemo(
    () => companies.find((c) => c.id === companyId)?.projects ?? [],
    [companies, companyId]
  );

  useEffect(() => {
    api.get<Company[]>("/api/workers/companies").then(setCompanies).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get<PayrollRow[]>("/api/workers/payroll", {
      year, month, company_id: companyId || undefined, project_id: projectId || undefined,
    }).then(setRows).finally(() => setLoading(false));
  }, [year, month, companyId, projectId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (projectId && !projects.some((p) => p.id === projectId)) setProjectId("");
  }, [projects, projectId]);

  const totals = rows.reduce(
    (a, r) => {
      const net = r.has_record ? r.net_amount : r.suggested_basic;
      return {
        net: a.net + net,
        paid: a.paid + (r.paid ? r.net_amount : 0),
        unpaid: a.unpaid + (!r.paid ? net : 0),
        advance: a.advance + r.advance_amount,
      };
    },
    { net: 0, paid: 0, unpaid: 0, advance: 0 }
  );
  const paidCount = rows.filter((r) => r.paid).length;
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <>
      <div className={ui.toolbar}>
        <div className="row gap-8 wrap">
          <select className="select" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")} disabled={!companyId}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className={ui.statGrid} style={{ marginBottom: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className={ui.stat}><div className={ui.label}>Net Payroll</div><div className={ui.value}><span className="cur">SAR</span>{money(totals.net)}</div></div>
        <div className={ui.stat}><div className={ui.label}>Paid</div><div className={ui.value} style={{ color: "var(--green)" }}><span className="cur">SAR</span>{money(totals.paid)}</div><div className={ui.foot}>{paidCount} of {rows.length} workers</div></div>
        <div className={ui.stat}><div className={ui.label}>Unpaid</div><div className={ui.value} style={{ color: "var(--red)" }}><span className="cur">SAR</span>{money(totals.unpaid)}</div></div>
        <div className={ui.stat}><div className={ui.label}>Advances</div><div className={ui.value} style={{ color: "var(--orange)" }}><span className="cur">SAR</span>{money(totals.advance)}</div></div>
      </div>

      {loading && rows.length === 0 ? (
        <PageLoader />
      ) : (
        <div className="card">
          {rows.length === 0 ? (
            <EmptyState title="No active workers" hint="Add workers, then record their monthly pay here." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Worker</th><th>Company / Project</th>
                    <th className="num">Basic</th><th className="num">OT</th><th className="num">Advance</th><th className="num">Net</th>
                    <th>{monthName(month)} {year}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.worker_id}>
                      <td>
                        <div className="row gap-12">
                          <div className="avatar" style={{ background: accentFor(r.name) }}>{initials(r.name)}</div>
                          <div>
                            <div className="strong">{r.name}</div>
                            <div className="tiny muted">{r.nationality || "—"} · {r.pay_type === "hourly" ? "per hour" : "monthly"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="small">
                        <div className="strong">{r.company_name}</div>
                        <div className="tiny muted">{r.project_name}</div>
                      </td>
                      <td className="num">
                        {money(r.has_record ? r.basic_amount : r.suggested_basic)}
                        <div className="tiny muted">{r.pay_type === "hourly" ? "hourly × 260" : "monthly"}</div>
                      </td>
                      <td className="num">
                        {r.has_record ? (
                          <>
                            {money(r.overtime_amount)}
                            {r.overtime_hours != null && r.overtime_hours > 0 && (
                              <div className="tiny muted">{r.overtime_hours}h</div>
                            )}
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="num text-orange">{r.advance_amount ? `−${money(r.advance_amount)}` : <span className="muted">—</span>}</td>
                      <td className="num strong">
                        {r.has_record
                          ? money(r.net_amount)
                          : <span className="muted">{money(r.suggested_basic)}</span>}
                      </td>
                      <td>
                        {!r.has_record
                          ? <span className="badge badge-gray">No record</span>
                          : r.paid
                          ? <span className="badge badge-green">Paid</span>
                          : <span className="badge badge-amber">Unpaid</span>}
                      </td>
                      <td>
                        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setPaying(toWorker(r))}>
                            <Icon name="wallet" size={15} /> {r.has_record ? "Edit pay" : "Record pay"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="strong" style={{ textAlign: "right" }}>Net payroll ({monthName(month)} {year})</td>
                    <td className="num strong text-navy">{money(totals.net)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {paying && (
        <WorkerSalaryModal worker={paying} onClose={() => setPaying(null)} onSaved={load} />
      )}
    </>
  );
}
