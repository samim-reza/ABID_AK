"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Person, Role } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  editing?: Person | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PersonForm({ editing, onClose, onSaved }: Props) {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState(editing?.role ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [passport, setPassport] = useState(editing?.passport_number ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [location, setLocation] = useState<"inside" | "outside">(editing?.location ?? "inside");
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Role[]>("/api/roles").then(setRoles).catch(() => {});
  }, []);

  function onRoleChange(value: string) {
    setRole(value);
    const found = roles.find((r) => r.name === value);
    if (found) setDepartment(found.department);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), role, department,
      passport_number: passport || null, phone: phone || null,
      email: email || null, location, is_active: active,
    };
    try {
      if (editing) await api.patch<Person>(`/api/persons/${editing.id}`, payload);
      else await api.post<Person>("/api/persons", payload);
      toast.success(editing ? "Person updated." : "Person added.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save person.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit Staff Member" : "Add Office Staff"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> {editing ? "Save" : "Add staff"}</>}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mohammed Ali" required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Role</label>
            <input className="input" list="role-list" value={role}
              onChange={(e) => onRoleChange(e.target.value)}
              placeholder="Select or type a role…" />
            <datalist id="role-list">
              {roles.map((r) => <option key={r.id} value={r.name}>{r.department}</option>)}
            </datalist>
          </div>
          <div className="field">
            <label>Department</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Auto-filled from role" />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Passport number</label>
            <input className="input" value={passport} onChange={(e) => setPassport(e.target.value)} placeholder="e.g. A1234567" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="field">
            <label>Work location</label>
            <div className="segmented" style={{ width: "100%" }}>
              <button type="button" style={{ flex: 1 }} className={location === "inside" ? "active" : ""} onClick={() => setLocation("inside")}>Inside office</button>
              <button type="button" style={{ flex: 1 }} className={location === "outside" ? "active" : ""} onClick={() => setLocation("outside")}>Outside office</button>
            </div>
          </div>
        </div>
        <label className="row gap-8" style={{ cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active team member
        </label>
      </form>
    </Modal>
  );
}
