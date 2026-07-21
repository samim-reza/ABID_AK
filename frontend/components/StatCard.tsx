import Icon from "./Icons";
import styles from "./ui.module.css";

interface Props {
  label: string;
  value: string;
  icon: string;
  tint: string;
  currency?: boolean;
  foot?: string;
}

export default function StatCard({ label, value, icon, tint, currency, foot }: Props) {
  return (
    <div className={styles.stat}>
      <div className={styles.icon} style={{ background: `${tint}1a`, color: tint }}>
        <Icon name={icon} size={22} />
      </div>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {currency && <span className="cur">SAR</span>}
        {value}
      </div>
      {foot && <div className={styles.foot}>{foot}</div>}
    </div>
  );
}
