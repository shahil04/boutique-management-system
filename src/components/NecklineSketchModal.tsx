"use client";

import React, { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, RotateCcw, Save, X } from "lucide-react";

interface NecklineSketchModalProps {
  open: boolean;
  onClose: () => void;
  onSaveSketch: (url: string, label: string) => void;
}

const NECK_TEMPLATES = [
  { id: "blank", label: "Blank Canvas" },
  { id: "round", label: "Round / Matka" },
  { id: "vneck", label: "Deep V / Sweetheart" },
  { id: "boat", label: "Boat + Keyhole" },
];

export default function NecklineSketchModal({
  open,
  onClose,
  onSaveSketch,
}: NecklineSketchModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState("#5b1e31");
  const [label, setLabel] = useState("Back Neck Sketch");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const drawGuide = (templateId: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#fffdf9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Light garment shoulder outline
    ctx.strokeStyle = "#d8cfc2";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(60, 50);
    ctx.lineTo(150, 35);
    ctx.moveTo(460, 50);
    ctx.lineTo(370, 35);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#b5a695";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (templateId === "round") {
      ctx.moveTo(150, 35);
      ctx.bezierCurveTo(155, 190, 365, 190, 370, 35);
    } else if (templateId === "vneck") {
      ctx.moveTo(150, 35);
      ctx.quadraticCurveTo(200, 130, 260, 195);
      ctx.quadraticCurveTo(320, 130, 370, 35);
    } else if (templateId === "boat") {
      ctx.moveTo(135, 40);
      ctx.quadraticCurveTo(260, 95, 385, 40);
      ctx.moveTo(260, 105);
      ctx.arc(260, 145, 34, -Math.PI / 2, Math.PI * 1.5);
    }
    ctx.stroke();
  };

  useEffect(() => {
    if (open) {
      drawGuide("blank");
    }
  }, [open]);

  if (!open) return null;

  const getCoords = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = tool === "eraser" ? "#fffdf9" : penColor;
    ctx.lineWidth = tool === "eraser" ? 16 : 3.2;
    setDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    setDrawing(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError("");
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, prefix: "sketch" }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Could not save sketch");
      }
      onSaveSketch(json.url, label.trim() || "Neckline Sketch");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sketch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-[#e6ddd0] bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e6ddd0] bg-[#faf7f2] px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-[#1f1a1c]">
              Neckline &amp; Border Sketch Pad (गला / डिज़ाइन स्केच)
            </h3>
            <p className="text-xs text-[#6d6265]">
              Draw custom neck shapes, piping, or dori placement directly on the order.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6d6265] hover:bg-[#ede5d8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {NECK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => drawGuide(tpl.id)}
                  className="rounded-lg border border-[#e6ddd0] bg-[#faf7f2] px-2.5 py-1 text-xs font-medium text-[#4a4043] hover:border-[#5b1e31] hover:text-[#5b1e31]"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTool("pen")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  tool === "pen"
                    ? "bg-[#5b1e31] text-white"
                    : "border border-[#e6ddd0] text-[#4a4043]"
                }`}
              >
                <PenTool className="h-3.5 w-3.5" /> Pen
              </button>
              <button
                type="button"
                onClick={() => setTool("eraser")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  tool === "eraser"
                    ? "bg-[#5b1e31] text-white"
                    : "border border-[#e6ddd0] text-[#4a4043]"
                }`}
              >
                <Eraser className="h-3.5 w-3.5" /> Eraser
              </button>
              {["#5b1e31", "#1f2937", "#b47b2b"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setPenColor(c);
                    setTool("pen");
                  }}
                  aria-label={`Pen color ${c}`}
                  className={`h-6 w-6 rounded-full border-2 ${
                    penColor === c && tool === "pen"
                      ? "border-[#1f1a1c] scale-110"
                      : "border-white shadow-xs"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onClick={() => drawGuide("blank")}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e6ddd0] px-2.5 py-1 text-xs text-[#6d6265] hover:bg-[#faf7f2]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#d8cfc2] bg-[#fffdf9]">
            <canvas
              ref={canvasRef}
              width={520}
              height={320}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full touch-none cursor-crosshair"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sketch label (e.g. Back Neck Design)"
              className="w-full sm:w-64 rounded-lg border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#e6ddd0] px-4 py-2 text-sm font-medium text-[#4a4043] hover:bg-[#faf7f2]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b1e31] px-4 py-2 text-sm font-medium text-white hover:bg-[#471625] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Attach Sketch"}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
