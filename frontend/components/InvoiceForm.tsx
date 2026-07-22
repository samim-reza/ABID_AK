"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import { money, todayISO } from "@/lib/format";
import type { Company, Invoice } from "@/lib/types";
import Modal from "./Modal";
import Icon from "./Icons";
import { useToast } from "./Toast";
import styles from "./invoice.module.css";

const MAX_MB = 20; // must stay in step with the backend MAX_UPLOAD_MB

interface Props {
  companies: Company[];
  editing: Invoice | null; // metadata-only edit; the PDF itself never changes
  onClose: () => void;
  onSaved: () => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InvoiceForm({ companies, editing, onClose, onSaved }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyId, setCompanyId] = useState<number | "">(editing?.company_id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoice_number ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [invoiceDate, setInvoiceDate] = useState(editing?.invoice_date ?? todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Live preview — the backend recomputes these on save, this is display only.
  const calc = useMemo(() => {
    const base = parseFloat(amount);
    if (!Number.isFinite(base) || base <= 0) return null;
    const vat = Math.round(base * COMPANY.vatRate * 100) / 100;
    return { base, vat, total: Math.round((base + vat) * 100) / 100 };
  }, [amount]);

  function pickFile(next: File | null) {
    setError("");
    if (!next) return setFile(null);
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) {
      return setError("Only PDF files can be uploaded.");
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      return setError(`That PDF is ${formatBytes(next.size)} — the limit is ${MAX_MB} MB.`);
    }
    setFile(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return setError("Choose a company.");
    if (!calc) return setError("Enter a valid invoice amount.");
    if (!editing && !file) return setError("Attach the invoice PDF.");

    setBusy(true);
    setError("");
    try {
      if (editing) {
        await api.patch(`/api/invoices/${editing.id}`, {
          company_id: Number(companyId),
          invoice_number: invoiceNumber.trim(),
          description: description.trim(),
          amount: calc.base,
          invoice_date: invoiceDate,
        });
        toast.success("Invoice details updated.");
      } else {
        const form = new FormData();
        form.append("company_id", String(companyId));
        form.append("amount", String(calc.base));
        form.append("invoice_date", invoiceDate);
        form.append("invoice_number", invoiceNumber.trim());
        form.append("description", description.trim());
        form.append("file", file as File);
        await api.upload("/api/invoices", form);
        toast.success("Invoice uploaded.");
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Save failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit invoice details" : "Upload invoice"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="invoice-form" className="btn btn-teal" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name={editing ? "check" : "upload"} size={16} />}
            {editing ? "Save changes" : "Upload invoice"}
          </button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={submit} className="teal-scope">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="inv-company">Company</label>
            <select id="inv-company" className="select" value={companyId}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select company…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="inv-date">Invoice date</label>
            <input id="inv-date" type="date" className="input" value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="inv-number">Invoice number <span className="hint">(optional)</span></label>
            <input id="inv-number" className="input" value={invoiceNumber} maxLength={80}
              onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-1024" />
          </div>
          <div className="field">
            <label htmlFor="inv-amount">Invoice amount ({COMPANY.currency})</label>
            <input id="inv-amount" type="number" step="0.01" min="0.01" className="input" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="inv-desc">Description <span className="hint">(optional)</span></label>
          <input id="inv-desc" className="input" value={description} maxLength={255}
            onChange={(e) => setDescription(e.target.value)} placeholder="What is this invoice for?" />
        </div>

        {/* VAT is derived automatically and stays inside the invoice section */}
        <div className={styles.calcBox}>
          <div><span>Amount</span><b>{COMPANY.currency} {money(calc?.base ?? 0)}</b></div>
          <div><span>VAT ({Math.round(COMPANY.vatRate * 100)}%)</span><b className="text-teal">{COMPANY.currency} {money(calc?.vat ?? 0)}</b></div>
          <div className={styles.calcTotal}><span>Total with VAT</span><b>{COMPANY.currency} {money(calc?.total ?? 0)}</b></div>
        </div>

        {editing ? (
          <p className="small muted" style={{ marginTop: 16 }}>
            <Icon name="file" size={14} /> Attached file: <b>{editing.file_name}</b> ({formatBytes(editing.file_size)}).
            The PDF stays as uploaded — delete the invoice to replace it.
          </p>
        ) : (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Invoice PDF</label>
            <div
              className={`${styles.drop} ${file ? styles.dropFilled : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null); }}
              role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            >
              <Icon name={file ? "file" : "upload"} size={22} />
              {file ? (
                <div>
                  <div className="strong small">{file.name}</div>
                  <div className="tiny muted">{formatBytes(file.size)} • click to choose another</div>
                </div>
              ) : (
                <div>
                  <div className="strong small">Click or drop a PDF here</div>
                  <div className="tiny muted">PDF only, up to {MAX_MB} MB — large files are compressed on upload</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </div>
        )}

        {error && <p className="small" style={{ color: "var(--red)", marginBottom: 0 }}>{error}</p>}
      </form>
    </Modal>
  );
}
