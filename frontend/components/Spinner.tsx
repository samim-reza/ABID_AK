export function PageLoader() {
  return (
    <div className="page-loader">
      <div className="spinner dark" style={{ width: 30, height: 30 }} />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="strong" style={{ fontSize: 15, marginBottom: 4 }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}
