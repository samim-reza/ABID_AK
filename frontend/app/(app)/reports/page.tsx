"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, formatDate, monthName } from "@/lib/format";
import { COMPANY } from "@/lib/brand";
import { printDocument, esc, amt } from "@/lib/print";
import type {
  Account, BalanceSheet, FiscalPeriod, GeneralLedger, IncomeStatement,
  ReportSection, TrialBalance,
} from "@/lib/types";
import { PageLoader } from "@/components/Spinner";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import ui from "@/components/ui.module.css";

type Tab = "trial" | "pl" | "bs" | "ledger" | "periods";
const TABS: { key: Tab; label: string }[] = [
  { key: "trial", label: "Trial Balance" },
  { key: "pl", label: "Profit & Loss" },
  { key: "bs", label: "Balance Sheet" },
  { key: "ledger", label: "General Ledger" },
  { key: "periods", label: "Fiscal Periods" },
];

function yearStart(): string { return `${new Date().getFullYear()}-01-01`; }
function today(): string { return new Date().toISOString().slice(0, 10); }

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("trial");
  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented wrap">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === "trial" && <TrialBalanceView />}
      {tab === "pl" && <IncomeStatementView />}
      {tab === "bs" && <BalanceSheetView />}
      {tab === "ledger" && <LedgerView />}
      {tab === "periods" && <PeriodsView />}
    </>
  );
}

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="row gap-8 wrap">
      <div className="field mb-0"><label className="tiny">From</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="field mb-0"><label className="tiny">To</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
    </div>
  );
}

// ---------- Trial Balance ----------

