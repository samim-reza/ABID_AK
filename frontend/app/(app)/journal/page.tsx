"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money, formatDate, todayISO } from "@/lib/format";
import { COMPANY } from "@/lib/brand";
import { printDocument, esc, amt } from "@/lib/print";
import type { Account, JournalEntry, JournalLine, Page } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import MonthYearFilter from "@/components/MonthYearFilter";
import Modal from "@/components/Modal";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

type StatusFilter = "" | "draft" | "posted" | "void";
const STATUS_BADGE: Record<string, string> = { draft: "badge-amber", posted: "badge-green", void: "badge-gray" };

export default function JournalPage() {
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>("");
  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Page<JournalEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [viewing, setViewing] = useState<JournalEntry | null>(null);
  const [confirm, setConfirm] = useState<{ entry: JournalEntry; action: "post" | "void" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Account[]>("/api/accounting/accounts", { postable_only: true, active_only: true }).then(setAccounts).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<JournalEntry>>("/api/accounting/journal", {
      status: status || undefined, month: month || undefined, year: year || undefined,
      search: search || undefined, page, page_size: 15,
    }).then(setData).finally(() => setLoading(false));
  }, [status, month, year, search, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [status, month, year, search]);

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    const { entry, action } = confirm;
    try {
      if (action === "delete") await api.delete(`/api/accounting/journal/${entry.id}`);
      else await api.post(`/api/accounting/journal/${entry.id}/${action}`);
      toast.success(action === "post" ? "Entry posted." : action === "void" ? "Entry voided." : "Entry deleted.");
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function printVoucher(entry: JournalEntry) {
    const body = `
      <table style="margin-bottom:14px"><tbody>
        <tr><td class="subhead">Voucher No.</td><td>${esc(entry.entry_no)}</td><td class="subhead">Date</td><td>${esc(formatDate(entry.entry_date))}</td></tr>
        <tr><td class="subhead">Status</td><td>${esc(entry.status.toUpperCase())}</td><td class="subhead">Reference</td><td>${esc(entry.reference || "—")}</td></tr>
        <tr><td class="subhead">Memo</td><td colspan="3">${esc(entry.memo || "—")}</td></tr>
      </tbody></table>
      <table><thead><tr><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${entry.lines.map((l) => `<tr><td>${esc(l.account_code)} — ${esc(l.account_name)}</td><td>${esc(l.description)}</td><td class="num">${amt(l.debit)}</td><td class="num">${amt(l.credit)}</td></tr>`).join("")}
      <tr class="total"><td colspan="2">Total (${esc(COMPANY.currency)})</td><td class="num">${amt(entry.total_debit)}</td><td class="num">${amt(entry.total_credit)}</td></tr>
      </tbody></table>`;
    printDocument("Journal Voucher", `${entry.entry_no} · ${formatDate(entry.entry_date)}`, body);
  }

  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented">
          <button className={status === "" ? "active" : ""} onClick={() => setStatus("")}>All</button>
          <button className={status === "draft" ? "active" : ""} onClick={() => setStatus("draft")}>Draft</button>
          <button className={status === "posted" ? "active" : ""} onClick={() => setStatus("posted")}>Posted</button>
          <button className={status === "void" ? "active" : ""} onClick={() => setStatus("void")}>Void</button>
        </div>
        <div className="row gap-8 wrap">
          <div className={ui.searchBox}>
            <Icon name="search" size={16} />
            <input placeholder="Search voucher / memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <MonthYearFilter month={month} year={year} years={data ? uniqueYears(data.items) : []} onMonth={setMonth} onYear={setYear} />
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="plus" size={17} /> New Entry
          </button>
        </div>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : !data?.items.length ? (
        <div className="card"><EmptyState title="No journal entries" hint="Create your first double-entry voucher." /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Voucher</th><th>Date</th><th>Memo</th><th>Reference</th><th>Status</th><th className="num">Amount</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className={e.status === "void" ? "danger" : undefined}>
                    <td className="small strong">{e.entry_no}</td>
                    <td className="small">{formatDate(e.entry_date)}</td>
                    <td className="small">{e.memo || <span className="muted">—</span>}</td>
                    <td className="small">{e.reference || <span className="muted">—</span>}</td>
                    <td><span className={`badge ${STATUS_BADGE[e.status]} tiny`}>{e.status}</span></td>
                    <td className="num small strong"><span className="cur" style={{ color: "var(--muted)", marginRight: 4 }}>SAR</span>{money(e.total_debit)}</td>
                    <td>
                      <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" title="View" onClick={() => setViewing(e)}><Icon name="eye" size={15} /></button>
                        <button className="btn btn-ghost btn-sm" title="Print voucher" onClick={() => printVoucher(e)}><Icon name="printer" size={15} /></button>
                        {e.status === "draft" && (
                          <>
                            <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditing(e); setShowForm(true); }}><Icon name="edit" size={15} /></button>
                            <button className="btn btn-ghost btn-sm" title="Post" onClick={() => setConfirm({ entry: e, action: "post" })}><Icon name="check" size={15} /></button>
                            <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setConfirm({ entry: e, action: "delete" })}><Icon name="trash" size={15} /></button>
                          </>
                        )}
                        {e.status === "posted" && (
                          <button className="btn btn-ghost btn-sm" title="Void" onClick={() => setConfirm({ entry: e, action: "void" })}><Icon name="undo" size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </div>
      )}

      {showForm && (
        <JournalForm
          entry={editing}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}

      {viewing && (
        <Modal title={`${viewing.entry_no} — ${viewing.status.toUpperCase()}`} onClose={() => setViewing(null)} wide
          footer={<button className="btn btn-ghost" onClick={() => printVoucher(viewing)}><Icon name="printer" size={16} /> Print voucher</button>}>
          <div className="row between small" style={{ marginBottom: 10 }}>
            <span><span className="muted">Date:</span> <strong>{formatDate(viewing.entry_date)}</strong></span>
            <span><span className="muted">Reference:</span> <strong>{viewing.reference || "—"}</strong></span>
          </div>
          <div className="small" style={{ marginBottom: 12 }}><span className="muted">Memo:</span> {viewing.memo || "—"}</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Account</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>
                {viewing.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="small">{l.account_code} — {l.account_name}</td>
                    <td className="small">{l.description || <span className="muted">—</span>}</td>
                    <td className="num small">{l.debit ? money(l.debit) : ""}</td>
                    <td className="num small">{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "#f7f9fc" }}>
                  <td colSpan={2}>Total</td>
                  <td className="num">{money(viewing.total_debit)}</td>
                  <td className="num">{money(viewing.total_credit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          title={confirm.action === "post" ? "Post entry" : confirm.action === "void" ? "Void entry" : "Delete entry"}
          message={
            confirm.action === "post" ? `Post ${confirm.entry.entry_no} to the ledger? Posted entries can only be reversed by voiding.`
            : confirm.action === "void" ? `Void ${confirm.entry.entry_no}? It stays in the audit trail but is excluded from all balances.`
            : `Delete draft ${confirm.entry.entry_no}? This cannot be undone.`
          }
          confirmLabel={confirm.action === "post" ? "Post" : confirm.action === "void" ? "Void" : "Delete"}
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function uniqueYears(items: JournalEntry[]): number[] {
  return Array.from(new Set(items.map((e) => e.year))).sort((a, b) => b - a);
}

// ---- Entry editor ----

interface DraftLine { account_id: number | ""; description: string; debit: string; credit: string; }

function blankLine(): DraftLine { return { account_id: "", description: "", debit: "", credit: "" }; }

function JournalForm({
  entry, accounts, onClose, onSaved,
}: {
  entry: JournalEntry | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(entry?.entry_date ?? todayISO());
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [reference, setReference] = useState(entry?.reference ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    entry ? entry.lines.map((l) => ({ account_id: l.account_id, description: l.description, debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" }))
          : [blankLine(), blankLine()]
  );
  const [busy, setBusy] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function buildPayload(post: boolean) {
    return {
      entry_date: date, memo: memo.trim(), reference: reference.trim() || null, post,
      lines: lines
        .filter((l) => l.account_id !== "" && (parseFloat(l.debit) || parseFloat(l.credit)))
        .map((l) => ({ account_id: Number(l.account_id), description: l.description.trim(), debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
    };
  }

  async function save(post: boolean) {
    const payload = buildPayload(post);
    if (payload.lines.length < 2) { toast.error("Add at least two lines."); return; }
    setBusy(true);
    try {
      if (entry) {
        await api.patch(`/api/accounting/journal/${entry.id}`, { entry_date: payload.entry_date, memo: payload.memo, reference: payload.reference, lines: payload.lines });
        if (post) await api.post(`/api/accounting/journal/${entry.id}/post`);
      } else {
        await api.post("/api/accounting/journal", payload);
      }
      toast.success(post ? "Entry posted." : "Draft saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={entry ? `Edit ${entry.entry_no}` : "New Journal Entry"}
      onClose={onClose}
      wide
      footer={
        <>
          <div className="grow small" style={{ textAlign: "left" }}>
            <span className={balanced ? "text-green strong" : "text-orange strong"}>
              {balanced ? "● Balanced" : "● Out of balance"}
            </span>
            <span className="muted"> · Dr {money(totalDebit)} / Cr {money(totalCredit)}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-navy" onClick={() => save(false)} disabled={busy}>Save Draft</button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || !balanced}>Post</button>
        </>
      }
    >
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: "0 0 160px" }}>
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field grow">
          <label>Reference (optional)</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-1029 / CHQ-55" />
        </div>
      </div>
      <div className="field">
        <label>Memo</label>
        <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Describe the transaction" />
      </div>

      <div className="table-wrap" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
        <table className="data">
          <thead>
            <tr><th>Account</th><th>Description</th><th className="num" style={{ width: 120 }}>Debit</th><th className="num" style={{ width: 120 }}>Credit</th><th style={{ width: 40 }}></th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="select" value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                    <option value="">— select —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </td>
                <td><input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="line note" /></td>
                <td><input className="input num" inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} style={{ textAlign: "right" }} /></td>
                <td><input className="input num" inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} style={{ textAlign: "right" }} /></td>
                <td>
                  <button className="btn btn-ghost btn-sm" title="Remove line" disabled={lines.length <= 2}
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setLines((prev) => [...prev, blankLine()])}>
        <Icon name="plus" size={15} /> Add line
      </button>
    </Modal>
  );
}
