"use client";

import Icon from "./Icons";

interface Props {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pages, total, onChange }: Props) {
  if (total === 0) return null;
  return (
    <div className="row between" style={{ padding: "14px 16px", flexWrap: "wrap", gap: 10 }}>
      <span className="small muted">
        {total} record{total === 1 ? "" : "s"} • page {page} of {Math.max(pages, 1)}
      </span>
      <div className="row gap-8">
        <button
          className="btn btn-ghost btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <Icon name="chevronL" size={15} /> Prev
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next <Icon name="chevronR" size={15} />
        </button>
      </div>
    </div>
  );
}
