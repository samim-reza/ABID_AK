"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { printDocument, esc, amt } from "@/lib/print";
import type { Account, AccountNode, AccountType } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Modal from "@/components/Modal";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

const TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
const TYPE_BADGE: Record<AccountType, string> = {
  asset: "badge-navy", liability: "badge-amber", equity: "badge-teal",
  income: "badge-green", expense: "badge-gray",
};

interface FlatRow {
  node: AccountNode;
  depth: number;
}

function flatten(nodes: AccountNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

export default function AccountsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [tree, setTree] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<AccountNode[]>("/api/accounting/accounts/tree").then(setTree).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => flatten(tree), [tree]);
  const flatAccounts = useMemo(() => rows.map((r) => r.node), [rows]);

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/accounting/accounts/${deleting.id}`);
      toast.success("Account removed.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete account.");
    } finally {
      setBusy(false);
    }
  }

  function print() {
    const body = `<table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Normal</th><th class="num">Balance (SAR)</th></tr></thead><tbody>${rows
      .map(({ node, depth }) => {
        const cls = node.is_group ? "subhead" : depth > 0 ? "indent" : "";
        const pad = `style="padding-left:${10 + depth * 16}px"`;
        return `<tr class="${cls}"><td>${esc(node.code)}</td><td ${pad}>${esc(node.name)}</td><td>${esc(node.account_type)}</td><td>${esc(node.normal_balance)}</td><td class="num">${amt(node.balance)}</td></tr>`;
      })
      .join("")}</tbody></table>`;
    printDocument("Chart of Accounts", `${flatAccounts.length} accounts · as at ${new Date().toLocaleDateString("en-GB")}`, body);
  }

  return (
    <>
      <div className={ui.toolbar}>
        <div className="row gap-8">
          <span className="badge badge-navy">{flatAccounts.length} accounts</span>
        </div>
        <div className="row gap-8 wrap">
          <button className="btn btn-ghost" onClick={print} disabled={!rows.length}>
            <Icon name="printer" size={17} /> Print
          </button>
          {user?.is_admin && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <Icon name="plus" size={17} /> New Account
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : !rows.length ? (
        <div className="card"><EmptyState title="No accounts yet" hint="The chart of accounts is empty." /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th><th>Account</th><th>Type</th><th className="num">Balance</th>
                  {user?.is_admin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, depth }) => (
                  <tr key={node.id} style={node.is_group ? { background: "#f7f9fc" } : undefined}>
                    <td className="small strong">{node.code}</td>
                    <td style={{ paddingLeft: 14 + depth * 20 }}>
                      <span className={node.is_group ? "strong" : ""} style={!node.is_active ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>
                        {node.name}
                      </span>
                      {node.is_group && <span className="badge badge-gray tiny" style={{ marginLeft: 8 }}>group</span>}
                      {!node.is_active && <span className="badge badge-red tiny" style={{ marginLeft: 8 }}>inactive</span>}
                    </td>
                    <td><span className={`badge ${TYPE_BADGE[node.account_type]} tiny`}>{node.account_type}</span></td>
                    <td className="num small strong" style={{ color: node.balance < 0 ? "var(--red)" : "var(--ink)" }}>
                      {money(node.balance)}
                    </td>
                    {user?.is_admin && (
                      <td>
                        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditing(node); setShowForm(true); }}>
                            <Icon name="edit" size={15} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setDeleting(node)}>
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <AccountForm
          account={editing}
          accounts={flatAccounts}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}

      {deleting && (
        <Confirm
          title="Delete account"
          message={`Delete "${deleting.code} — ${deleting.name}"? Accounts with postings can't be deleted — deactivate them instead.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function AccountForm({
  account, accounts, onClose, onSaved,
}: {
  account: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.account_type ?? "asset");
  const [parentId, setParentId] = useState<number | "">(account?.parent_id ?? "");
  const [isGroup, setIsGroup] = useState(account?.is_group ?? false);
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const parents = accounts.filter((a) => a.account_type === type && a.id !== account?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      code: code.trim(), name: name.trim(), account_type: type,
      parent_id: parentId === "" ? null : Number(parentId), is_group: isGroup, is_active: isActive,
    };
    try {
      if (account) await api.patch(`/api/accounting/accounts/${account.id}`, payload);
      else await api.post("/api/accounting/accounts", payload);
      toast.success(account ? "Account updated." : "Account created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={account ? "Edit Account" : "New Account"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="account-form" disabled={busy}>
            {busy ? "Saving…" : "Save Account"}
          </button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit}>
        <div className="row gap-12" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: "0 0 120px" }}>
            <label>Code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="1110" />
          </div>
          <div className="field grow">
            <label>Account name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Cash on Hand" />
          </div>
        </div>
        <div className="row gap-12" style={{ alignItems: "flex-start" }}>
          <div className="field grow">
            <label>Type</label>
            <select className="select" value={type} onChange={(e) => { setType(e.target.value as AccountType); setParentId(""); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="field grow">
            <label>Parent (optional)</label>
            <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— top level —</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row gap-16" style={{ marginTop: 4 }}>
          <label className="row gap-8 small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
            Group / header (cannot be posted to)
          </label>
          <label className="row gap-8 small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>
      </form>
    </Modal>
  );
}
