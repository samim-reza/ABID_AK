"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money, sar, formatDate, accentFor, initials } from "@/lib/format";
import type { Page, Person, Salary } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import MonthYearFilter from "@/components/MonthYearFilter";
import SalaryForm, { PAY_TYPES } from "@/components/SalaryForm";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

export default function SalariesPage() {
  const toast = useToast();
  const [persons, setPersons] = useState<Person[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [data, setData] = useState<Page<Salary> | null>(null);
  const [personId, setPersonId] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Salary | null>(null);
  const [deleting, setDeleting] = useState<Salary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Page<Person>>("/api/persons", { page_size: 100 }).then((r) => setPersons(r.items));
    api.get<number[]>("/api/dashboard/periods").then(setYears).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<Salary>>("/api/salaries", { person_id: personId || undefined, month: month || undefined, year: year || undefined, page, page_size: 15 })
      .then(setData).finally(() => setLoading(false));
  }, [personId, month, year, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [personId, month, year]);

  const pageTotal = data?.items.reduce((s, x) => s + Number(x.amount), 0) ?? 0;

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/salaries/${deleting.id}`);
      toast.success("Salary record deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={ui.toolbar}>
        <div className="row gap-8 wrap">
          <select className="select" style={{ width: "auto" }} value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All employees</option>
            {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <MonthYearFilter month={month} year={year} years={years} onMonth={setMonth} onYear={setYear} />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Icon name="plus" size={17} /> Pay Salary
        </button>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : (
        <div className="card">
          {!data || data.items.length === 0 ? (
            <EmptyState title="No salary records" hint="Record a monthly salary to see it here." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Employee</th><th>Role</th><th>Type</th><th>Passport</th><th>Note</th><th className="num">Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td className="small muted">{formatDate(s.pay_date)}</td>
                      <td>
                        <div className="row gap-12">
                          <div className="avatar" style={{ background: accentFor(s.person_name || "?") }}>{initials(s.person_name || "?")}</div>
                          <span className="strong">{s.person_name}</span>
                        </div>
                      </td>
                      <td className="small">{s.role || <span className="muted">—</span>}</td>
                      <td><span className={`badge ${s.pay_type === "ot" ? "badge-amber" : s.pay_type === "adv" ? "badge-navy" : "badge-gray"}`}>{PAY_TYPES.find((t) => t.value === s.pay_type)?.label ?? "Salary"}</span></td>
                      <td><span className="badge badge-navy">{s.passport_number}</span></td>
                      <td className="small muted">{s.note || "—"}</td>
                      <td className="num strong">{sar(s.amount)}</td>
                      <td>
                        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(s)}><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="strong" style={{ textAlign: "right" }}>Total on this page</td>
                    <td className="num strong text-navy">{sar(pageTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
            </div>
          )}
        </div>
      )}

      {showForm && (
        <SalaryForm persons={persons} editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }} />
      )}
      {deleting && (
        <Confirm title="Delete salary"
          message={`Delete the ${sar(deleting.amount)} salary paid to ${deleting.person_name} (passport ${deleting.passport_number})?`}
          onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
