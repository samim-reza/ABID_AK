"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/brand";
import Icon from "@/components/Icons";
import styles from "./landing.module.css";

export default function LandingPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* ---------- Brand / marketing panel ---------- */}
      <aside className={styles.brand}>
        <div className={styles.brandTop}>
          <div className={styles.logoBadge}>
            <img src="/brand/logo.png" alt="ABID AK logo" />
          </div>
          <div>
            <div className={styles.companyName}>ABID AK Contracting</div>
            <div className={styles.companyAr}>{COMPANY.nameArabic}</div>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroMain}>
            <span className={styles.crPill}>
              <Icon name="building" size={14} /> C.R {COMPANY.cr}
            </span>
            <h1 className={styles.heroTitle}>
              Expense, VAT &amp; <span className={styles.accent}>Payroll</span> Management
            </h1>
            <p className={styles.heroSub}>
              One dashboard for every riyal — track team expenses by person and category,
              apply 15% VAT with a tap, and manage monthly salaries across all departments.
            </p>

            <div className={styles.ceoCard}>
              <div className={styles.ceoAvatar}>AC</div>
              <div>
                <div className={styles.ceoName}>{COMPANY.ceoName}</div>
                <div className={styles.ceoRole}>{COMPANY.ceoRole}</div>
              </div>
            </div>

            <div className={styles.contactRow}>
              <span className={styles.contactItem}><Icon name="phone" size={15} /> {COMPANY.phone}</span>
              <span className={styles.contactItem}><Icon name="mail" size={15} /> {COMPANY.email}</span>
              <span className={styles.contactItem}><Icon name="globe" size={15} /> {COMPANY.website}</span>
              <span className={styles.contactItem}><Icon name="pin" size={15} /> {COMPANY.address}</span>
            </div>
          </div>

          <div className={styles.qrBlock}>
            <div className={styles.qrBox}>
              <img src="/brand/qr.png" alt="Company contact QR code" />
            </div>
            <div className={styles.qrText}>
              Scan to connect with ABID AK Contracting Company on WhatsApp.
            </div>
          </div>
        </div>
      </aside>

      {/* ---------- Login panel ---------- */}
      <main className={styles.login}>
        <div className={styles.loginCard}>
          <div className={styles.mobileLogo}>
            <img src="/brand/logo.png" alt="ABID AK logo" />
            <div className={styles.companyName}>ABID AK Contracting Company</div>
          </div>

          <div className={styles.loginHead}>
            <h2>Welcome back</h2>
            <p>Sign in to the company expense management portal.</p>
          </div>

          <form onSubmit={onSubmit}>
            {error && <div className={styles.errorBox}>{error}</div>}
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username" className="input" autoComplete="username"
                value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="admin" required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password" className="input" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ marginTop: 6 }}>
              {submitting ? <span className="spinner" /> : "Sign in"}
            </button>
          </form>

          <div className={styles.mobileInfo}>
            <div className={styles.ceoCard}>
              <div className={styles.ceoAvatar}>AC</div>
              <div>
                <div className={styles.ceoName}>{COMPANY.ceoName}</div>
                <div className={styles.ceoRole}>{COMPANY.ceoRole}</div>
              </div>
            </div>

            <div className={styles.contactRow}>
              <span className={styles.contactItem}><Icon name="phone" size={15} /> {COMPANY.phone}</span>
              <span className={styles.contactItem}><Icon name="mail" size={15} /> {COMPANY.email}</span>
              <span className={styles.contactItem}><Icon name="globe" size={15} /> {COMPANY.website}</span>
              <span className={styles.contactItem}><Icon name="pin" size={15} /> {COMPANY.address}</span>
            </div>

            <div className={styles.qrBlock}>
              <div className={styles.qrBox}>
                <img src="/brand/qr.png" alt="Company contact QR code" />
              </div>
              <div className={styles.qrText}>
                Scan to connect with ABID AK Contracting Company on WhatsApp.
              </div>
            </div>
          </div>

          <div className={styles.footNote}>
            © {new Date().getFullYear()} {COMPANY.name} · {COMPANY.fullAddress}
          </div>
        </div>
      </main>
    </div>
  );
}
