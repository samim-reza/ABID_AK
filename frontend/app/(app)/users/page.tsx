"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { CurrentUser } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import UserForm from "@/components/UserForm";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<CurrentUser[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CurrentUser | null>(null);
  const [deleting, setDeleting] = useState<CurrentUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<CurrentUser[]>("/api/users").then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(load, [load]);

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/users/${deleting.id}`);
      toast.success("User deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!users) return <PageLoader />;

  return (
    <>
      <div className={ui.toolbar}>
        <p className="muted small mb-0">Manage who can sign in to the portal.</p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Icon name="plus" size={17} /> Add User
        </button>
      </div>

      <div className="card">
        {users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="row gap-12">
                        <div className="avatar" style={{ background: "var(--navy)" }}>{initials(u.full_name || u.username)}</div>
                        <span className="strong">{u.full_name || u.username}{me?.id === u.id && <span className="badge badge-gray" style={{ marginLeft: 8 }}>You</span>}</span>
                      </div>
                    </td>
                    <td className="small muted">@{u.username}</td>
                    <td>{u.is_admin ? <span className="badge badge-navy">Administrator</span> : <span className="badge badge-gray">Member</span>}</td>
                    <td>{u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Disabled</span>}</td>
                    <td>
                      <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(u); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                        <button className="btn btn-danger btn-sm" disabled={me?.id === u.id} onClick={() => setDeleting(u)}><Icon name="trash" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <UserForm editing={editing} onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }} />
      )}
      {deleting && (
        <Confirm title="Delete user" message={`Delete portal access for ${deleting.username}?`}
          onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
