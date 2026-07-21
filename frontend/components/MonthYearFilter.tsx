"use client";

import { MONTHS } from "@/lib/format";

interface Props {
  month: number | "";
  year: number | "";
  years: number[];
  onMonth: (m: number | "") => void;
  onYear: (y: number | "") => void;
}

export default function MonthYearFilter({ month, year, years, onMonth, onYear }: Props) {
  const yearList = years.length ? years : [new Date().getFullYear()];
  return (
    <div className="row gap-8">
      <select
        className="select"
        style={{ width: "auto" }}
        value={month}
        onChange={(e) => onMonth(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">All months</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        className="select"
        style={{ width: "auto" }}
        value={year}
        onChange={(e) => onYear(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">All years</option>
        {yearList.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
