"use client";

import { money } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/types";
import styles from "./ui.module.css";

interface BarItem {
  label: string;
  value: number;
  color: string;
}

export function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ padding: "8px 0 10px" }}>
      {items.map((it) => (
        <div className={styles.barRow} key={it.label}>
          <div className="nm" title={it.label}>{it.label}</div>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${(it.value / max) * 100}%`, background: it.color }} />
          </div>
          <div className="amt">{money(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

// Lightweight grouped-bar trend chart rendered as inline SVG (no dependencies).
export function TrendChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) {
    return <div className="empty small">No data yet for a trend.</div>;
  }
  const points = data.slice(-8);
  const w = 720;
  const h = 240;
  const padX = 40;
  const padY = 26;
  const max = Math.max(...points.flatMap((p) => [p.expenses, p.salaries]), 1);
  const groupW = (w - padX * 2) / points.length;
  const barW = Math.min(18, groupW / 3.2);

  const y = (v: number) => h - padY - (v / max) * (h - padY * 2);

  const series: [keyof MonthlyPoint, string][] = [
    ["expenses", "var(--orange)"],
    ["salaries", "var(--navy)"],
  ];

  return (
    <div className={styles.chartCard}>
      <div className={styles.legend}>
        <span><i style={{ background: "var(--orange)" }} /> Expenses (incl. VAT)</span>
        <span><i style={{ background: "var(--navy)" }} /> Salaries</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)} stroke="#eef1f6" />
              <text x={4} y={y(max * f) + 4} fontSize="10" fill="#94a3b8">{money(max * f)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const gx = padX + i * groupW + groupW / 2;
            return (
              <g key={`${p.year}-${p.month}`}>
                {series.map(([key, color], si) => {
                  const v = p[key] as number;
                  const bx = gx - barW - 2 + si * (barW + 4);
                  return (
                    <rect
                      key={key} x={bx} y={y(v)} width={barW} height={h - padY - y(v)}
                      rx={4} fill={color}
                    >
                      <title>{`${p.label} · ${key}: SAR ${money(v)}`}</title>
                    </rect>
                  );
                })}
                <text x={gx} y={h - 8} fontSize="10.5" fill="#64748b" textAnchor="middle">
                  {p.label.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
