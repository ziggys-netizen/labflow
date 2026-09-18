"use client";

/**
 * Scan a specimen container's Lab ID and go straight to its order.
 *
 * Two ways in, because laboratories have both:
 *   - a handheld USB or Bluetooth scanner, which types the Lab ID into the
 *     focused box and presses Enter. Nothing special is needed for it; the box
 *     takes focus when the panel opens.
 *   - the phone camera, through the browser's own BarcodeDetector. Where the
 *     browser has no such reader the panel says so plainly and the handheld
 *     and typed paths still work.
 *
 * Deciding what a scan means lives in labIdScan.ts, where it is tested.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resolveLabIdScan,
  scanOutcomeMessage,
  type ScanOutcome,
  type ScanPatient,
} from "./labIdScan";

type DetectedBarcode = { rawValue: string };
type BarcodeReader = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeReaderConstructor = new (options?: { formats?: string[] }) => BarcodeReader;

function barcodeReaderConstructor(): BarcodeReaderConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeReaderConstructor })
    .BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

export default function ScanBarcodeButton({
  patients,
  busy = false,
  className = "",
}: {
  patients: ScanPatient[];
  busy?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [cameraState, setCameraState] = useState<"off" | "starting" | "on" | "failed">("off");
  const [cameraError, setCameraError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("off");
  }, []);

  const close = useCallback(() => {
    stopCamera();
    setOpen(false);
    setTyped("");
    setOutcome(null);
    setCameraError("");
  }, [stopCamera]);

  // Camera and interval must not outlive the panel.
  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /** The bench scans one container after another, so the box takes the next one. */
  function readyForNextScan() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }

  const act = useCallback(
    (raw: string) => {
      const next = resolveLabIdScan(raw, patients);
      setOutcome(next);
      // A clean hit goes straight to the order. Everything else stays put with
      // its reason on screen, and the box takes the next scan.
      if (next.kind === "order" && !next.note) {
        stopCamera();
        close();
        router.push(`/orders/${next.orderId}`);
        return;
      }
      stopCamera();
      window.setTimeout(readyForNextScan, 0);
    },
    [patients, router, stopCamera, close]
  );

  async function startCamera() {
    setCameraError("");
    const Reader = barcodeReaderConstructor();
    if (!Reader) {
      setCameraState("failed");
      setCameraError(
        "This browser cannot read a barcode with the camera. Use a handheld scanner, or type the Lab ID below. Chrome on Android can read it."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("failed");
      setCameraError("This browser gives no access to a camera. Type the Lab ID below instead.");
      return;
    }

    setCameraState("starting");
    let reader: BarcodeReader;
    try {
      reader = new Reader({ formats: ["code_128"] });
    } catch (err) {
      console.error("BarcodeDetector rejected the Code 128 format", err);
      try {
        reader = new Reader();
      } catch (err2) {
        console.error("BarcodeDetector could not be created", err2);
        setCameraState("failed");
        setCameraError("This browser's barcode reader would not start. Type the Lab ID below instead.");
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCameraState("on");

      loopRef.current = window.setInterval(async () => {
        const current = videoRef.current;
        if (!current || current.readyState < 2) return;
        try {
          const found = await reader.detect(current);
          const hit = found.find((code) => code.rawValue?.trim());
          if (hit) act(hit.rawValue);
        } catch (err) {
          console.error("Barcode read failed", err);
        }
      }, 400);
    } catch (err) {
      console.error("Camera could not be started", err);
      const name = err instanceof DOMException ? err.name : "";
      stopCamera();
      setCameraState("failed");
      setCameraError(
        name === "NotAllowedError"
          ? "The camera was not allowed. Allow camera access for this site in the browser, or type the Lab ID below."
          : name === "NotFoundError"
            ? "This device has no camera the browser can use. Use a handheld scanner, or type the Lab ID below."
            : "The camera could not be started. Use a handheld scanner, or type the Lab ID below."
      );
    }
  }

  const message = outcome ? scanOutcomeMessage(outcome) : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={
          className ||
          "lf-touch inline-flex w-full items-center justify-center gap-2 rounded-lf-md border border-lf-accent px-4 text-sm font-medium text-lf-accent disabled:opacity-50 sm:w-auto"
        }
      >
        <BarcodeGlyph />
        Scan barcode
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-barcode-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lf-md bg-lf-surface p-6 shadow-lg"
          >
            <h2 id="scan-barcode-title" className="text-lg font-semibold text-lf-ink">
              Scan a specimen
            </h2>
            <p className="mt-2 text-sm text-lf-ink-2">
              Scan the Lab ID barcode on the container with a handheld scanner, or type it in. This
              opens the order so the result can be entered.
            </p>

            <form
              className="mt-4 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(typed);
              }}
            >
              <label htmlFor="scan-lab-id" className="text-sm font-medium text-lf-ink">
                Lab ID
              </label>
              <input
                id="scan-lab-id"
                ref={inputRef}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setOutcome(null);
                }}
                placeholder="LF-20260918-4A7C"
                autoComplete="off"
                spellCheck={false}
                className="lf-num lf-touch w-full min-w-0 rounded-lf-md border border-lf-line bg-lf-surface px-3 text-sm text-lf-ink"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent"
                >
                  Open order
                </button>
                {cameraState === "on" ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line px-4 text-sm font-medium text-lf-ink"
                  >
                    Stop camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={cameraState === "starting"}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line px-4 text-sm font-medium text-lf-ink disabled:opacity-50"
                  >
                    {cameraState === "starting" ? "Starting camera..." : "Use camera"}
                  </button>
                )}
              </div>
            </form>

            <div className={cameraState === "on" ? "mt-4" : "sr-only"}>
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full rounded-lf-md bg-black"
                aria-label="Camera view for scanning a barcode"
              />
              <p className="mt-2 text-sm text-lf-ink-2">
                Hold the container so the barcode fills the frame.
              </p>
            </div>

            {cameraError && (
              <p className="mt-4 rounded-lf-md border border-lf-warn bg-lf-warn-soft p-3 text-sm text-lf-ink">
                <span className="font-medium">Camera: </span>
                {cameraError}
              </p>
            )}

            {outcome && outcome.kind === "choose" && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-sm text-lf-ink">{message}</p>
                {outcome.orders.map((order) => (
                  <button
                    key={order.orderId}
                    type="button"
                    onClick={() => {
                      close();
                      router.push(`/orders/${order.orderId}`);
                    }}
                    className="lf-touch inline-flex items-center justify-between rounded-lf-md border border-lf-line px-4 text-sm font-medium text-lf-ink hover:bg-lf-surface-2"
                  >
                    <span>{order.label}</span>
                    <span className="text-lf-accent">Enter results</span>
                  </button>
                ))}
              </div>
            )}

            {outcome && outcome.kind === "order" && outcome.note && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="rounded-lf-md border border-lf-line bg-lf-surface-2 p-3 text-sm text-lf-ink">
                  {message}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const orderId = outcome.orderId;
                    close();
                    router.push(`/orders/${orderId}`);
                  }}
                  className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent"
                >
                  Open the order
                </button>
              </div>
            )}

            {outcome && (outcome.kind === "unknown" || outcome.kind === "not_a_lab_id") && (
              <p className="mt-4 rounded-lf-md border border-lf-crit bg-lf-crit-soft p-3 text-sm text-lf-ink">
                <span className="font-medium">Not found: </span>
                {message}
              </p>
            )}

            {outcome && outcome.kind === "patient_only" && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="rounded-lf-md border border-lf-line bg-lf-surface-2 p-3 text-sm text-lf-ink">
                  {message}
                </p>
                {outcome.patientId && (
                  <button
                    type="button"
                    onClick={() => {
                      const patientId = outcome.patientId!;
                      close();
                      router.push(`/patients/${patientId}`);
                    }}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line px-4 text-sm font-medium text-lf-ink"
                  >
                    Open the patient record
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line px-4 text-sm font-medium text-lf-ink-2 hover:bg-lf-surface-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BarcodeGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 3v10M5 3v10M8 3v10M11.5 3v10M14 3v10" />
    </svg>
  );
}
