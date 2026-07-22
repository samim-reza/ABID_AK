"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { accentFor, formatDate, initials, isExpired, isExpiringSoon, money } from "@/lib/format";
import { COMPANY } from "@/lib/brand";
import type { Company, Page, Worker } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import WorkerForm from "@/components/WorkerForm";
import CompanyManager from "@/components/CompanyManager";
import WorkerSalaryModal from "@/components/WorkerSalaryModal";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

export default function WorkersPage() {
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Worker> | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [managing, setManaging] = useState(false);
  const [paying, setPaying] = useState<Worker | null>(null);
  const [deleting, setDeleting] = useState<Worker | null>(null);
  const [busy, setBusy] = useState(false);

  const projects = useMemo(
    () => companies.find((c) => c.id === companyId)?.projects ?? [],
    [companies, companyId]
  );

  const loadCompanies = useCallback(() => {
    api.get<Company[]>("/api/workers/companies").then(setCompanies).catch(() => {});
  }, []);
  useEffect(loadCompanies, [loadCompanies]);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<Worker>>("/api/workers", {
      q: q || undefined, company_id: companyId || undefined, project_id: projectId || undefined,
      page, page_size: 20,
    }).then(setData).finally(() => setLoading(false));
  }, [q, companyId, projectId, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [q, companyId, projectId]);

  // reset project filter if it no longer belongs to the chosen company
  useEffect(() => {
    if (projectId && !projects.some((p) => p.id === projectId)) setProjectId("");
  }, [projects, projectId]);

  function refreshAll() {
    loadCompanies();
    load();
  }

  async function toggleRelease(w: Worker) {
    setBusy(true);
    try {
      await api.post(`/api/workers/${w.id}/${w.is_released ? "readd" : "release"}`);
      toast.success(w.is_released ? "Worker re-added." : "Worker released.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/workers/${deleting.id}`);
      toast.success("Worker deleted.");
      setDeleting(null);
      refreshAll();
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
          <select className="select" style={{ width: "auto" }} value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")} disabled={!companyId}>
            <option value="">{companyId ? "All projects" : "All projects"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className={ui.searchBox}>
            <Icon name="search" size={17} />
            <input className="input" placeholder="Search name, passport, iqama…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn btn-ghost" onClick={() => setManaging(true)}><Icon name="building" size={16} /> Companies</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="plus" size={17} /> Add Worker
          </button>
        </div>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : companies.length === 0 ? (
        <div className="card">
          <EmptyState title="No companies yet" hint="Add a company and project before adding workers." />
          <div className="center" style={{ paddingBottom: 24 }}>
            <button className="btn btn-navy" onClick={() => setManaging(true)}><Icon name="building" size={16} /> Add company</button>
          </div>
        </div>
      ) : (
        <div className="card">
          {!data || data.items.length === 0 ? (
            <EmptyState title="No workers found" hint="Adjust filters or add a new worker." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Name</th><th>Nationality</th><th>Company / Project</th><th>Passport</th><th>Iqama</th><th className="num">Pay</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {data.items.map((w) => {
                    const expired = isExpired(w.iqama_expiry);
                    const danger = w.is_released || expired;
                    return (
                      <tr key={w.id} className={danger ? "danger" : ""}>
                        <td>
                          <div className="row gap-12">
                            <div className="avatar" style={{ background: accentFor(w.name) }}>{initials(w.name)}</div>
                            <span className="strong">{w.name}</span>
                          </div>
                        </td>
                        <td className="small">{w.nationality || <span className="muted">—</span>}</td>
                        <td className="small">
                          <div className="strong">{w.company_name}</div>
                          <div className="tiny muted">{w.project_name}</div>
                        </td>
                        <td className="small">{w.passport_number || <span className="muted">—</span>}</td>
                        <td className="small">
                          {w.iqama_number || <span className="muted">—</span>}
                          {w.iqama_expiry && (
                            <div className="tiny">
                              {expired
                                ? <span className="badge badge-red">Expired {formatDate(w.iqama_expiry)}</span>
                                : isExpiringSoon(w.iqama_expiry)
                                ? <span className="badge badge-amber">Expires {formatDate(w.iqama_expiry)}</span>
                                : <span className="muted">exp {formatDate(w.iqama_expiry)}</span>}
                            </div>
                          )}
                        </td>
                        <td className="num small">
                          {money(w.base_rate)}
                          <div className="tiny muted">{w.pay_type === "hourly" ? "/ hour" : "/ month"}</div>
                        </td>
                        <td>
                          {w.is_released
                            ? <span className="badge badge-red">Released</span>
                            : <span className="badge badge-green">Active</span>}
                        </td>
                        <td>
                          <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost btn-sm" title="Payments" onClick={() => setPaying(w)}><Icon name="wallet" size={15} /></button>
                            <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditing(w); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                            {w.is_released ? (
                              <button className="btn btn-ghost btn-sm" title="Re-add worker" onClick={() => toggleRelease(w)} disabled={busy}><Icon name="undo" size={15} /></button>
                            ) : (
                              <button className="btn btn-danger btn-sm" title="Release worker" onClick={() => toggleRelease(w)} disabled={busy}><Icon name="userX" size={15} /></button>
                            )}
                            <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setDeleting(w)}><Icon name="trash" size={15} /></button>
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
      )}

      {showForm && (
        <WorkerForm
          companies={companies} editing={editing}
          defaultCompanyId={companyId} defaultProjectId={projectId}
          onManageCompanies={() => setManaging(true)}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); refreshAll(); }}
        />
      )}
      {managing && (
        <CompanyManager companies={companies} onChanged={loadCompanies} onClose={() => { setManaging(false); load(); }} />
      )}
      {paying && (
        <WorkerSalaryModal worker={paying} onClose={() => setPaying(null)} onSaved={() => {}} />
      )}
      {deleting && (
        <Confirm title="Delete worker"
          message={`Permanently delete ${deleting.name} and all their pay records? Use “Release” instead if they only left the site.`}
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
