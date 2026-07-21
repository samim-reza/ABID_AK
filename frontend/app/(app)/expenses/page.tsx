"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money, sar, formatDate, accentFor, initials } from "@/lib/format";
import type { CategorySummary, Expense, Page, Person, PersonSummary } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import MonthYearFilter from "@/components/MonthYearFilter";
import ExpenseForm from "@/components/ExpenseForm";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

type View = "entries" | "person" | "category";

export default function ExpensesPage() {
  const toast = useToast();
  const [view, setView] = useState<View>("entries");
  const [persons, setPersons] = useState<Person[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [personId, setPersonId] = useState<number | "">("");
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Page<Expense> | null>(null);
  const [byPerson, setByPerson] = useState<PersonSummary[]>([]);
  const [byCategory, setByCategory] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatic = useCallback(() => {
    api.get<Page<Person>>("/api/persons", { page_size: 100, active_only: false }).then((r) => setPersons(r.items));
    api.get<string[]>("/api/expenses/categories").then(setCategories).catch(() => {});
    api.get<number[]>("/api/dashboard/periods").then(setYears).catch(() => {});
  }, []);
  useEffect(loadStatic, [loadStatic]);

  const load = useCallback(() => {
    setLoading(true);
    const flt = { month: month || undefined, year: year || undefined };
    if (view === "entries") {
      api.get<Page<Expense>>("/api/expenses", { ...flt, person_id: personId || undefined, category: category || undefined, page, page_size: 15 })
        .then(setData).finally(() => setLoading(false));
    } else if (view === "person") {
      api.get<PersonSummary[]>("/api/persons/summary", flt).then(setByPerson).finally(() => setLoading(false));
    } else {
      api.get<CategorySummary[]>("/api/expenses/by-category", flt).then(setByCategory).finally(() => setLoading(false));
    }
  }, [view, month, year, personId, category, page]);
  useEffect(load, [load]);

  useEffect(() => setPage(1), [view, month, year, personId, category]);

  function afterSave() {
    setShowForm(false);
    setEditing(null);
    loadStatic();
    load();
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/expenses/${deleting.id}`);
      toast.success("Expense deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  // totals for the current filtered set
  const totals =
    view === "person"
      ? byPerson.reduce((a, p) => ({ base: a.base + p.total_amount, vat: a.vat + p.total_vat, total: a.total + p.grand_total }), { base: 0, vat: 0, total: 0 })
      : view === "category"
      ? byCategory.reduce((a, c) => ({ base: a.base + c.total_amount, vat: a.vat + c.total_vat, total: a.total + c.grand_total }), { base: 0, vat: 0, total: 0 })
      : null;

  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented">
          <button className={view === "entries" ? "active" : ""} onClick={() => setView("entries")}>All Entries</button>
          <button className={view === "person" ? "active" : ""} onClick={() => setView("person")}>By Person</button>
          <button className={view === "category" ? "active" : ""} onClick={() => setView("category")}>By Section</button>
        </div>
        <div className="row gap-8 wrap">
          <MonthYearFilter month={month} year={year} years={years} onMonth={setMonth} onYear={setYear} />
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="plus" size={17} /> Add Expense
          </button>
        </div>
      </div>

      {totals && (
        <div className={ui.statGrid} style={{ marginBottom: 16, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className={ui.stat}><div className={ui.label}>Base Amount</div><div className={ui.value}><span className="cur">SAR</span>{money(totals.base)}</div></div>
          <div className={ui.stat}><div className={ui.label}>Total VAT (15%)</div><div className={ui.value} style={{ color: "var(--orange)" }}><span className="cur">SAR</span>{money(totals.vat)}</div></div>
          <div className={ui.stat}><div className={ui.label}>Grand Total</div><div className={ui.value}><span className="cur">SAR</span>{money(totals.total)}</div></div>
        </div>
      )}

      {loading && !data && view === "entries" ? (
        <PageLoader />
      ) : (
        <div className="card">
          {view === "entries" && (
            <EntriesView
              data={data} persons={persons} categories={categories}
              personId={personId} category={category}
              setPersonId={setPersonId} setCategory={setCategory}
              onEdit={(e) => { setEditing(e); setShowForm(true); }}
              onDelete={setDeleting} onPage={setPage}
            />
          )}
          {view === "person" && (
            <SummaryView
              rows={byPerson.filter((p) => p.expense_count > 0).map((p) => ({
                key: p.name, label: p.name, sub: p.role || p.department, ...p,
              }))}
              onOpen={(k) => { const p = byPerson.find((x) => x.name === k); if (p) { setPersonId(p.id); setView("entries"); } }}
              emptyTitle="No expenses recorded"
            />
          )}
          {view === "category" && (
            <SummaryView
              rows={byCategory.map((c) => ({
                key: c.category, label: c.category, sub: `${c.expense_count} entr${c.expense_count === 1 ? "y" : "ies"}`,
                total_amount: c.total_amount, total_vat: c.total_vat, grand_total: c.grand_total, expense_count: c.expense_count,
              }))}
              onOpen={(k) => { setCategory(k); setView("entries"); }}
              emptyTitle="No sections yet"
            />
          )}
        </div>
      )}

      {showForm && (
        <ExpenseForm persons={persons} categories={categories} editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }} onSaved={afterSave} />
      )}
      {deleting && (
        <Confirm title="Delete expense"
          message={`Delete the ${deleting.category} expense of ${sar(deleting.total)} for ${deleting.person_name}? This cannot be undone.`}
          onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}

/* ---------- Entries table ---------- */
function EntriesView({ data, persons, categories, personId, category, setPersonId, setCategory, onEdit, onDelete, onPage }: {
  data: Page<Expense> | null; persons: Person[]; categories: string[];
  personId: number | ""; category: string;
  setPersonId: (v: number | "") => void; setCategory: (v: string) => void;
  onEdit: (e: Expense) => void; onDelete: (e: Expense) => void; onPage: (p: number) => void;
}) {
  return (
    <>
      <div className="row gap-8 wrap" style={{ padding: 16, borderBottom: "1px solid var(--line)" }}>
        <select className="select" style={{ width: "auto" }} value={personId} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All people</option>
          {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All sections</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(personId || category) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setPersonId(""); setCategory(""); }}>Clear filters</button>
        )}
      </div>

      {!data || data.items.length === 0 ? (
        <EmptyState title="No expenses found" hint="Try adjusting filters or add a new expense." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Person</th><th>Section</th><th>Reason</th>
                <th className="num">Base</th><th className="num">VAT</th><th className="num">Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="small muted">{formatDate(e.expense_date)}</td>
                  <td><span className="strong">{e.person_name}</span></td>
                  <td><span className="badge" style={{ background: `${accentFor(e.category)}1a`, color: accentFor(e.category) }}>{e.category}</span></td>
                  <td className="small muted">
                    {e.reason || "—"}
                    {e.barcode && <span className="tiny" style={{ display: "block", opacity: 0.7 }}>⛶ {e.barcode}</span>}
                  </td>
                  <td className="num">{money(e.amount)}</td>
                  <td className="num">{e.vat_applied ? <span className="text-orange">{money(e.vat_amount)}</span> : <span className="muted">—</span>}</td>
                  <td className="num strong">{money(e.total)}</td>
                  <td>
                    <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(e)} title="Edit"><Icon name="edit" size={15} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(e)} title="Delete"><Icon name="trash" size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={onPage} />
        </div>
      )}
    </>
  );
}

/* ---------- Aggregation table (person / category) ---------- */
interface SummaryRow {
  key: string; label: string; sub: string;
  total_amount: number; total_vat: number; grand_total: number; expense_count: number;
}
function SummaryView({ rows, onOpen, emptyTitle }: { rows: SummaryRow[]; onOpen: (key: string) => void; emptyTitle: string }) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint="Records will appear here once you add expenses." />;
  const max = Math.max(...rows.map((r) => r.grand_total), 1);
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Name</th><th>Share</th><th className="num">Base</th><th className="num">VAT</th><th className="num">Total</th><th className="num">Entries</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ cursor: "pointer" }} onClick={() => onOpen(r.key)}>
              <td>
                <div className="row gap-12">
                  <div className="avatar" style={{ background: accentFor(r.key) }}>{initials(r.label)}</div>
                  <div><div className="strong">{r.label}</div><div className="tiny muted">{r.sub}</div></div>
                </div>
              </td>
              <td style={{ width: 180 }}>
                <div className={ui.barTrack}><div className={ui.barFill} style={{ width: `${(r.grand_total / max) * 100}%`, background: accentFor(r.key) }} /></div>
              </td>
              <td className="num">{money(r.total_amount)}</td>
              <td className="num text-orange">{money(r.total_vat)}</td>
              <td className="num strong">{money(r.grand_total)}</td>
              <td className="num">{r.expense_count}</td>
              <td className="num"><Icon name="chevronR" size={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
