"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import type { Company, Worker } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  companies: Company[];
  editing?: Worker | null;
  defaultCompanyId?: number | "";
  defaultProjectId?: number | "";
  onManageCompanies: () => void;
  onClose: () => void;
  onSaved: () => void;
}

export default function WorkerForm({
  companies, editing, defaultCompanyId, defaultProjectId, onManageCompanies, onClose, onSaved,
}: Props) {
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [nationality, setNationality] = useState(editing?.nationality ?? "");
  const [passport, setPassport] = useState(editing?.passport_number ?? "");
  const [iqama, setIqama] = useState(editing?.iqama_number ?? "");
  const [iqamaExpiry, setIqamaExpiry] = useState(editing?.iqama_expiry ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [companyId, setCompanyId] = useState<number | "">(editing?.company_id ?? defaultCompanyId ?? "");
  const [projectId, setProjectId] = useState<number | "">(editing?.project_id ?? defaultProjectId ?? "");
  const [payType, setPayType] = useState<"monthly" | "hourly">(editing?.pay_type ?? "monthly");
  const [baseRate, setBaseRate] = useState(editing ? String(editing.base_rate) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const projects = useMemo(
    () => companies.find((c) => c.id === companyId)?.projects ?? [],
    [companies, companyId]
  );

  // keep project valid for the selected company
  useEffect(() => {
    if (projectId && !projects.some((p) => p.id === projectId)) setProjectId("");
  }, [projects, projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Worker name is required."); return; }
    if (!companyId || !projectId) { toast.error("Choose a company and project."); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), nationality: nationality.trim(),
      passport_number: passport || null, iqama_number: iqama || null,
      iqama_expiry: iqamaExpiry || null, phone: phone || null,
      company_id: companyId, project_id: projectId,
      pay_type: payType, base_rate: parseFloat(baseRate) || 0, note: note || null,
    };
    try {
      if (editing) await api.patch<Worker>(`/api/workers/${editing.id}`, payload);
      else await api.post<Worker>("/api/workers", payload);
      toast.success(editing ? "Worker updated." : "Worker added.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save worker.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Worker" : "Add Worker"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> {editing ? "Save" : "Add worker"}</>}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahim Uddin" required />
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Nationality</label>
            <input className="input" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Bangladeshi" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Passport number</label>
            <input className="input" value={passport} onChange={(e) => setPassport(e.target.value)} placeholder="e.g. A1234567" />
          </div>
          <div className="field">
            <label>Iqama number</label>
            <input className="input" value={iqama} onChange={(e) => setIqama(e.target.value)} placeholder="e.g. 2xxxxxxxxx" />
          </div>
        </div>

        <div className="field">
          <label>Iqama expiry date</label>
          <input className="input" type="date" value={iqamaExpiry} onChange={(e) => setIqamaExpiry(e.target.value)} />
          <span className="hint">Rows turn red once the iqama is expired.</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Company</label>
            <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")} required>
              <option value="">Select company…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Project</label>
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")} required disabled={!companyId}>
              <option value="">{companyId ? "Select project…" : "Pick a company first"}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onManageCompanies} style={{ marginBottom: 16 }}>
          <Icon name="building" size={15} /> Manage companies & projects
        </button>

        <div className="form-grid">
          <div className="field">
            <label>Pay type</label>
            <div className="segmented" style={{ width: "100%" }}>
              <button type="button" style={{ flex: 1 }} className={payType === "monthly" ? "active" : ""} onClick={() => setPayType("monthly")}>Monthly</button>
              <button type="button" style={{ flex: 1 }} className={payType === "hourly" ? "active" : ""} onClick={() => setPayType("hourly")}>Per hour</button>
            </div>
          </div>
          <div className="field">
            <label>{payType === "hourly" ? "Hourly rate" : "Basic salary"} ({COMPANY.currency})</label>
            <input className="input" type="number" step="0.01" min="0" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="field">
          <label>Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any remark" />
        </div>
      </form>
    </Modal>
  );
}
