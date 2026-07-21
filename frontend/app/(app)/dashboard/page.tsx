"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money, sar, accentFor } from "@/lib/format";
import type { DashboardStats, MonthlyPoint } from "@/lib/types";
import StatCard from "@/components/StatCard";
import { BarList, TrendChart } from "@/components/Charts";
import { PageLoader, EmptyState } from "@/components/Spinner";
import MonthYearFilter from "@/components/MonthYearFilter";
import ui from "@/components/ui.module.css";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<number[]>("/api/dashboard/periods").then(setYears).catch(() => {});
    api.get<MonthlyPoint[]>("/api/dashboard/monthly").then(setMonthly).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get<DashboardStats>("/api/dashboard/stats", { month: month || undefined, year: year || undefined })
      .then(setStats)
      .finally(() => setLoading(false));
  }, [month, year]);

  if (loading && !stats) return <PageLoader />;
  if (!stats) return null;

  return (
    <>
      <div className="row between wrap gap-12" style={{ marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Financial Overview</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {month || year ? "Filtered view" : "All-time totals across the company"}
          </p>
        </div>
        <MonthYearFilter month={month} year={year} years={years} onMonth={setMonth} onYear={setYear} />
      </div>

      <div className={ui.statGrid}>
        <StatCard label="Total Expenses" value={money(stats.grand_total)} icon="receipt" tint="#f26f21"
          currency foot={`${stats.expense_count} entries · base ${sar(stats.total_expenses)}`} />
        <StatCard label="Total VAT (15%)" value={money(stats.total_vat)} icon="cash" tint="#d98a0b"
          currency foot="Recoverable input VAT" />
        <StatCard label="Salaries Paid" value={money(stats.total_salaries)} icon="wallet" tint="#1b356b"
          currency foot={`${stats.salary_count} payments`} />
        <StatCard label="People" value={String(stats.person_count)} icon="users" tint="#1f9d63"
          foot="Active & inactive team members" />
      </div>

      <div className={ui.grid2} style={{ marginTop: 18 }}>
        <div className="card">
          <div className={ui.panelHead}>
            <h3>Monthly Trend</h3>
            <span className="badge badge-gray">Last periods</span>
          </div>
          <TrendChart data={monthly} />
        </div>

        <div className="card">
          <div className={ui.panelHead}>
            <h3>Top Spenders</h3>
            <span className="badge badge-gray">By person</span>
          </div>
          {stats.top_persons.filter((p) => p.grand_total > 0).length === 0 ? (
            <EmptyState title="No expenses yet" hint="Add expenses to see the ranking." />
          ) : (
            <BarList
              items={stats.top_persons
                .filter((p) => p.grand_total > 0)
                .map((p) => ({ label: p.name, value: p.grand_total, color: accentFor(p.name) }))}
            />
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className={ui.panelHead}>
          <h3>Spending by Category</h3>
          <span className="badge badge-gray">All sections</span>
        </div>
        {stats.top_categories.length === 0 ? (
          <EmptyState title="No categories yet" hint="Categories appear as you log expenses." />
        ) : (
          <BarList
            items={stats.top_categories.map((c) => ({
              label: c.category, value: c.grand_total, color: accentFor(c.category),
            }))}
          />
        )}
      </div>
    </>
  );
}
