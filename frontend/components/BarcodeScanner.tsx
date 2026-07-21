"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Icon from "./Icons";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

// Uses the native BarcodeDetector API where available (Chrome/Edge/Android).
// Falls back to manual entry when the API or camera is unavailable.
export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const AnyWin = window as unknown as { BarcodeDetector?: any };

    async function start() {
      if (!AnyWin.BarcodeDetector) {
        setSupported(false);
        setError("Live scanning is not supported on this browser. Enter the code manually below.");
        return;
      }
      try {
        const detector = new AnyWin.BarcodeDetector({
          formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf"],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              finish(codes[0].rawValue);
              return;
            }
          } catch {
            /* frame not ready */
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch {
        setError("Could not access the camera. Check permissions or enter the code manually.");
      }
    }

    function finish(code: string) {
      cleanup();
      onDetected(code);
    }

    function cleanup() {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }

    start();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Scan Barcode / QR" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {supported && !error && (
          <div
            style={{
              position: "relative", background: "#0a1a35", borderRadius: 12,
              overflow: "hidden", aspectRatio: "4/3",
            }}
          >
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div
              style={{
                position: "absolute", inset: "18% 12%", border: "3px solid var(--orange)",
                borderRadius: 12, boxShadow: "0 0 0 999px rgba(10,26,53,0.35)",
              }}
            />
          </div>
        )}
        {error && (
          <div className="badge badge-amber" style={{ padding: "10px 14px", display: "block" }}>
            {error}
          </div>
        )}
        <div className="row gap-8">
          <div className="grow">
            <input
              className="input"
              placeholder="Or type the barcode value"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!manual.trim()}
            onClick={() => onDetected(manual.trim())}
          >
            <Icon name="check" size={16} /> Use
          </button>
        </div>
        <p className="tiny muted mb-0">
          Point the camera at a barcode or QR code. Detection is automatic.
        </p>
      </div>
    </Modal>
  );
}
