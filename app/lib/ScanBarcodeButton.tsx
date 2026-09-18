"use client";

/**
 * Scan a specimen container's Lab ID and go straight to its order.
 *
 * Two ways in, because laboratories have both:
 *   - a handheld USB or Bluetooth scanner, which types the Lab ID into the
 *     focused box and presses Enter. Nothing special is needed for it; the box
 *     takes focus when the panel opens.
 *   - the phone camera. Where the browser has its own reader (Chrome on
 *     Android) that is used, because it costs no download. Everywhere else,
 *     including Safari on iPhone, the page decodes the picture itself with
 *     ZXing, pulled in only when someone asks for the camera.
 *
 * Deciding what a scan means lives in labIdScan.ts, where it is tested.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resolveLabIdScan,
  scanDestination,
  scanOutcomeMessage,
  type ScanIntent,
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
  intent = "results",
  busy = false,
  className = "",
}: {
  patients: ScanPatient[];
  /** "results" opens the sheet to type into; "receipts" is the cashier's. */
  intent?: ScanIntent;
  busy?: boolean;
  className?: string;
}) {
  const forReceipts = intent === "receipts";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [cameraState, setCameraState] = useState<"off" | "starting" | "on" | "failed">("off");
  const [cameraError, setCameraError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Stops whichever reader is running, native or ZXing. */
  const readerStopRef = useRef<(() => void) | null>(null);

  const stopCamera = useCallback(() => {
    if (readerStopRef.current) {
      try {
        readerStopRef.current();
      } catch (err) {
        console.error("Barcode reader would not stop cleanly", err);
      }
      readerStopRef.current = null;
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
      const dest = scanDestination(next, intent);

      // A cashier wants the receipts and nothing else, so any match goes
      // straight there. For the laboratory, a clean hit opens the sheet; a
      // scan with something worth reading first stops and says so.
      const goNow = dest && (forReceipts || (next.kind === "order" && !next.note));
      if (goNow) {
        stopCamera();
        close();
        router.push(dest);
        return;
      }
      stopCamera();
      window.setTimeout(readyForNextScan, 0);
    },
    [patients, router, stopCamera, close, intent, forReceipts]
  );

  /** Chrome on Android and friends: the browser reads the symbol for us. */
  async function startNativeReader(
    stream: MediaStream,
    video: HTMLVideoElement,
    onHit: (text: string) => void
  ): Promise<(() => void) | null> {
    const Reader = barcodeReaderConstructor();
    if (!Reader) return null;
    let reader: BarcodeReader;
    try {
      reader = new Reader({ formats: ["code_128", "code_39"] });
    } catch (err) {
      console.error("BarcodeDetector rejected those formats", err);
      try {
        reader = new Reader();
      } catch (err2) {
        console.error("BarcodeDetector could not be created", err2);
        return null;
      }
    }
    video.srcObject = stream;
    await video.play();
    const id = window.setInterval(async () => {
      const current = videoRef.current;
      if (!current || current.readyState < 2) return;
      try {
        const found = await reader.detect(current);
        const hit = found.find((code) => code.rawValue?.trim());
        if (hit) onHit(hit.rawValue);
      } catch (err) {
        console.error("Barcode read failed", err);
      }
    }, 400);
    return () => window.clearInterval(id);
  }

  /**
   * Safari on iPhone has no barcode reader of its own, so the page decodes the
   * camera picture itself. ZXing is imported here rather than at the top so it
   * is fetched only when someone actually asks for the camera.
   */
  async function startOwnReader(
    stream: MediaStream,
    video: HTMLVideoElement,
    onHit: (text: string) => void
  ): Promise<(() => void) | null> {
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map<number, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints as never, {
        delayBetweenScanAttempts: 200,
      });
      const controls = await reader.decodeFromStream(stream, video, (result, err) => {
        const text = result?.getText();
        if (text) {
          onHit(text);
          return;
        }
        // Not-found on a frame is the normal case while aiming, not an error.
        if (err && err.name && err.name !== "NotFoundException") {
          console.error("Barcode read failed", err);
        }
      });
      return () => controls.stop();
    } catch (err) {
      console.error("The page's own barcode reader could not start", err);
      return null;
    }
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("failed");
      setCameraError(
        "This browser gives the page no access to a camera. Use a handheld scanner, or type the Lab ID below."
      );
      return;
    }
    if (!window.isSecureContext) {
      setCameraState("failed");
      setCameraError(
        "A camera only works on a secure (https) address. Use a handheld scanner, or type the Lab ID below."
      );
      return;
    }

    setCameraState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (err) {
      console.error("Camera could not be started", err);
      const name = err instanceof DOMException ? err.name : "";
      stopCamera();
      setCameraState("failed");
      setCameraError(
        name === "NotAllowedError"
          ? "The camera was not allowed. Allow camera access for this site in the browser, then tap Use camera again."
          : name === "NotFoundError"
            ? "This device has no camera the browser can use. Use a handheld scanner, or type the Lab ID below."
            : "The camera could not be started. Use a handheld scanner, or type the Lab ID below."
      );
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stopCamera();
      return;
    }

    try {
      const stop =
        (await startNativeReader(stream, video, act)) ?? (await startOwnReader(stream, video, act));
      if (!stop) {
        stopCamera();
        setCameraState("failed");
        setCameraError(
          "The barcode reader could not be loaded. Check the connection and try again, or type the Lab ID below."
        );
        return;
      }
      readerStopRef.current = stop;
      setCameraState("on");
    } catch (err) {
      console.error("The camera started but the reader did not", err);
      stopCamera();
      setCameraState("failed");
      setCameraError(
        "The camera started but the barcode reader did not. Use a handheld scanner, or type the Lab ID below."
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
        {forReceipts ? "Scan a receipt" : "Scan barcode"}
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
              {forReceipts ? "Scan a receipt" : "Scan a specimen"}
            </h2>
            <p className="mt-2 text-sm text-lf-ink-2">
              {forReceipts
                ? "Scan the barcode on the patient's receipt with a handheld scanner, or type the Lab ID in. This opens their receipts."
                : "Scan the Lab ID barcode on the container with a handheld scanner, or type it in. This opens the sheet so the result can be entered."}
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
                  {forReceipts ? "Open receipts" : "Open results"}
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

            <div className={cameraState === "on" || cameraState === "starting" ? "mt-4" : "sr-only"}>
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full rounded-lf-md bg-black"
                aria-label="Camera view for scanning a barcode"
              />
              <p className="mt-2 text-sm text-lf-ink-2">
                {cameraState === "starting"
                  ? "Starting the camera..."
                  : "Hold the container so the barcode fills the frame."}
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
                      router.push(`/orders/${order.orderId}?enter=1`);
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
