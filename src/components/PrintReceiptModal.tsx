"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import {
  BoutiqueOrder,
  MEASUREMENT_FIELDS,
  ShopSettings,
  formatINR,
} from "@/lib/types";

interface PrintReceiptModalProps {
  order: BoutiqueOrder | null;
  settings: ShopSettings;
  autoSend?: boolean;
  onClose: () => void;
}

export default function PrintReceiptModal({
  order,
  settings,
  autoSend = false,
  onClose,
}: PrintReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const autoSendStartedRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const createReceiptPdf = useCallback(async (): Promise<File> => {
    if (!order) {
      throw new Error("Receipt is not ready to export.");
    }
    const receipt = receiptRef.current;
    if (!receipt) {
      throw new Error("Receipt is not ready to export.");
    }

    const images = Array.from(receipt.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve, reject) => {
            if (image.complete) {
              if (image.naturalWidth > 0) resolve();
              else reject(new Error("A receipt photo could not be loaded."));
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener(
              "error",
              () => reject(new Error("A receipt photo could not be loaded.")),
              { once: true }
            );
          })
      )
    );

    const canvas = await html2canvas(receipt, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowHeight: Math.max(window.innerHeight, receipt.scrollHeight + 200),
      onclone: (clonedDocument, clonedReceipt) => {
        let parent = clonedReceipt.parentElement;
        while (parent && parent !== clonedDocument.body) {
          parent.style.maxHeight = "none";
          parent.style.overflow = "visible";
          parent = parent.parentElement;
        }
      },
    });

    const margin = 8;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const sourcePageHeight = Math.floor(
      (contentHeight * canvas.width) / contentWidth
    );
    const pageCanvas = document.createElement("canvas");
    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) {
      throw new Error("Could not prepare the receipt PDF.");
    }

    pageCanvas.width = canvas.width;
    const pageCount = Math.ceil(canvas.height / sourcePageHeight);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const sourceY = pageIndex * sourcePageHeight;
      const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
      pageCanvas.height = sliceHeight;
      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (pageIndex > 0) pdf.addPage();
      const renderedHeight = (sliceHeight * contentWidth) / canvas.width;
      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.96),
        "JPEG",
        margin,
        margin,
        contentWidth,
        renderedHeight
      );
    }

    const filename = `tailoring-receipt-${order.serial_no.replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )}.pdf`;
    return new File([pdf.output("blob")], filename, {
      type: "application/pdf",
    });
  }, [order]);

  const handleSendPdf = useCallback(async () => {
    if (!order) return;

    setSharing(true);
    setShareMessage("");
    try {
      const file = await createReceiptPdf();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/orders/${order.id}/receipt`, {
        method: "POST",
        body,
      });
      const result = (await response.json()) as {
        sent?: boolean;
        error?: string;
      };
      if (!response.ok || !result.sent) {
        throw new Error(result.error || "Could not send the receipt PDF.");
      }
      setShareMessage(`PDF sent to ${order.phone} on WhatsApp.`);
    } catch (error) {
      setShareMessage(
        error instanceof Error
          ? error.message
          : "Could not send the receipt PDF."
      );
    } finally {
      setSharing(false);
    }
  }, [createReceiptPdf, order]);

  useEffect(() => {
    if (!autoSend) {
      autoSendStartedRef.current = false;
      return;
    }
    if (!order || autoSendStartedRef.current) return;

    autoSendStartedRef.current = true;
    void handleSendPdf();
  }, [autoSend, handleSendPdf, order]);

  if (!order) return null;

  const handleDownloadPdf = async () => {
    setSharing(true);
    setShareMessage("");
    try {
      const file = await createReceiptPdf();
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      setShareMessage("Receipt PDF downloaded.");
    } catch (error) {
      setShareMessage(
        error instanceof Error
          ? error.message
          : "Could not create the receipt PDF."
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="no-print flex items-center justify-between border-b border-[#e6ddd0] px-5 py-3">
          <h3 className="text-sm font-semibold text-[#1f1a1c]">
            Printable Tailoring Slip — #{order.serial_no}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSendPdf()}
              disabled={sharing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              <MessageCircle className="h-4 w-4" />
              {sharing ? "Sending PDF..." : "Send PDF on WhatsApp"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={sharing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6ddd0] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a4043] hover:bg-[#faf7f2] disabled:opacity-60"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#471625]"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#6d6265] hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {shareMessage && (
          <div
            role="status"
            className="no-print border-b border-[#e6ddd0] bg-[#faf7f2] px-5 py-2 text-xs text-[#4a4043]"
          >
            <p>{shareMessage}</p>
            {shareMessage && (
              <p className="mt-1 text-[11px] text-[#6d6265]">
                Only send receipts to customers who have opted in to WhatsApp
                messages. Messages outside the 24-hour customer-service window
                require an approved receipt template.
              </p>
            )}
          </div>
        )}

        <div ref={receiptRef} className="bg-white p-6 text-[#1f1a1c]">
          <div className="border-b-2 border-[#5b1e31] pb-4 text-center">
            <h1 className="text-xl font-bold text-[#5b1e31]">
              {settings.shop_name}
            </h1>
            {(settings.shop_address || settings.shop_phone) && (
              <p className="mt-0.5 text-xs text-[#6d6265]">
                {[settings.shop_address, settings.shop_phone]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-3 text-xs">
            <div>
              <p>
                <span className="text-[#6d6265]">Serial No:</span>{" "}
                <strong className="text-sm">#{order.serial_no}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Customer:</span>{" "}
                <strong>{order.customer_name}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Phone:</span> {order.phone}
              </p>
              {order.address && (
                <p className="mt-1">
                  <span className="text-[#6d6265]">Address:</span>{" "}
                  {order.address}
                </p>
              )}
            </div>
            <div className="text-right">
              <p>
                <span className="text-[#6d6265]">Order Date:</span>{" "}
                {order.order_date}
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Delivery Date:</span>{" "}
                <strong className="text-[#5b1e31]">{order.delivery_date}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Garment:</span>{" "}
                <strong>{order.garment_type || "Custom Tailoring"}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Stage:</span> {order.status}
              </p>
            </div>
          </div>

          {(order.slip_photo_url || order.design_photos.length > 0) && (
            <div className="mt-4 break-inside-avoid">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
                Slip &amp; Design References
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {order.slip_photo_url && (
                  <figure className="rounded-lg border border-[#e6ddd0] p-2">
                    <img
                      src={order.slip_photo_url}
                      alt="Original tailoring slip"
                      className="h-40 w-full object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] text-[#6d6265]">
                      Original Slip
                    </figcaption>
                  </figure>
                )}
                {order.design_photos.map((photo, index) => (
                  <figure
                    key={`${photo.url}-${index}`}
                    className="rounded-lg border border-[#e6ddd0] p-2"
                  >
                    <img
                      src={photo.url}
                      alt={photo.label}
                      className="h-40 w-full object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] text-[#6d6265]">
                      {photo.label} ({photo.kind})
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* Measurements Summary */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
              Measurements (नाप)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {MEASUREMENT_FIELDS.map((f) => (
                <div
                  key={f.key}
                  className="rounded-lg border border-[#e6ddd0] px-2.5 py-1.5 text-xs"
                >
                  <div className="text-[10px] text-[#6d6265]">
                    {f.label} ({f.hindi})
                  </div>
                  <div className="font-semibold">
                    {order.measurements[f.key] || "—"}
                  </div>
                </div>
              ))}
            </div>
            {order.measurements.extra_notes && (
              <p className="mt-2 rounded-lg border border-[#e6ddd0] bg-[#faf7f2] p-2.5 text-xs">
                <strong>Notes:</strong> {order.measurements.extra_notes}
              </p>
            )}
          </div>

          {/* Billing Table */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
              Charges &amp; Balance
            </h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#e6ddd0] text-left text-[#6d6265]">
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.length > 0 ? (
                  order.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-[#f1ebe2]">
                      <td className="py-1.5">{item.description}</td>
                      <td className="py-1.5 text-right font-medium">
                        {formatINR(item.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-[#f1ebe2]">
                    <td className="py-1.5">Tailoring Charges</td>
                    <td className="py-1.5 text-right font-medium">
                      {formatINR(order.total_amount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-3 flex justify-end">
              <div className="w-56 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6d6265]">Total:</span>
                  <span className="font-bold">{formatINR(order.total_amount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Advance Paid:</span>
                  <span className="font-semibold">
                    {formatINR(order.advance_paid)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#e6ddd0] pt-1 text-sm font-bold text-[#5b1e31]">
                  <span>Balance Due:</span>
                  <span>{formatINR(order.balance_due)}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-dashed border-[#e6ddd0] pt-3 text-center text-[11px] text-[#6d6265]">
            Thank you for visiting {settings.shop_name}! Please bring this slip at delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
