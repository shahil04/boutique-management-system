"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Expand,
  Loader2,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  OcrExtractionResult,
  OcrVerificationStatus,
} from "@/lib/types";

interface SlipCaptureViewerProps {
  slipPhotoUrl: string;
  ocrConfidence: OcrVerificationStatus;
  verifiedBy: string;
  uncertainFields: string[];
  rawSummary: string;
  hasEnvGeminiKey: boolean;
  sessionGeminiKey: string;
  onChangeSlipUrl: (url: string) => void;
  onExtractionComplete: (result: OcrExtractionResult) => void;
  onChangeVerification: (
    status: OcrVerificationStatus,
    verifiedBy: string
  ) => void;
  onOpenSettings: () => void;
}

export default function SlipCaptureViewer({
  slipPhotoUrl,
  ocrConfidence,
  verifiedBy,
  uncertainFields,
  rawSummary,
  hasEnvGeminiKey,
  sessionGeminiKey,
  onChangeSlipUrl,
  onExtractionComplete,
  onChangeVerification,
  onOpenSettings,
}: SlipCaptureViewerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [missingKeyError, setMissingKeyError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [showRawText, setShowRawText] = useState(false);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setOcrError("");
    setMissingKeyError(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "slip");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Upload failed");
      }
      setZoom(1);
      setRotation(0);
      onChangeSlipUrl(json.url);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
    e.target.value = "";
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWebcamOpen(false);
  };

  const startWebcam = async () => {
    setWebcamError("");
    setWebcamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setWebcamError(
        err instanceof Error
          ? `Camera unavailable (${err.message}). Use "Snap / Upload Photo" instead.`
          : "Camera unavailable. Use Upload Photo instead."
      );
    }
  };

  const captureWebcamFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    stopWebcam();

    setUploading(true);
    setOcrError("");
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, prefix: "slip" }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Could not save captured photo");
      }
      setZoom(1);
      setRotation(0);
      onChangeSlipUrl(json.url);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Failed to save capture");
    } finally {
      setUploading(false);
    }
  };

  const handleRunOcr = async () => {
    if (!slipPhotoUrl) return;
    setScanning(true);
    setOcrError("");
    setMissingKeyError(false);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionGeminiKey.trim()) {
        headers["x-gemini-api-key"] = sessionGeminiKey.trim();
      }
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers,
        body: JSON.stringify({ slipUrl: slipPhotoUrl }),
      });
      const json = (await res.json()) as {
        extraction?: OcrExtractionResult;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.extraction) {
        if (json.code === "MISSING_API_KEY") {
          setMissingKeyError(true);
        }
        throw new Error(json.error || "AI Vision extraction failed");
      }
      onExtractionComplete(json.extraction);
    } catch (err) {
      setOcrError(
        err instanceof Error ? err.message : "AI Vision extraction failed"
      );
    } finally {
      setScanning(false);
    }
  };

  const aiReady = hasEnvGeminiKey || Boolean(sessionGeminiKey.trim());

  return (
    <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#1f1a1c]">
            1. Tailoring Slip Photo (Double-Safety Reference)
          </h3>
          <p className="text-xs text-[#6d6265]">
            Snap or upload the paper slip, auto-fill with Gemini AI, and verify side-by-side.
          </p>
        </div>
        {ocrConfidence === "verified" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
          </span>
        ) : ocrConfidence === "ai_extracted" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200">
            <Sparkles className="h-3.5 w-3.5" /> AI Extracted — Verify
          </span>
        ) : null}
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Capture Buttons */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5b1e31] px-3 py-2 text-xs font-medium text-white hover:bg-[#471625] disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5" />
          Phone Cam
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={startWebcam}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-3 py-2 text-xs font-medium text-[#1f1a1c] hover:border-[#5b1e31] disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5 text-[#5b1e31]" />
          Live Cam
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => uploadInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-3 py-2 text-xs font-medium text-[#1f1a1c] hover:border-[#5b1e31] disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5 text-[#5b1e31]" />
          {uploading ? "Uploading..." : "Upload File"}
        </button>
      </div>

      {/* Viewer Box */}
      {slipPhotoUrl ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-[#e6ddd0] bg-[#1a1617]">
            <div className="flex items-center justify-between border-b border-white/10 bg-black/50 px-3 py-1.5 text-white">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
                  className="rounded p-1 hover:bg-white/15"
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-10 text-center text-[11px] font-mono">
                  {zoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
                  className="rounded p-1 hover:bg-white/15"
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="ml-1 rounded p-1 hover:bg-white/15"
                  title="Rotate 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="rounded p-1 hover:bg-white/15"
                  title="Full screen"
                >
                  <Expand className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeSlipUrl("");
                    onChangeVerification("none", "");
                  }}
                  className="rounded p-1 text-red-300 hover:bg-white/15"
                  title="Remove slip photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-auto p-2 flex items-center justify-center">
              <img
                src={slipPhotoUrl}
                alt="Tailoring slip reference"
                className="max-h-64 w-auto object-contain transition-transform duration-150"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              />
            </div>
          </div>

          {/* Gemini AI Extraction Action */}
          <div className="rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#b47b2b]" />
                <span className="text-xs font-semibold text-[#1f1a1c]">
                  Gemini Vision OCR (Hindi + English)
                </span>
              </div>
              <button
                type="button"
                disabled={scanning}
                onClick={handleRunOcr}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#b47b2b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9c6820] disabled:opacity-60"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reading Slip...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Extract from Photo
                  </>
                )}
              </button>
            </div>

            {!aiReady && !ocrError && (
              <p className="mt-2 text-[11px] text-[#6d6265]">
                No Gemini API key detected yet.{" "}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="font-semibold text-[#5b1e31] underline"
                >
                  Add key in Settings
                </button>{" "}
                for AI handwriting OCR, or read the slip above and type fields directly.
              </p>
            )}

            {ocrError && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <p>{ocrError}</p>
                {missingKeyError && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-1 font-semibold underline"
                  >
                    Open Settings to paste Gemini API key →
                  </button>
                )}
              </div>
            )}

            {uncertainFields.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Double-check handwriting for:
                </div>
                <p className="mt-0.5 text-[11px]">
                  {uncertainFields.join(", ")}
                </p>
              </div>
            )}

            {rawSummary && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowRawText((v) => !v)}
                  className="text-[11px] font-medium text-[#5b1e31] underline"
                >
                  {showRawText ? "Hide AI transcription" : "View AI transcription"}
                </button>
                {showRawText && (
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-[#e6ddd0] bg-white p-2 text-[11px] text-[#4a4043]">
                    {rawSummary}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Double-Safety Verification Bar */}
          <div className="rounded-xl border border-[#e6ddd0] bg-[#fdfbf8] p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={ocrConfidence === "verified"}
                onChange={(e) =>
                  onChangeVerification(
                    e.target.checked
                      ? "verified"
                      : rawSummary
                      ? "ai_extracted"
                      : "none",
                    verifiedBy
                  )
                }
                className="mt-0.5 h-4 w-4 rounded border-[#cfc2b2] accent-[#5b1e31]"
              />
              <div className="flex-1">
                <span className="text-xs font-semibold text-[#1f1a1c]">
                  Double-Safety Verified against Slip Photo
                </span>
                <p className="text-[11px] text-[#6d6265]">
                  Confirm measurements, delivery date, and ₹ billing match the paper receipt.
                </p>
              </div>
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-[#6d6265]">Verified by:</span>
              <input
                type="text"
                value={verifiedBy}
                onChange={(e) =>
                  onChangeVerification(ocrConfidence, e.target.value)
                }
                placeholder="Staff name (e.g. Master Ji)"
                className="flex-1 rounded-lg border border-[#e6ddd0] bg-white px-2.5 py-1 text-xs outline-none focus:border-[#5b1e31]"
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => uploadInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#d9cebe] bg-[#faf7f2] px-4 py-8 text-center transition hover:border-[#5b1e31]"
        >
          <Camera className="mb-2 h-8 w-8 text-[#5b1e31]/70" />
          <p className="text-xs font-semibold text-[#1f1a1c]">
            No slip photo attached yet
          </p>
          <p className="mt-1 max-w-xs text-[11px] text-[#6d6265]">
            Snap a photo of the handwritten receipt to keep permanent proof beside manual entries &amp; unlock Gemini AI extraction.
          </p>
        </div>
      )}

      {/* Webcam Modal */}
      {webcamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Capture Tailoring Slip</h4>
              <button
                type="button"
                onClick={stopWebcam}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {webcamError ? (
              <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                {webcamError}
              </p>
            ) : (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-xl bg-black"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={stopWebcam}
                    className="rounded-lg border border-[#e6ddd0] px-4 py-2 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={captureWebcamFrame}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b1e31] px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Camera className="h-4 w-4" /> Capture Photo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox */}
      {lightboxOpen && slipPhotoUrl && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={slipPhotoUrl}
            alt="Full slip preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      )}
    </div>
  );
}
