"use client";

import Modal from "./Modal";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export default function Confirm({ title, message, confirmLabel = "Delete", onConfirm, onClose, busy }: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner dark" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p className="mb-0" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}
