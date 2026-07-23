"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { NAV, COMPANY } from "@/lib/brand";
import { initials } from "@/lib/format";
import { PageLoader } from "@/components/Spinner";
import Icon from "@/components/Icons";
import styles from "./shell.module.css";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Dashboard", sub: "Company financial overview" },
  "/expenses": { title: "Expenses", sub: "Track office-staff spending by section" },
  "/persons": { title: "Office Staff", sub: "Team, monthly salaries & iqama tracking" },
  "/workers": { title: "Workers", sub: "Manpower by company & project" },
  "/salaries": { title: "Payroll", sub: "Monthly worker salary records" },
  "/invoices": { title: "Invoice Archive", sub: "Company invoice PDFs with 15% VAT" },
  "/accounts": { title: "Chart of Accounts", sub: "The account tree behind every ledger posting" },
  "/journal": { title: "General Journal", sub: "Double-entry vouchers — the audit source of truth" },
  "/reports": { title: "Financial Reports", sub: "Trial balance, P&L, balance sheet & ledger" },
  "/activity": { title: "Activity Log", sub: "Recent actions across the system" },
  "/users": { title: "System Users", sub: "Portal access management" },
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) return <PageLoader />;

  const meta = TITLES[pathname] ?? { title: "ABID AK", sub: "" };
  const items = NAV.filter((n) => !n.adminOnly || user.is_admin);

  return (
    <div className={styles.shell}>
      <div className={`${styles.scrim} ${open ? styles.show : ""}`} onClick={() => setOpen(false)} />

      <aside className={`${styles.sidebar} ${open ? styles.open : ""}`}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <img src="/brand/logo.png" alt="ABID AK" />
          </div>
          <div className={styles.brandText}>
            <div className="t1">ABID AK</div>
            <div className="t2">Contracting Co.</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <div key={item.href}>
                {item.group && <div className={styles.navGroup}>{item.group}</div>}
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${item.accent ? styles[item.accent] : ""} ${active ? styles.active : ""}`}
                >
                  <Icon name={item.icon} size={19} />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className={styles.sideFoot}>
          <div className={styles.userChip}>
            <div className="av">{initials(user.full_name || user.username)}</div>
            <div className="grow">
              <div className="nm">{user.full_name || user.username}</div>
              <div className="rl">{user.is_admin ? "Administrator" : "Member"}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out"
              style={{ padding: 8, background: "rgba(255,255,255,0.08)", borderColor: "transparent", color: "#fff" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className="row gap-12">
            <button className={styles.menuBtn} onClick={() => setOpen(true)} aria-label="Menu">
              <Icon name="grid" size={18} />
            </button>
            <div>
              <h1>{meta.title}</h1>
              <div className={styles.topSub}>{meta.sub}</div>
            </div>
          </div>
          <div className="row gap-8">
            <span className="badge badge-navy" title="Company registration">C.R {COMPANY.cr}</span>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
