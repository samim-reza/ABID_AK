"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  companies: Company[];
  onChanged: () => void;
  onClose: () => void;
}

export default function CompanyManager({ companies, onChanged, onClose }: Props) {
  const toast = useToast();
  const [newCompany, setNewCompany] = useState("");
  const [projectDraft, setProjectDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const addCompany = () => {
    if (!newCompany.trim()) return;
    run(async () => { await api.post("/api/workers/companies", { name: newCompany.trim() }); setNewCompany(""); }, "Company added.");
  };
  const renameCompany = (c: Company) => {
    const name = prompt("Rename company", c.name)?.trim();
    if (name && name !== c.name) run(() => api.patch(`/api/workers/companies/${c.id}`, { name }), "Company renamed.");
  };
  const deleteCompany = (c: Company) =>
    run(() => api.delete(`/api/workers/companies/${c.id}`), "Company deleted.");

  const addProject = (companyId: number) => {
    const name = (projectDraft[companyId] ?? "").trim();
    if (!name) return;
    run(async () => {
      await api.post("/api/workers/projects", { company_id: companyId, name });
      setProjectDraft((d) => ({ ...d, [companyId]: "" }));
    }, "Project added.");
  };
  const renameProject = (pid: number, current: string) => {
    const name = prompt("Rename project", current)?.trim();
    if (name && name !== current) run(() => api.patch(`/api/workers/projects/${pid}`, { name }), "Project renamed.");
  };
  const deleteProject = (pid: number) =>
    run(() => api.delete(`/api/workers/projects/${pid}`), "Project deleted.");

  return (
    <Modal
      title="Companies & Projects"
      wide
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}
    >
      <div className="row gap-8" style={{ marginBottom: 18 }}>
        <input className="input grow" placeholder="New company name" value={newCompany}
          onChange={(e) => setNewCompany(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompany())} />
        <button className="btn btn-navy" onClick={addCompany} disabled={busy || !newCompany.trim()}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>

      {companies.length === 0 ? (
        <div className="empty">No companies yet. Add one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {companies.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row gap-8">
                  <Icon name="building" size={17} />
                  <span className="strong">{c.name}</span>
                  <span className="badge badge-gray">{c.worker_count} worker{c.worker_count === 1 ? "" : "s"}</span>
                </div>
                <div className="row gap-8">
                  <button className="btn btn-ghost btn-sm" onClick={() => renameCompany(c)} disabled={busy}><Icon name="edit" size={14} /></button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteCompany(c)} disabled={busy}><Icon name="trash" size={14} /></button>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {c.projects.length === 0 && <span className="tiny muted">No projects yet.</span>}
                {c.projects.map((p) => (
                  <span key={p.id} className="badge badge-navy" style={{ gap: 8 }}>
                    {p.name} <span className="muted">· {p.worker_count}</span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} onClick={() => renameProject(p.id, p.name)} disabled={busy}><Icon name="edit" size={12} /></button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 2 }} onClick={() => deleteProject(p.id)} disabled={busy}><Icon name="close" size={12} /></button>
                  </span>
                ))}
              </div>

              <div className="row gap-8">
                <input className="input grow" placeholder="Add project (e.g. Project 1)" value={projectDraft[c.id] ?? ""}
                  onChange={(e) => setProjectDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProject(c.id))} />
                <button className="btn btn-ghost btn-sm" onClick={() => addProject(c.id)} disabled={busy}>
                  <Icon name="plus" size={14} /> Project
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
