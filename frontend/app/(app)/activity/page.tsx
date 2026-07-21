"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime, timeAgo, initials } from "@/lib/format";
import type { Activity, Page } from "@/lib/types";
import { PageLoader, EmptyState } from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import ui from "@/components/ui.module.css";

const ACTION_STYLE: Record<string, string> = {
  created: "badge-green", updated: "badge-amber", deleted: "badge-red", login: "badge-navy",
};
const ENTITIES = ["", "expense", "salary", "person", "user", "auth"];

export default function ActivityPage() {
  const [data, setData] = useState<Page<Activity> | null>(null);
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Page<Activity>>("/api/activity", { entity: entity || undefined, page, page_size: 25 })
      .then(setData).finally(() => setLoading(false));
  }, [entity, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [entity]);

  return (
    <>
      <div className={ui.toolbar}>
        <div className="segmented">
          {ENTITIES.map((e) => (
            <button key={e || "all"} className={entity === e ? "active" : ""} onClick={() => setEntity(e)}>
              {e ? e[0].toUpperCase() + e.slice(1) + "s" : "All"}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : (
        <div className="card">
          {!data || data.items.length === 0 ? (
            <EmptyState title="No activity yet" hint="Actions across the system will appear here." />
          ) : (
            <>
              <div>
                {data.items.map((a) => (
                  <div key={a.id} className="row gap-12" style={{ padding: "14px 20px", borderBottom: "1px solid #eef1f6" }}>
                    <div className="avatar" style={{ background: "var(--navy)" }}>{initials(a.username)}</div>
                    <div className="grow">
                      <div className="row gap-8 wrap">
                        <span className="strong small">{a.username}</span>
                        <span className={`badge ${ACTION_STYLE[a.action] ?? "badge-gray"}`}>{a.action}</span>
                        <span className="badge badge-gray">{a.entity}</span>
                      </div>
                      <div className="small muted" style={{ marginTop: 3 }}>{a.description}</div>
                    </div>
                    <div className="tiny muted" title={formatDateTime(a.created_at)} style={{ whiteSpace: "nowrap" }}>
                      {timeAgo(a.created_at)}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
            </>
          )}
        </div>
      )}
    </>
  );
}
