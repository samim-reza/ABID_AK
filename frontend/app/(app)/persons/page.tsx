"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { accentFor, initials } from "@/lib/format";
import type { Page, Person } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import PersonForm from "@/components/PersonForm";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

export default function PersonsPage() {
  const toast = useToast();
  const [data, setData] = useState<Page<Person> | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<Person>>("/api/persons", { q: q || undefined, page, page_size: 15 })
      .then(setData).finally(() => setLoading(false));
  }, [q, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [q]);

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/persons/${deleting.id}`);
      toast.success("Person removed.");
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
        <div className={ui.searchBox}>
          <Icon name="search" size={17} />
          <input className="input" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Icon name="plus" size={17} /> Add Person
        </button>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : (
        <div className="card">
          {!data || data.items.length === 0 ? (
            <EmptyState title="No people yet" hint="Add your first team member to get started." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Name</th><th>Role</th><th>Department</th><th>Passport</th><th>Phone</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="row gap-12">
                          <div className="avatar" style={{ background: accentFor(p.name) }}>{initials(p.name)}</div>
                          <span className="strong">{p.name}</span>
                        </div>
                      </td>
                      <td className="small">{p.role || <span className="muted">—</span>}</td>
                      <td className="small muted">{p.department || "—"}</td>
                      <td className="small">{p.passport_number || <span className="muted">—</span>}</td>
                      <td className="small">{p.phone || <span className="muted">—</span>}</td>
                      <td>{p.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                      <td>
                        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(p); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(p)}><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
            </div>
          )}
        </div>
      )}

      {showForm && (
        <PersonForm editing={editing} onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }} />
      )}
      {deleting && (
        <Confirm title="Remove person"
          message={`Remove ${deleting.name}? All of their expenses and salary records will also be deleted.`}
          confirmLabel="Remove" onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
