"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";

interface Props {
  editing?: CurrentUser | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function UserForm({ editing, onClose, onSaved }: Props) {
  const toast = useToast();
  const [username, setUsername] = useState(editing?.username ?? "");
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(editing?.is_admin ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || (!editing && password.length < 4)) {
      toast.error("Username and a password of at least 4 characters are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = { full_name: fullName, is_admin: isAdmin, is_active: isActive };
        if (password) body.password = password;
        await api.patch(`/api/users/${editing.id}`, body);
      } else {
        await api.post("/api/users", { username: username.trim(), full_name: fullName, password, is_admin: isAdmin, is_active: isActive });
      }
      toast.success(editing ? "User updated." : "User created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit User" : "Add User"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <span className="spinner" /> : <><Icon name="check" size={16} /> {editing ? "Save" : "Create user"}</>}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label>Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)}
            disabled={!!editing} placeholder="e.g. accountant" required />
        </div>
        <div className="field">
          <label>Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Display name" />
        </div>
        <div className="field">
          <label>{editing ? "New password (leave blank to keep)" : "Password"}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="new-password" />
        </div>
        <div className="row gap-16 wrap">
          <label className="row gap-8" style={{ cursor: "pointer", fontSize: 14 }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Administrator
          </label>
          <label className="row gap-8" style={{ cursor: "pointer", fontSize: 14 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
        </div>
      </form>
    </Modal>
  );
}