function TrialBalanceView() {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<TrialBalance>("/api/accounting/reports/trial-balance", { from_date: from, to_date: to }).then(setData).finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  function print() {
    if (!data) return;
    const body = `<table><thead><tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${data.rows.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="num">${amt(r.debit)}</td><td class="num">${amt(r.credit)}</td></tr>`).join("")}
      <tr class="total"><td colspan="2">Total (${esc(COMPANY.currency)})</td><td class="num">${amt(data.total_debit)}</td><td class="num">${amt(data.total_credit)}</td></tr>
      </tbody></table>`;
    printDocument("Trial Balance", `${formatDate(from)} — ${formatDate(to)}`, body);
  }

  const balanced = data && Math.abs(data.total_debit - data.total_credit) < 0.01;

  return (
    <div className="card">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button className="btn btn-ghost" onClick={print} disabled={!data}><Icon name="printer" size={16} /> Print</button>
      </div>
      {loading ? <PageLoader /> : !data ? null : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Code</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.account_id}>
                  <td className="small strong">{r.code}</td>
                  <td className="small">{r.name}</td>
                  <td className="num small">{r.debit ? money(r.debit) : ""}</td>
                  <td className="num small">{r.credit ? money(r.credit) : ""}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: "#f7f9fc", borderTop: "2px solid var(--navy)" }}>
                <td colSpan={2}>Total</td>
                <td className="num">{money(data.total_debit)}</td>
                <td className="num">{money(data.total_credit)}</td>
              </tr>
            </tbody>
          </table>
          <div className="small" style={{ marginTop: 10, textAlign: "right" }}>
            <span className={balanced ? "text-green strong" : "text-orange strong"}>
              {balanced ? "● Debits equal credits" : "● Trial balance does not tie — review postings"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Income Statement ----------

function SectionRows({ section }: { section: ReportSection }) {
  return (
    <>
      <tr className="subhead"><td colSpan={2} style={{ fontWeight: 700, background: "#eef1f6" }}>{section.title}</td></tr>
      {section.lines.map((l) => (
        <tr key={l.account_id}><td className="small" style={{ paddingLeft: 28 }}>{l.code} — {l.name}</td><td className="num small">{money(l.amount)}</td></tr>
      ))}
      <tr style={{ fontWeight: 600 }}><td style={{ paddingLeft: 28 }}>Total {section.title}</td><td className="num">{money(section.total)}</td></tr>
    </>
  );
}

function IncomeStatementView() {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<IncomeStatement>("/api/accounting/reports/income-statement", { from_date: from, to_date: to }).then(setData).finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  function print() {
    if (!data) return;
    const sec = (s: ReportSection) => `<tr class="subhead"><td colspan="2">${esc(s.title)}</td></tr>` +
      s.lines.map((l) => `<tr class="indent"><td>${esc(l.code)} — ${esc(l.name)}</td><td class="num">${amt(l.amount)}</td></tr>`).join("") +
      `<tr><td class="indent" style="font-weight:700">Total ${esc(s.title)}</td><td class="num" style="font-weight:700">${amt(s.total)}</td></tr>`;
    const body = `<table><tbody>${sec(data.income)}${sec(data.expenses)}
      <tr class="total"><td>Net ${data.net_profit >= 0 ? "Profit" : "Loss"} (${esc(COMPANY.currency)})</td><td class="num">${amt(Math.abs(data.net_profit))}</td></tr>
      </tbody></table>`;
    printDocument("Profit & Loss Statement", `${formatDate(from)} — ${formatDate(to)}`, body);
  }

  return (
    <div className="card">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button className="btn btn-ghost" onClick={print} disabled={!data}><Icon name="printer" size={16} /> Print</button>
      </div>
      {loading ? <PageLoader /> : !data ? null : (
        <div className="table-wrap">
          <table className="data">
            <tbody>
              <SectionRows section={data.income} />
              <SectionRows section={data.expenses} />
              <tr style={{ fontWeight: 800, background: "#f2f5fb", borderTop: "2px solid var(--navy)", fontSize: 15 }}>
                <td>Net {data.net_profit >= 0 ? "Profit" : "Loss"}</td>
                <td className="num" style={{ color: data.net_profit >= 0 ? "var(--green)" : "var(--red)" }}>{money(Math.abs(data.net_profit))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Balance Sheet ----------

function BalanceSheetView() {
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<BalanceSheet>("/api/accounting/reports/balance-sheet", { as_of: asOf }).then(setData).finally(() => setLoading(false));
  }, [asOf]);
  useEffect(load, [load]);

  function print() {
    if (!data) return;
    const sec = (s: ReportSection, extra?: { label: string; amount: number }) => `<tr class="subhead"><td colspan="2">${esc(s.title)}</td></tr>` +
      s.lines.map((l) => `<tr class="indent"><td>${esc(l.code)} — ${esc(l.name)}</td><td class="num">${amt(l.amount)}</td></tr>`).join("") +
      (extra ? `<tr class="indent"><td>${esc(extra.label)}</td><td class="num">${amt(extra.amount)}</td></tr>` : "");
    const totalEquity = data.equity.total + data.net_profit;
    const body = `<table><tbody>
      ${sec(data.assets)}
      <tr class="total"><td>Total Assets</td><td class="num">${amt(data.total_assets)}</td></tr>
      ${sec(data.liabilities)}
      ${sec(data.equity, { label: "Current-period earnings", amount: data.net_profit })}
      <tr><td style="font-weight:700;padding-left:26px">Total Equity</td><td class="num" style="font-weight:700">${amt(totalEquity)}</td></tr>
      <tr class="total"><td>Total Liabilities + Equity</td><td class="num">${amt(data.total_liabilities_equity)}</td></tr>
      </tbody></table>`;
    printDocument("Balance Sheet", `As at ${formatDate(asOf)}`, body);
  }

  const totalEquity = data ? data.equity.total + data.net_profit : 0;

  return (
    <div className="card">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <div className="field mb-0"><label className="tiny">As at</label><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <button className="btn btn-ghost" onClick={print} disabled={!data}><Icon name="printer" size={16} /> Print</button>
      </div>
      {loading ? <PageLoader /> : !data ? null : (
        <>
          {!data.balanced && <div className="badge badge-red" style={{ marginBottom: 12 }}>Sheet does not balance — check postings</div>}
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <SectionRows section={data.assets} />
                <tr style={{ fontWeight: 800, background: "#f2f5fb" }}><td>Total Assets</td><td className="num">{money(data.total_assets)}</td></tr>
                <SectionRows section={data.liabilities} />
                <tr className="subhead"><td colSpan={2} style={{ fontWeight: 700, background: "#eef1f6" }}>{data.equity.title}</td></tr>
                {data.equity.lines.map((l) => (
                  <tr key={l.account_id}><td className="small" style={{ paddingLeft: 28 }}>{l.code} — {l.name}</td><td className="num small">{money(l.amount)}</td></tr>
                ))}
                <tr><td className="small" style={{ paddingLeft: 28 }}>Current-period earnings</td><td className="num small">{money(data.net_profit)}</td></tr>
                <tr style={{ fontWeight: 600 }}><td style={{ paddingLeft: 28 }}>Total Equity</td><td className="num">{money(totalEquity)}</td></tr>
                <tr style={{ fontWeight: 800, background: "#f2f5fb", borderTop: "2px solid var(--navy)" }}>
                  <td>Total Liabilities + Equity</td><td className="num">{money(data.total_liabilities_equity)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- General Ledger ----------

function LedgerView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | "">("");
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<GeneralLedger | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Account[]>("/api/accounting/accounts", { postable_only: true }).then((a) => {
      setAccounts(a);
      if (a.length && accountId === "") setAccountId(a[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (accountId === "") return;
    setLoading(true);
    api.get<GeneralLedger>(`/api/accounting/reports/ledger/${accountId}`, { from_date: from, to_date: to }).then(setData).finally(() => setLoading(false));
  }, [accountId, from, to]);
  useEffect(load, [load]);

  function print() {
    if (!data) return;
    const body = `<p style="font-size:13px;margin:0 0 10px"><strong>${esc(data.code)} — ${esc(data.name)}</strong> · Opening balance ${amt(data.opening_balance, false)}</p>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Memo</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>
      ${data.lines.map((l) => `<tr><td>${esc(formatDate(l.date))}</td><td>${esc(l.entry_no)}</td><td>${esc(l.memo)}</td><td class="num">${amt(l.debit)}</td><td class="num">${amt(l.credit)}</td><td class="num">${amt(l.balance, false)}</td></tr>`).join("")}
      <tr class="total"><td colspan="5">Closing balance (${esc(COMPANY.currency)})</td><td class="num">${amt(data.closing_balance, false)}</td></tr>
      </tbody></table>`;
    printDocument("General Ledger", `${data.code} — ${data.name} · ${formatDate(from)} — ${formatDate(to)}`, body);
  }

  return (
    <div className="card">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <div className="row gap-8 wrap">
          <div className="field mb-0" style={{ minWidth: 240 }}>
            <label className="tiny">Account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        </div>
        <button className="btn btn-ghost" onClick={print} disabled={!data}><Icon name="printer" size={16} /> Print</button>
      </div>
      {loading ? <PageLoader /> : !data ? null : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Voucher</th><th>Memo</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              <tr style={{ background: "#f7f9fc" }}><td colSpan={5} className="small strong">Opening balance</td><td className="num small strong">{money(data.opening_balance)}</td></tr>
              {data.lines.map((l, i) => (
                <tr key={i}>
                  <td className="small">{formatDate(l.date)}</td>
                  <td className="small">{l.entry_no}</td>
                  <td className="small">{l.memo || <span className="muted">—</span>}</td>
                  <td className="num small">{l.debit ? money(l.debit) : ""}</td>
                  <td className="num small">{l.credit ? money(l.credit) : ""}</td>
                  <td className="num small strong">{money(l.balance)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: "#f7f9fc", borderTop: "2px solid var(--navy)" }}>
                <td colSpan={5}>Closing balance</td><td className="num">{money(data.closing_balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Fiscal Periods ----------

function PeriodsView() {
  const toast = useToast();
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<FiscalPeriod[]>("/api/accounting/periods", { year }).then(setPeriods).finally(() => setLoading(false));
  }, [year]);
  useEffect(load, [load]);

  const byMonth = useMemo(() => {
    const map = new Map<number, FiscalPeriod>();
    periods.forEach((p) => map.set(p.month, p));
    return map;
  }, [periods]);

  async function toggle(month: number, close: boolean) {
    setBusy(month);
    try {
      await api.post(`/api/accounting/periods/${year}/${month}/${close ? "close" : "reopen"}`);
      toast.success(close ? `${monthName(month)} closed.` : `${monthName(month)} reopened.`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="row between wrap gap-12" style={{ marginBottom: 14 }}>
        <div className="field mb-0">
          <label className="tiny">Year</label>
          <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[year + 1, year, year - 1, year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="small muted mb-0" style={{ maxWidth: 360 }}>
          Closing a month freezes its ledger — no entry can be posted, edited or voided in a closed period until it is reopened.
        </p>
      </div>
      {loading ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Period</th><th>Status</th>{user?.is_admin && <th></th>}</tr></thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const p = byMonth.get(m);
                const closed = p?.is_closed ?? false;
                return (
                  <tr key={m}>
                    <td className="small strong">{monthName(m)} {year}</td>
                    <td>
                      <span className={`badge ${closed ? "badge-red" : "badge-green"} tiny`}>
                        {closed ? "Closed" : "Open"}
                      </span>
                      {p?.closed_at && closed && <span className="muted tiny" style={{ marginLeft: 8 }}>on {formatDate(p.closed_at)}</span>}
                    </td>
                    {user?.is_admin && (
                      <td style={{ textAlign: "right" }}>
                        <button className={`btn btn-sm ${closed ? "btn-ghost" : "btn-navy"}`} disabled={busy === m} onClick={() => toggle(m, !closed)}>
                          <Icon name={closed ? "undo" : "lock"} size={14} /> {closed ? "Reopen" : "Close"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
