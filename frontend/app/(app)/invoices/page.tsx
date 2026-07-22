"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { money, formatDate } from "@/lib/format";
import type { Company, Invoice, InvoiceCompanySummary, InvoiceTotals, Page } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import MonthYearFilter from "@/components/MonthYearFilter";
import InvoiceForm, { formatBytes } from "@/components/InvoiceForm";
import Confirm from "@/components/Confirm";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";
import styles from "@/components/invoice.module.css";

type View = "files" | "company";

export default function InvoicesPage() {
  const toast = useToast();
  const [view, setView] = useState<View>("files");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const [companyId, setCompanyId] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [totals, setTotals] = useState<InvoiceTotals | null>(null);
  const [byCompany, setByCompany] = useState<InvoiceCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatic = useCallback(() => {
    api.get<Company[]>("/api/workers/companies").then(setCompanies).catch(() => {});
    api.get<number[]>("/api/invoices/years").then(setYears).catch(() => {});
  }, []);
  useEffect(loadStatic, [loadStatic]);

  const load = useCallback(() => {
    setLoading(true);
    const flt = { company_id: companyId || undefined, month: month || undefined, year: year || undefined };
    api.get<InvoiceTotals>("/api/invoices/totals", flt).then(setTotals).catch(() => {});
    if (view === "files") {
      api.get<Page<Invoice>>("/api/invoices", { ...flt, page, page_size: 15 })
        .then(setData).finally(() => setLoading(false));
    } else {
      api.get<InvoiceCompanySummary[]>("/api/invoices/by-company", { month: month || undefined, year: year || undefined })
        .then(setByCompany).finally(() => setLoading(false));
    }
  }, [view, companyId, month, year, page]);
  useEffect(load, [load]);

  useEffect(() => setPage(1), [view, companyId, month, year]);

  /* PDFs sit behind auth, so fetch as a blob and hand the browser an object URL. */
  async function openPdf(inv: Invoice, download: boolean) {
    setBusyId(inv.id);
    try {
      const file = await api.blob(`/api/invoices/${inv.id}/file`, { download });
      const url = URL.createObjectURL(file);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = inv.file_name;
        a.click();
      } else {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open the PDF.");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/invoices/${deleting.id}`);
      toast.success("Invoice deleted.");
      setDeleting(null);
      loadStatic();
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  function afterSave() {
    setShowForm(false);
    setEditing(null);
    loadStatic();
    load();
  }

  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented">
          <button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>All Invoices</button>
          <button className={view === "company" ? "active" : ""} onClick={() => setView("company")}>By Company</button>
        </div>
        <div className="row gap-8 wrap">
          <MonthYearFilter month={month} year={year} years={years} onMonth={setMonth} onYear={setYear} />
          <button className="btn btn-teal" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Icon name="upload" size={17} /> Upload Invoice
          </button>
        </div>
      </div>

      {totals && (
        <div className={ui.statGrid} style={{ marginBottom: 16 }}>
          <div className={`${ui.stat} ${styles.statTeal}`}>
            <div className={ui.label}>Invoices</div>
            <div className={ui.value}>{totals.invoice_count}</div>
          </div>
          <div className={`${ui.stat} ${styles.statTeal}`}>
            <div className={ui.label}>Invoice Amount</div>
            <div className={ui.value}><span className="cur">SAR</span>{money(totals.total_amount)}</div>
          </div>
          <div className={`${ui.stat} ${styles.statTeal}`}>
            <div className={ui.label}>VAT (15%)</div>
            <div className={ui.value} style={{ color: "var(--teal)" }}><span className="cur">SAR</span>{money(totals.total_vat)}</div>
          </div>
          <div className={`${ui.stat} ${styles.statTeal}`}>
            <div className={ui.label}>Total with VAT</div>
            <div className={ui.value}><span className="cur">SAR</span>{money(totals.grand_total)}</div>
          </div>
        </div>
      )}

      {loading && !data && view === "files" ? (
        <PageLoader />
      ) : (
        <div className="card">
          {view === "files" ? (
            <>
              <div className={styles.companyBar}>
                <button className={`${styles.chip} ${companyId === "" ? styles.chipActive : ""}`} onClick={() => setCompanyId("")}>
                  All companies
                </button>
                {companies.map((c) => (
                  <button key={c.id} className={`${styles.chip} ${companyId === c.id ? styles.chipActive : ""}`}
                    onClick={() => setCompanyId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>

              {!data || data.items.length === 0 ? (
                <EmptyState title="No invoices yet" hint="Upload a company invoice PDF to start the archive." />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th><th>Company</th><th>Invoice #</th><th>Document</th>
                        <th className="num">Amount</th><th className="num">VAT</th><th className="num">Total</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((inv) => (
                        <tr key={inv.id}>
                          <td className="small muted">{formatDate(inv.invoice_date)}</td>
                          <td><span className="strong">{inv.company_name ?? "—"}</span></td>
                          <td>
                            {inv.invoice_number
                              ? <span className="badge badge-teal">{inv.invoice_number}</span>
                              : <span className="muted">—</span>}
                          </td>
                          <td>
                            <div className={styles.fileCell}>
                              <div className={styles.fileIcon}><Icon name="file" size={17} /></div>
                              <div style={{ minWidth: 0 }}>
                                <div className={`small strong ${styles.fileName}`}>{inv.file_name}</div>
                                <div className="tiny muted">
                                  {formatBytes(inv.file_size)}{inv.description ? ` • ${inv.description}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="num">{money(inv.amount)}</td>
                          <td className="num text-teal">{money(inv.vat_amount)}</td>
                          <td className="num strong">{money(inv.total)}</td>
                          <td>
                            <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" title="View PDF" disabled={busyId === inv.id}
                                onClick={() => openPdf(inv, false)}>
                                {busyId === inv.id ? <span className="spinner dark" style={{ width: 15, height: 15 }} /> : <Icon name="eye" size={15} />}
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Download PDF" disabled={busyId === inv.id}
                                onClick={() => openPdf(inv, true)}>
                                <Icon name="download" size={15} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Edit details"
                                onClick={() => { setEditing(inv); setShowForm(true); }}>
                                <Icon name="edit" size={15} />
                              </button>
                              <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setDeleting(inv)}>
                                <Icon name="trash" size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
                </div>
              )}
            </>
          ) : byCompany.length === 0 ? (
            <EmptyState title="No invoices yet" hint="Company totals appear here once invoices are uploaded." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Company</th><th>Share</th><th className="num">Invoices</th>
                    <th className="num">Amount</th><th className="num">VAT</th><th className="num">Total</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const max = Math.max(...byCompany.map((c) => c.grand_total), 1);
                    return byCompany.map((c) => (
                      <tr key={c.company_id} style={{ cursor: "pointer" }}
                        onClick={() => { setCompanyId(c.company_id); setView("files"); }}>
                        <td><span className="strong">{c.company_name}</span></td>
                        <td style={{ width: 180 }}>
                          <div className={ui.barTrack}>
                            <div className={ui.barFill} style={{ width: `${(c.grand_total / max) * 100}%`, background: "var(--teal)" }} />
                          </div>
                        </td>
                        <td className="num">{c.invoice_count}</td>
                        <td className="num">{money(c.total_amount)}</td>
                        <td className="num text-teal">{money(c.total_vat)}</td>
                        <td className="num strong">{money(c.grand_total)}</td>
                        <td className="num"><Icon name="chevronR" size={16} /></td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <InvoiceForm companies={companies} editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }} onSaved={afterSave} />
      )}
      {deleting && (
        <Confirm title="Delete invoice"
          message={`Delete "${deleting.file_name}" for ${deleting.company_name}? The stored PDF is removed permanently.`}
          onConfirm={doDelete} onClose={() => setDeleting(null)} busy={busy} />
      )}
    </>
  );
}
