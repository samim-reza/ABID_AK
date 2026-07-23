"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { accentFor, formatDate, initials, isExpired, isExpiringSoon, money, monthName } from "@/lib/format";
import type { Page, Person, PersonPayrollRow } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import PersonForm from "@/components/PersonForm";
import PersonSalaryModal from "@/components/PersonSalaryModal";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

type Loc = "" | "inside" | "outside";
type Tab = "team" | "payroll";

const now = new Date();

export default function OfficeStaffPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("team");
  const [data, setData] = useState<Page<Person> | null>(null);
  const [payroll, setPayroll] = useState<PersonPayrollRow[]>([]);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState<Loc>("");
  const [iqamaStatus, setIqamaStatus] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [paying, setPaying] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<Person>>("/api/persons", {
      q: q || undefined, location: location || undefined,
      iqama_status: iqamaStatus || undefined, page, page_size: 15,
    }).then(setData).finally(() => setLoading(false));
  }, [q, location, iqamaStatus, page]);

  const loadPayroll = useCallback(() => {
    setPayrollLoading(true);
    api.get<PersonPayrollRow[]>("/api/persons/payroll", {
      year, month, location: location || undefined,
    }).then(setPayroll).finally(() => setPayrollLoading(false));
  }, [year, month, location]);

  useEffect(load, [load]);
  useEffect(() => { if (tab === "payroll") loadPayroll(); }, [tab, loadPayroll]);
  useEffect(() => setPage(1), [q, location, iqamaStatus]);

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/persons/${deleting.id}`);
      toast.success("Staff member removed.");
      setDeleting(null);
      load();
      if (tab === "payroll") loadPayroll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const payrollTotals = payroll.reduce(
    (a, r) => {
      const net = r.has_record ? r.net_amount : r.suggested_salary;
      return {
        net: a.net + net,
        paid: a.paid + (r.paid ? r.net_amount : 0),
        unpaid: a.unpaid + (!r.paid ? net : 0),
        advance: a.advance + r.advance_amount,
      };
    },
    { net: 0, paid: 0, unpaid: 0, advance: 0 }
  );
  const paidCount = payroll.filter((r) => r.paid).length;

  function toPerson(r: PersonPayrollRow): Person {
    return {
      id: r.person_id, name: r.name, role: r.role, department: r.department,
      passport_number: null, iqama_number: null, iqama_expiry: null,
      phone: null, email: null, location: r.location,
      monthly_salary: r.monthly_salary, is_active: r.is_active,
    };
  }

  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented">
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team</button>
          <button className={tab === "payroll" ? "active" : ""} onClick={() => setTab("payroll")}>Payroll</button>
        </div>
        <div className="row gap-8 wrap">
          {tab === "payroll" && (
            <>
              <select className="select" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
              </select>
              <select className="select" style={{ width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
          <div className="segmented">
            <button className={location === "" ? "active" : ""} onClick={() => setLocation("")}>All</button>
            <button className={location === "inside" ? "active" : ""} onClick={() => setLocation("inside")}>Inside</button>
            <button className={location === "outside" ? "active" : ""} onClick={() => setLocation("outside")}>Outside</button>
          </div>
          {tab === "team" && (
            <>
              <select className="select" style={{ width: "auto" }} value={iqamaStatus} onChange={(e) => setIqamaStatus(e.target.value)}>
                <option value="">All iqama</option>
                <option value="expired">Iqama expired</option>
                <option value="expiring">Expiring soon (30d)</option>
                <option value="valid">Iqama valid</option>
              </select>
              <div className={ui.searchBox}>
                <Icon name="search" size={17} />
                <input className="input" placeholder="Search name, passport, iqama, email…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="plus" size={17} /> Add Staff
          </button>
        </div>
      </div>

      {tab === "team" ? (
        loading && !data ? (
          <PageLoader />
        ) : (
          <div className="card">
            {!data || data.items.length === 0 ? (
              <EmptyState title="No office staff yet" hint="Add your first office-staff member to get started." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Name</th><th>Role</th><th>Department</th><th>Location</th><th className="num">Salary</th><th>Iqama</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => {
                      const expired = isExpired(p.iqama_expiry);
                      return (
                        <tr key={p.id} className={expired ? "danger" : ""}>
                          <td>
                            <div className="row gap-12">
                              <div className="avatar" style={{ background: accentFor(p.name) }}>{initials(p.name)}</div>
                              <span className="strong">{p.name}</span>
                            </div>
                          </td>
                          <td className="small">{p.role || <span className="muted">—</span>}</td>
                          <td className="small muted">{p.department || "—"}</td>
                          <td>
                            <span className={`badge ${p.location === "outside" ? "badge-amber" : "badge-navy"}`}>
                              {p.location === "outside" ? "Outside" : "Inside"}
                            </span>
                          </td>
                          <td className="num small">
                            {money(p.monthly_salary)}
                            <div className="tiny muted">/ month</div>
                          </td>
                          <td className="small">
                            {p.iqama_number || <span className="muted">—</span>}
                            {p.iqama_expiry && (
                              <div className="tiny">
                                {expired
                                  ? <span className="badge badge-red">Expired {formatDate(p.iqama_expiry)}</span>
                                  : isExpiringSoon(p.iqama_expiry)
                                  ? <span className="badge badge-amber">Expires {formatDate(p.iqama_expiry)}</span>
                                  : <span className="muted">exp {formatDate(p.iqama_expiry)}</span>}
                              </div>
                            )}
                          </td>
                          <td>{p.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                          <td>
                            <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" title="Salary" onClick={() => setPaying(p)}><Icon name="wallet" size={15} /></button>
                              <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditing(p); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                              <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setDeleting(p)}><Icon name="trash" size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
              </div>
            )}
          </div>
        )
      ) : (
        <>
          <div className={ui.statGrid} style={{ marginBottom: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className={ui.stat}><div className={ui.label}>Net Payroll</div><div className={ui.value}><span className="cur">SAR</span>{money(payrollTotals.net)}</div></div>
            <div className={ui.stat}><div className={ui.label}>Paid</div><div className={ui.value} style={{ color: "var(--green)" }}><span className="cur">SAR</span>{money(payrollTotals.paid)}</div><div className={ui.foot}>{paidCount} of {payroll.length} staff</div></div>
            <div className={ui.stat}><div className={ui.label}>Unpaid</div><div className={ui.value} style={{ color: "var(--red)" }}><span className="cur">SAR</span>{money(payrollTotals.unpaid)}</div></div>
            <div className={ui.stat}><div className={ui.label}>Advances</div><div className={ui.value} style={{ color: "var(--orange)" }}><span className="cur">SAR</span>{money(payrollTotals.advance)}</div></div>
          </div>

          {payrollLoading && payroll.length === 0 ? (
            <PageLoader />
          ) : (
            <div className="card">
              {payroll.length === 0 ? (
                <EmptyState title="No active staff" hint="Add office staff with a monthly salary, then record pay here." />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Staff</th><th>Department</th>
                        <th className="num">Salary</th><th className="num">Advance</th><th className="num">Net</th>
                        <th>{monthName(month)} {year}</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payroll.map((r) => (
                        <tr key={r.person_id}>
                          <td>
                            <div className="row gap-12">
                              <div className="avatar" style={{ background: accentFor(r.name) }}>{initials(r.name)}</div>
                              <div>
                                <div className="strong">{r.name}</div>
                                <div className="tiny muted">{r.role || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="small muted">{r.department || "—"}</td>
                          <td className="num">
                            {money(r.has_record ? r.salary_amount : r.suggested_salary)}
                            <div className="tiny muted">monthly</div>
                          </td>
                          <td className="num text-orange">{r.advance_amount ? `−${money(r.advance_amount)}` : <span className="muted">—</span>}</td>
                          <td className="num strong">
                            {r.has_record ? money(r.net_amount) : <span className="muted">{money(r.suggested_salary)}</span>}
                          </td>
                          <td>
                            {!r.has_record
                              ? <span className="badge badge-gray">No record</span>
                              : r.paid
                              ? <span className="badge badge-green">Paid</span>
                              : <span className="badge badge-amber">Unpaid</span>}
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => setPaying(toPerson(r))}>
                              <Icon name="wallet" size={15} /> {r.has_record ? "Edit pay" : "Record pay"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="strong" style={{ textAlign: "right" }}>Net payroll ({monthName(month)} {year})</td>
                        <td className="num strong text-navy">{money(payrollTotals.net)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <PersonForm editing={editing} onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); loadPayroll(); }} />
      )}
      {paying && (
        <PersonSalaryModal person={paying} onClose={() => setPaying(null)}
          onSaved={() => { loadPayroll(); load(); }} />
      )}
      {deleting && (
        <Confirm title="Remove staff member"
          message={`Remove ${deleting.name}? All of their expense and salary records will also be deleted.`}
          confirmLabel="Remove" onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
